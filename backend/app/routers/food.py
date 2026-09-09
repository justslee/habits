"""Food API — catalogue, pantry, two-week cycles, the deck, the plan, taste profile.

GET    /api/v1/food/recipes                 catalogue (seeds on first call)
GET    /api/v1/food/recipes/{id}
PATCH  /api/v1/food/recipes/{id}            status / notes / user_rating
PATCH  /api/v1/food/recipes/{id}/ingredients/{rid}   flip essential
GET    /api/v1/food/pantry
PUT    /api/v1/food/pantry                  bulk set states
POST   /api/v1/food/cycles                  start a cycle (builds the deck)
GET    /api/v1/food/cycles/current
GET    /api/v1/food/cycles/{id}/deck?spare=1
POST   /api/v1/food/cycles/{id}/swipe
POST   /api/v1/food/cycles/{id}/plan        lay out meals
GET    /api/v1/food/cycles/{id}/plan
POST   /api/v1/food/cycles/{id}/meals/{mid}/cooked
POST   /api/v1/food/cycles/{id}/complete    decay weights, close
GET    /api/v1/food/taste
"""

from __future__ import annotations

import datetime

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from app.db.database import get_db
from app.db.seed_food import seed_food
from app.models.food import CycleMeal, MealCycle, PantryItem, Recipe, RecipeIngredient
from app.models.user import User
from app.services import food_planner as fp

router = APIRouter(prefix="/api/v1/food", tags=["food"])


# --- helpers ---------------------------------------------------------------


def _user(db: Session) -> User:
    user = db.query(User).first()
    if not user:
        raise HTTPException(status_code=404, detail="No user found")
    return user


def _ensure_seeded(db: Session, user: User) -> None:
    if db.query(Recipe).filter(Recipe.user_id == user.id).count() == 0:
        seed_food(db, user.id)


def _cycle(db: Session, user: User, cycle_id: int) -> MealCycle:
    c = (
        db.query(MealCycle)
        .filter(MealCycle.id == cycle_id, MealCycle.user_id == user.id)
        .first()
    )
    if not c:
        raise HTTPException(status_code=404, detail="Cycle not found")
    return c


# --- schemas ---------------------------------------------------------------


class IngredientOut(BaseModel):
    id: int
    name: str
    quantity: float | None
    unit: str | None
    essential: bool
    essential_reason: str | None
    preferred_store: str | None
    shelf_stable: bool


class RecipeOut(BaseModel):
    id: int
    slug: str
    title: str
    source_site: str | None
    source_url: str | None
    rating: float | None
    cuisine: str | None
    protein_source: str | None
    prep_minutes: int
    cook_minutes: int
    total_minutes: int
    servings: int
    protein_g_per_serving: float | None
    prep_days: int
    reheat: str
    status: str
    affinity: float
    times_cooked: int
    last_cooked: datetime.date | None
    user_rating: int | None
    notes: str | None
    hue: int | None
    ingredients: list[IngredientOut]


def _recipe_out(r: Recipe) -> RecipeOut:
    return RecipeOut(
        id=r.id,
        slug=r.slug,
        title=r.title,
        source_site=r.source_site,
        source_url=r.source_url,
        rating=r.rating,
        cuisine=r.cuisine,
        protein_source=r.protein_source,
        prep_minutes=r.prep_minutes,
        cook_minutes=r.cook_minutes,
        total_minutes=r.total_minutes,
        servings=r.servings,
        protein_g_per_serving=r.protein_g_per_serving,
        prep_days=r.prep_days,
        reheat=r.reheat,
        status=r.status,
        affinity=round(r.affinity or 0, 3),
        times_cooked=r.times_cooked or 0,
        last_cooked=r.last_cooked,
        user_rating=r.user_rating,
        notes=r.notes,
        hue=r.hue,
        ingredients=[
            IngredientOut(
                id=ri.id,
                name=ri.ingredient.name,
                quantity=ri.quantity,
                unit=ri.unit,
                essential=ri.essential,
                essential_reason=ri.essential_reason,
                preferred_store=ri.ingredient.preferred_store,
                shelf_stable=ri.ingredient.shelf_stable,
            )
            for ri in r.ingredients
        ],
    )


