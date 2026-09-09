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
    db.refresh(cycle)
    return _cycle_out(cycle)


# --- taste -----------------------------------------------------------------


@router.get("/taste")
def taste(db: Session = Depends(get_db)):
    user = _user(db)
    _ensure_seeded(db, user)
    return {"profile": fp.taste_profile(db, user.id)}
