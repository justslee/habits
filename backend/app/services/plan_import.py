"""Import a meal plan written elsewhere as the current cycle.

The owner plans dinners in Notion. The spec here is plain data (recipes in cooking order,
each with its dinners, ingredients, steps and reheat notes, plus when the groceries land),
so the plan shows in the Food tab exactly as written instead of being re-planned from the
deck.

- Recipes are upserted by slug: importing an edited plan updates them in place.
- Batches follow the plan's order on consecutive dinners from `start_date`, skip travel, and
  never straddle a trip; a batch cut short by a trip keeps its portions (the spare ones freeze).
- A plan whose groceries are bought is `stocked`: nothing re-lays it, the grocery flow is
  already done, and cook-day pushes follow its dates.
"""

from __future__ import annotations

import datetime

from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from app.models.food import (
    CycleMeal,
    Ingredient,
    MealCycle,
    Recipe,
    RecipeIngredient,
    ShoppingBag,
)
from app.services import calendar_sync


class IngredientSpec(BaseModel):
    name: str = Field(min_length=1, max_length=120)
    quantity: float | None = None
    unit: str | None = Field(default=None, max_length=20)
    note: str | None = Field(default=None, max_length=120)
    optional: bool = False
    # only used when the ingredient is new to the catalogue
    category: str | None = None
    store: str | None = None


class MealSpec(BaseModel):
    slug: str = Field(min_length=1, max_length=80, pattern=r"^[a-z0-9-]+$")
    title: str = Field(min_length=1, max_length=160)
    dinners: int = Field(ge=1, le=10)
    cuisine: str | None = None
    protein_source: str | None = None
    protein_g: float | None = Field(default=None, ge=0)
    active_minutes: int = Field(default=0, ge=0)
    total_minutes: int = Field(default=0, ge=0)
    reheat: str = Field(default="pan", pattern="^(oven|pan|cold|microwave)$")
    reheat_steps: str | None = None
    notes: str | None = None
    ingredients: list[IngredientSpec]
    steps: list[str] = Field(min_length=1)


class PlanSpec(BaseModel):
    title: str
    start_date: datetime.date  # the first dinner: usually the day the groceries arrive
    stocked: bool = True  # groceries already bought
    notes: str | None = None
    meals: list[MealSpec] = Field(min_length=1)


class PlanConflict(Exception):
    """Another cycle is still open."""


def _ingredient(db: Session, spec: IngredientSpec) -> Ingredient:
    name = spec.name.strip().lower()
    ing = db.query(Ingredient).filter(Ingredient.name == name).first()
    if ing is None:
        ing = Ingredient(name=name, category=spec.category, preferred_store=spec.store)
        db.add(ing)
        db.flush()
    return ing


def _upsert_recipe(db: Session, user_id: int, spec: MealSpec, source: str) -> Recipe:
    r = db.query(Recipe).filter(Recipe.slug == spec.slug).first()
    if r is None:
        r = Recipe(user_id=user_id, slug=spec.slug, status="candidate")
        db.add(r)
    r.title = spec.title
    r.source_site = "own"  # the owner's own recipe: nothing to fetch or defer to
    r.source_url = None
    r.cuisine = spec.cuisine
    r.protein_source = spec.protein_source
    r.prep_minutes = spec.active_minutes
    r.cook_minutes = max(0, spec.total_minutes - spec.active_minutes)
    r.servings = spec.dinners
    r.protein_g_per_serving = spec.protein_g
    r.prep_days = spec.dinners
    r.reheat = spec.reheat
    r.batch_ok = True
    r.notes = spec.notes
    r.steps = {
        "steps": list(spec.steps),
        "make_ahead": spec.reheat_steps,
        "source_note": f"From {source}.",
    }
    for old in list(r.ingredients or []):
        db.delete(old)
    db.flush()
    for ing in spec.ingredients:
        db.add(
            RecipeIngredient(
                recipe_id=r.id,
                ingredient_id=_ingredient(db, ing).id,
                quantity=ing.quantity,
                unit=ing.unit,
                essential=not ing.optional,
                note=ing.note,
            )
        )
    db.flush()
    return r


def _dinner_dates(
    db: Session, user_id: int, start: datetime.date, meals: list[MealSpec]
) -> list[list[datetime.date]]:
    """Consecutive non-travel dinners per batch, a batch never spanning a trip."""
    horizon = start + datetime.timedelta(days=90)
    travel = set(calendar_sync.travel_days_between(db, user_id, start, horizon))
    day = start
    out: list[list[datetime.date]] = []
    for meal in meals:
        while day in travel:
            day += datetime.timedelta(days=1)
        span = [day]
        while len(span) < meal.dinners:
            nxt = span[-1] + datetime.timedelta(days=1)
            if nxt in travel:
                break  # the rest of the batch would wait out a trip: cut here
            span.append(nxt)
        out.append(span)
        day = span[-1] + datetime.timedelta(days=1)
    return out


def import_plan(
    db: Session, user_id: int, spec: PlanSpec, *, replace: bool = False
) -> MealCycle:
    open_cycles = (
        db.query(MealCycle)
        .filter(MealCycle.user_id == user_id, MealCycle.status != "done")
        .all()
    )
    if open_cycles and not replace:
        raise PlanConflict(
            f"Cycle {open_cycles[0].id} is still open; import with replace to close it."
        )
    for c in open_cycles:
        untouched = (
            not c.meals
            and not c.swipes
            and not db.query(ShoppingBag).filter(ShoppingBag.cycle_id == c.id).count()
        )
        if untouched:
            db.delete(c)  # started and never used: nothing worth keeping in the history
        else:
            c.status = "done"
    db.flush()

    recipes = [_upsert_recipe(db, user_id, m, spec.title) for m in spec.meals]
    spans = _dinner_dates(db, user_id, spec.start_date, spec.meals)
    end = spans[-1][-1]
    travel = calendar_sync.travel_days_between(db, user_id, spec.start_date, end)
    cycle = MealCycle(
        user_id=user_id,
        start_date=spec.start_date,
        end_date=end,
        shop_date=spec.start_date,
        status="stocked" if spec.stocked else "planned",
        travel_days=[d.isoformat() for d in travel],
        eat_out_days=0,
        deck=[],
        notes=spec.notes,
    )
    db.add(cycle)
    db.flush()
    for pos, (recipe, meal, span) in enumerate(zip(recipes, spec.meals, spans)):
        db.add(
            CycleMeal(
                cycle_id=cycle.id,
                recipe_id=recipe.id,
                cook_date=span[0],
                days_covered=[d.isoformat() for d in span],
                servings=meal.dinners,
                status="planned",
                position=pos,
            )
        )
    db.commit()
    db.refresh(cycle)
    return cycle