class RecipePatch(BaseModel):
    status: str | None = Field(default=None, pattern="^(candidate|proven|retired)$")
    notes: str | None = None
    user_rating: int | None = Field(default=None, ge=1, le=5)


class EssentialPatch(BaseModel):
    essential: bool


class PantryOut(BaseModel):
    ingredient_id: int
    name: str
    state: str
    shelf_stable: bool
    last_confirmed: datetime.date | None


class PantryPut(BaseModel):
    items: list[dict] = Field(description="[{ingredient_id, state}]")


class CycleCreate(BaseModel):
    start_date: datetime.date | None = None
    travel_days: list[datetime.date] = Field(default_factory=list)
    eat_out_days: int = Field(default=2, ge=0, le=14)
    shop_date: datetime.date | None = None


class CycleOut(BaseModel):
    id: int
    start_date: datetime.date
    end_date: datetime.date
    shop_date: datetime.date | None
    status: str
    travel_days: list[str]
    eat_out_days: int
    eating_days: int
    deck_size: int


def _cycle_out(c: MealCycle) -> CycleOut:
    return CycleOut(
        id=c.id,
        start_date=c.start_date,
        end_date=c.end_date,
        shop_date=c.shop_date,
        status=c.status,
        travel_days=list(c.travel_days or []),
        eat_out_days=c.eat_out_days,
        eating_days=fp.eating_days(c),
        deck_size=len(c.deck or []),
    )


class DeckOut(BaseModel):
    cycle_id: int
    eating_days: int
    coverage: int
    enough: bool
    exhausted: bool
    remaining_count: int
    distinct_ingredients: int
    ingredient_cap: int
    kept: list[RecipeOut]
    cards: list[RecipeOut]
    learned: list[str]


def _deck_out(
    cycle: MealCycle, st: fp.DeckState, learned: list[str] | None = None, cards: int = 2
) -> DeckOut:
    return DeckOut(
        cycle_id=cycle.id,
        eating_days=st.eating_days,
        coverage=st.coverage,
        enough=st.enough,
        exhausted=st.exhausted,
        remaining_count=len(st.remaining),
        distinct_ingredients=st.distinct_ingredients,
        ingredient_cap=st.ingredient_cap,
        kept=[_recipe_out(r) for r in st.kept],
        cards=[_recipe_out(r) for r in st.remaining[:cards]],
        learned=learned or [],
    )


class SwipeIn(BaseModel):
    recipe_id: int
    decision: str = Field(pattern="^(keep|skip)$")
    dwell_ms: int | None = Field(default=None, ge=0)
    spare: bool = False


class MealOut(BaseModel):
    id: int
    recipe: RecipeOut
    cook_date: datetime.date | None
    days_covered: list[str]
    servings: int
    status: str
    rating: int | None


class PlanOut(BaseModel):
    cycle: CycleOut
    meals: list[MealOut]
    covered_days: int
    open_days: int


def _plan_out(c: MealCycle) -> PlanOut:
    meals = [
        MealOut(
            id=m.id,
            recipe=_recipe_out(m.recipe),
            cook_date=m.cook_date,
            days_covered=list(m.days_covered or []),
            servings=m.servings,
            status=m.status,
            rating=m.rating,
        )
        for m in c.meals
    ]
    covered = sum(len(m.days_covered or []) for m in c.meals)
    return PlanOut(
        cycle=_cycle_out(c),
        meals=meals,
        covered_days=covered,
        open_days=max(0, fp.eating_days(c) - covered),
    )


class CookedIn(BaseModel):
    cooked: bool = True
    rating: int | None = Field(default=None, ge=-1, le=1)


# --- recipes ---------------------------------------------------------------


@router.get("/recipes", response_model=list[RecipeOut])
def list_recipes(
    status: str | None = Query(default=None), db: Session = Depends(get_db)
):
    user = _user(db)
    _ensure_seeded(db, user)
    q = db.query(Recipe).filter(Recipe.user_id == user.id)
    if status:
        q = q.filter(Recipe.status == status)
    return [
        _recipe_out(r) for r in q.order_by(Recipe.affinity.desc(), Recipe.title).all()
    ]


@router.get("/recipes/{recipe_id}", response_model=RecipeOut)
def get_recipe(recipe_id: int, db: Session = Depends(get_db)):
    user = _user(db)
    r = (
        db.query(Recipe)
        .filter(Recipe.id == recipe_id, Recipe.user_id == user.id)
        .first()
    )
    if not r:
        raise HTTPException(status_code=404, detail="Recipe not found")
    return _recipe_out(r)


@router.patch("/recipes/{recipe_id}", response_model=RecipeOut)
def patch_recipe(recipe_id: int, payload: RecipePatch, db: Session = Depends(get_db)):
    user = _user(db)
    r = (
        db.query(Recipe)
        .filter(Recipe.id == recipe_id, Recipe.user_id == user.id)
        .first()
    )
    if not r:
        raise HTTPException(status_code=404, detail="Recipe not found")
    if payload.status is not None:
        r.status = payload.status  # only the owner retires or promotes by hand
    if payload.notes is not None:
        r.notes = payload.notes
    if payload.user_rating is not None:
        r.user_rating = payload.user_rating
    db.commit()
    db.refresh(r)
    return _recipe_out(r)


@router.patch("/recipes/{recipe_id}/ingredients/{ri_id}", response_model=RecipeOut)
def patch_essential(
    recipe_id: int, ri_id: int, payload: EssentialPatch, db: Session = Depends(get_db)
):
    user = _user(db)
    ri = (
        db.query(RecipeIngredient)
        .join(Recipe)
        .filter(
            RecipeIngredient.id == ri_id,
            Recipe.id == recipe_id,
            Recipe.user_id == user.id,
        )
        .first()
    )
    if not ri:
        raise HTTPException(status_code=404, detail="Ingredient not found")
    ri.essential = payload.essential
    ri.essential_reason = (
        (ri.essential_reason or "") + " (set by owner)"
        if "(set by owner)" not in (ri.essential_reason or "")
        else ri.essential_reason
    )
    db.commit()
    return _recipe_out(ri.recipe)


# --- pantry ----------------------------------------------------------------


@router.get("/pantry", response_model=list[PantryOut])
def get_pantry(db: Session = Depends(get_db)):
    user = _user(db)
    _ensure_seeded(db, user)
    rows = db.query(PantryItem).filter(PantryItem.user_id == user.id).all()
    return [
        PantryOut(
            ingredient_id=p.ingredient_id,
            name=p.ingredient.name,
            state=p.state,
            shelf_stable=p.ingredient.shelf_stable,
            last_confirmed=p.last_confirmed,
        )
        for p in sorted(rows, key=lambda p: p.ingredient.name)
    ]


@router.put("/pantry", response_model=list[PantryOut])
def put_pantry(payload: PantryPut, db: Session = Depends(get_db)):
    user = _user(db)
    today = datetime.date.today()
    for item in payload.items:
        iid, state = int(item["ingredient_id"]), str(item["state"])
        if state not in ("gone", "some", "plenty"):
            raise HTTPException(status_code=422, detail=f"bad state {state}")
        row = (
            db.query(PantryItem)
            .filter(PantryItem.user_id == user.id, PantryItem.ingredient_id == iid)
            .first()
        )
        if row is None:
            row = PantryItem(user_id=user.id, ingredient_id=iid)
            db.add(row)
        row.state = state
        row.last_confirmed = today
    db.commit()
    return get_pantry(db)


# --- cycles ----------------------------------------------------------------


@router.post("/cycles", response_model=CycleOut)
def create_cycle(payload: CycleCreate, db: Session = Depends(get_db)):
    user = _user(db)
    _ensure_seeded(db, user)
    start = payload.start_date or datetime.date.today()
    cycle = MealCycle(
        user_id=user.id,
        start_date=start,
        end_date=start + datetime.timedelta(days=fp.CYCLE_DAYS - 1),
        shop_date=payload.shop_date or start,
        status="deck",
        travel_days=[d.isoformat() for d in payload.travel_days],
        eat_out_days=payload.eat_out_days,
    )
    db.add(cycle)
    db.flush()
    cycle.deck = fp.build_deck(db, user.id, cycle)
    db.commit()
    db.refresh(cycle)
    return _cycle_out(cycle)


@router.get("/cycles/current", response_model=CycleOut | None)
def current_cycle(db: Session = Depends(get_db)):
    user = _user(db)
    c = (
        db.query(MealCycle)
        .filter(MealCycle.user_id == user.id, MealCycle.status != "done")
        .order_by(MealCycle.start_date.desc())
        .first()
    )
    return _cycle_out(c) if c else None


@router.get("/cycles/{cycle_id}/deck", response_model=DeckOut)
def get_deck(cycle_id: int, spare: bool = False, db: Session = Depends(get_db)):
    user = _user(db)
    cycle = _cycle(db, user, cycle_id)
    return _deck_out(cycle, fp.deck_state(db, user.id, cycle, spare=spare))


@router.post("/cycles/{cycle_id}/swipe", response_model=DeckOut)
def swipe(cycle_id: int, payload: SwipeIn, db: Session = Depends(get_db)):
    user = _user(db)
    cycle = _cycle(db, user, cycle_id)
    if payload.recipe_id not in (cycle.deck or []):
        raise HTTPException(
            status_code=422, detail="Recipe is not in this cycle's deck"
        )
    recipe = db.query(Recipe).filter(Recipe.id == payload.recipe_id).first()
    learned = fp.record_swipe(
        db, user.id, cycle, recipe, payload.decision, payload.dwell_ms
    )
    # a kept spare satisfies the request; the deck stops again unless asked for another
    st = fp.deck_state(
        db, user.id, cycle, spare=payload.spare and payload.decision != "keep"
    )
    return _deck_out(cycle, st, learned)


@router.post("/cycles/{cycle_id}/plan", response_model=PlanOut)
def build_plan(cycle_id: int, db: Session = Depends(get_db)):
    user = _user(db)
    cycle = _cycle(db, user, cycle_id)
    if not fp.kept_recipes(db, cycle):
        raise HTTPException(status_code=422, detail="Keep at least one meal first")
    fp.layout_plan(db, cycle)
    return _plan_out(cycle)


@router.get("/cycles/{cycle_id}/plan", response_model=PlanOut)
def get_plan(cycle_id: int, db: Session = Depends(get_db)):
    user = _user(db)
    return _plan_out(_cycle(db, user, cycle_id))


@router.post("/cycles/{cycle_id}/meals/{meal_id}/cooked", response_model=PlanOut)
def mark_cooked(
    cycle_id: int, meal_id: int, payload: CookedIn, db: Session = Depends(get_db)
):
    user = _user(db)
    cycle = _cycle(db, user, cycle_id)
    meal = (
        db.query(CycleMeal)
        .filter(CycleMeal.id == meal_id, CycleMeal.cycle_id == cycle.id)
        .first()
    )
    if not meal:
        raise HTTPException(status_code=404, detail="Meal not found")
    fp.record_cooked(db, meal, payload.cooked, payload.rating)
    db.refresh(cycle)
    return _plan_out(cycle)


@router.post("/cycles/{cycle_id}/complete", response_model=CycleOut)
def complete_cycle(cycle_id: int, db: Session = Depends(get_db)):
    user = _user(db)
    cycle = _cycle(db, user, cycle_id)
    cycle.status = "done"
    db.commit()
    fp.decay_weights(db, user.id)
    from app.services.cart_service import reset_cycle_counters

    reset_cycle_counters(db, user.id)
    db.refresh(cycle)
    return _cycle_out(cycle)


# --- taste -----------------------------------------------------------------


@router.get("/taste")
def taste(db: Session = Depends(get_db)):
    user = _user(db)
    _ensure_seeded(db, user)
    return {"profile": fp.taste_profile(db, user.id)}


# --- bags (F3) ---------------------------------------------------------------

from app.models.food import FoodSettings, MerchantAccount, ShoppingBag  # noqa: E402
from app.services import bag_builder  # noqa: E402


class BagOut(BaseModel):
    id: int
    store: str
    name: str
    items: list[dict]
    goods_total: float
    minimum: float
    delivery_fee: float
    short: bool
    shortfall: float
    projected_waste: float
    status: str


class BagsOut(BaseModel):
    cycle_id: int
    bags: list[BagOut]
    goods_total: float
    fees_total: float
    total: float
    budget_per_cycle: float
    over_budget: float
    store_count: int


def _bags_out(db: Session, user: User, cycle: MealCycle) -> BagsOut:
    settings = bag_builder.ensure_food_settings(db, user.id)
    merchants = bag_builder.ensure_merchants(db, user.id)
    bags = (
        db.query(ShoppingBag)
        .filter(ShoppingBag.cycle_id == cycle.id)
        .order_by(ShoppingBag.goods_total.desc())
        .all()
    )
    goods = round(sum(b.goods_total for b in bags), 2)
    fees = round(sum(b.delivery_fee for b in bags), 2)
    return BagsOut(
        cycle_id=cycle.id,
        bags=[
            BagOut(
                id=b.id,
                store=b.store,
                name=merchants[b.store].name if b.store in merchants else b.store,
                items=b.items or [],
                goods_total=b.goods_total,
                minimum=b.minimum,
                delivery_fee=b.delivery_fee,
                short=b.short,
                shortfall=b.shortfall,
                projected_waste=b.projected_waste,
                status=b.status,
            )
            for b in bags
        ],
        goods_total=goods,
        fees_total=fees,
        total=round(goods + fees, 2),
        budget_per_cycle=settings.budget_per_cycle,
        over_budget=round(max(0.0, goods + fees - settings.budget_per_cycle), 2),
        store_count=len(bags),
    )


@router.post("/cycles/{cycle_id}/bags", response_model=BagsOut)
def build_bags(cycle_id: int, db: Session = Depends(get_db)):
    user = _user(db)
    cycle = _cycle(db, user, cycle_id)
    if not cycle.meals:
        raise HTTPException(status_code=422, detail="Build the plan first")
    bag_builder.build_bags(db, user.id, cycle)
    return _bags_out(db, user, cycle)


@router.get("/cycles/{cycle_id}/bags", response_model=BagsOut)
def get_bags(cycle_id: int, db: Session = Depends(get_db)):
    user = _user(db)
    return _bags_out(db, user, _cycle(db, user, cycle_id))


@router.post("/cycles/{cycle_id}/bags/approve", response_model=BagsOut)
def approve_bags(cycle_id: int, db: Session = Depends(get_db)):
    user = _user(db)
    cycle = _cycle(db, user, cycle_id)
    if not db.query(ShoppingBag).filter(ShoppingBag.cycle_id == cycle.id).count():
        raise HTTPException(status_code=422, detail="Build the bags first")
    bag_builder.approve_bags(db, cycle)
    return _bags_out(db, user, cycle)


class MerchantOut(BaseModel):
    store: str
    name: str
    site_url: str | None
    minimum: float
    delivery_fee: float
    enabled: bool
    supervised: bool


class MerchantPatch(BaseModel):
    minimum: float | None = Field(default=None, ge=0)
    delivery_fee: float | None = Field(default=None, ge=0)
    enabled: bool | None = None
    supervised: bool | None = None


@router.get("/merchants", response_model=list[MerchantOut])
def list_merchants(db: Session = Depends(get_db)):
    user = _user(db)
    ms = bag_builder.ensure_merchants(db, user.id)
    return [
        MerchantOut(
            store=m.store,
            name=m.name,
            site_url=m.site_url,
            minimum=m.minimum,
            delivery_fee=m.delivery_fee,
            enabled=m.enabled,
            supervised=m.supervised,
        )
        for m in ms.values()
    ]


@router.patch("/merchants/{store}", response_model=MerchantOut)
def patch_merchant(store: str, payload: MerchantPatch, db: Session = Depends(get_db)):
    user = _user(db)
    m = bag_builder.ensure_merchants(db, user.id).get(store)
    if not m:
        raise HTTPException(status_code=404, detail="Unknown store")
    for k, v in payload.model_dump(exclude_none=True).items():
        setattr(m, k, v)
    db.commit()
    return MerchantOut(
        store=m.store,
        name=m.name,
        site_url=m.site_url,
        minimum=m.minimum,
        delivery_fee=m.delivery_fee,
        enabled=m.enabled,
        supervised=m.supervised,
    )


class SettingsOut(BaseModel):
    budget_per_cycle: float
    per_order_cap: float
    per_cycle_cap: float
    ordering_enabled: bool
    supervised_cycles_remaining: int
    approval_ttl_minutes: int
    total_tolerance: float


class SettingsPatch(BaseModel):
    budget_per_cycle: float | None = Field(default=None, ge=0)
    per_order_cap: float | None = Field(default=None, ge=0)
    per_cycle_cap: float | None = Field(default=None, ge=0)
    ordering_enabled: bool | None = None
    supervised_cycles_remaining: int | None = Field(default=None, ge=0)


def _settings_out(s: FoodSettings) -> SettingsOut:
    return SettingsOut(
        budget_per_cycle=s.budget_per_cycle,
        per_order_cap=s.per_order_cap,
        per_cycle_cap=s.per_cycle_cap,
        ordering_enabled=s.ordering_enabled,
        supervised_cycles_remaining=s.supervised_cycles_remaining,
        approval_ttl_minutes=s.approval_ttl_minutes,
        total_tolerance=s.total_tolerance,
    )


@router.get("/settings", response_model=SettingsOut)
def get_settings(db: Session = Depends(get_db)):
    user = _user(db)
    return _settings_out(bag_builder.ensure_food_settings(db, user.id))


@router.patch("/settings", response_model=SettingsOut)
def patch_settings(payload: SettingsPatch, db: Session = Depends(get_db)):
    user = _user(db)
    s = bag_builder.ensure_food_settings(db, user.id)
    for k, v in payload.model_dump(exclude_none=True).items():
        setattr(s, k, v)
    db.commit()
    return _settings_out(s)


# --- carts, the payment gate, orders, spend (F4–F5) --------------------------

from app.models.food import CartTask, Order  # noqa: E402
from app.services import cart_service, store_adapters  # noqa: E402


class CartOut(BaseModel):
    id: int
    bag_id: int
    store: str
    name: str
    status: str
    supervised: bool
    cart_lines: list[dict]
    cart_total: float | None
    screenshot_path: str | None
    error: str | None
    attempts: int
    events: list[dict]
    approval_expires_at: datetime.datetime | None
    order: dict | None


def _cart_out(db: Session, user: User, t: CartTask) -> CartOut:
    merchants = bag_builder.ensure_merchants(db, user.id)
    live = (
        db.query(OrderApprovalModel)
        .filter(
            OrderApprovalModel.cart_task_id == t.id,
            OrderApprovalModel.used_at.is_(None),
            OrderApprovalModel.revoked.is_(False),
        )
        .order_by(OrderApprovalModel.id.desc())
        .first()
    )
    order = db.query(Order).filter(Order.cart_task_id == t.id).first()
    return CartOut(
        id=t.id,
        bag_id=t.bag_id,
        store=t.store,
        name=merchants[t.store].name if t.store in merchants else t.store,
        status=t.status,
        supervised=t.supervised,
        cart_lines=t.cart_lines or [],
        cart_total=t.cart_total,
        screenshot_path=t.screenshot_path,
        error=t.error,
        attempts=t.attempts,
        events=t.events or [],
        approval_expires_at=live.expires_at if live else None,
        order={
            "merchant_order_id": order.merchant_order_id,
            "total": order.total,
            "placed_at": order.placed_at.isoformat(),
            "placed_by": order.placed_by,
            "delivery_window": order.delivery_window,
        }
        if order
        else None,
    )


from app.models.food import OrderApproval as OrderApprovalModel  # noqa: E402


def _task(db: Session, user: User, task_id: int) -> CartTask:
    t = (
        db.query(CartTask)
        .join(MealCycle)
        .filter(CartTask.id == task_id, MealCycle.user_id == user.id)
        .first()
    )
    if not t:
        raise HTTPException(status_code=404, detail="Cart not found")
    return t


def _gate(fn):
    try:
        return fn()
    except cart_service.GateError as e:
        raise HTTPException(status_code=403, detail=str(e))


@router.get("/cycles/{cycle_id}/carts", response_model=list[CartOut])
def list_carts(cycle_id: int, run: bool = True, db: Session = Depends(get_db)):
    """Carts for the cycle. Creates queued tasks for approved bags and, in dry-run mode, builds them inline."""
    user = _user(db)
    cycle = _cycle(db, user, cycle_id)
    tasks = cart_service.create_tasks_for_cycle(db, user.id, cycle)
    if run and cart_service.executor_mode() == "dry_run":
        for t in tasks:
            if t.status == "queued":
                cart_service.run_task(db, t, store_adapters.adapter_for(t.store))
    return [_cart_out(db, user, t) for t in tasks]


@router.post("/carts/{task_id}/run", response_model=CartOut)
def run_cart(task_id: int, db: Session = Depends(get_db)):
    user = _user(db)
    t = _task(db, user, task_id)
    if t.status in ("failed", "rejected"):
        t.status = "queued"
    cart_service.run_task(db, t, store_adapters.adapter_for(t.store))
    return _cart_out(db, user, t)


class ApproveIn(BaseModel):
    biometric: bool = False


class ApproveOut(BaseModel):
    cart: CartOut
    token: str
    expires_at: datetime.datetime


@router.post("/carts/{task_id}/approve", response_model=ApproveOut)
def approve_cart(task_id: int, payload: ApproveIn, db: Session = Depends(get_db)):
    user = _user(db)
    t = _task(db, user, task_id)
    a = _gate(
        lambda: cart_service.approve_task(db, user.id, t, biometric=payload.biometric)
    )
    return ApproveOut(
        cart=_cart_out(db, user, t), token=a.token, expires_at=a.expires_at
    )


class PlaceIn(BaseModel):
    token: str


@router.post("/carts/{task_id}/place", response_model=CartOut)
def place_cart(task_id: int, payload: PlaceIn, db: Session = Depends(get_db)):
    user = _user(db)
    t = _task(db, user, task_id)
    _gate(
        lambda: cart_service.place_task(
            db, user.id, t, payload.token, store_adapters.adapter_for(t.store)
        )
    )
    return _cart_out(db, user, t)


class ConfirmIn(BaseModel):
    merchant_order_id: str | None = None


@router.post("/carts/{task_id}/confirm-placed", response_model=CartOut)
def confirm_placed(task_id: int, payload: ConfirmIn, db: Session = Depends(get_db)):
    user = _user(db)
    t = _task(db, user, task_id)
    _gate(
        lambda: cart_service.confirm_human_placed(
            db, user.id, t, payload.merchant_order_id
        )
    )
    return _cart_out(db, user, t)


class RejectIn(BaseModel):
    reason: str | None = None


@router.post("/carts/{task_id}/reject", response_model=CartOut)
def reject_cart(task_id: int, payload: RejectIn, db: Session = Depends(get_db)):
    user = _user(db)
    t = _task(db, user, task_id)
    _gate(lambda: cart_service.reject_task(db, t, payload.reason))
    return _cart_out(db, user, t)


@router.get("/spend")
def spend(db: Session = Depends(get_db)):
    user = _user(db)
    current = (
        db.query(MealCycle)
        .filter(MealCycle.user_id == user.id, MealCycle.status != "done")
        .order_by(MealCycle.start_date.desc())
        .first()
    )
    return cart_service.spend_summary(db, user.id, current)


@router.get("/orders")
def list_orders(db: Session = Depends(get_db)):
    user = _user(db)
    rows = (
        db.query(Order)
        .join(MealCycle)
        .filter(MealCycle.user_id == user.id)
        .order_by(Order.placed_at.desc())
        .limit(50)
        .all()
    )
    return [
        {
            "id": o.id,
            "store": o.store,
            "cycle_id": o.cycle_id,
            "merchant_order_id": o.merchant_order_id,
            "goods_total": o.goods_total,
            "fees": o.fees,
            "total": o.total,
            "placed_at": o.placed_at.isoformat(),
            "placed_by": o.placed_by,
            "line_items": o.line_items or [],
        }
        for o in rows
    ]
