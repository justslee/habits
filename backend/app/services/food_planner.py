"""Food planner — deck sizing and stop rule, scoring, bounded learning, plan layout.

The rules (docs/PLAN-FOOD.md §5):

  eating_days = 14 − travel_days − eat_out_days
  deck length ≤ ceil(eating_days / 2) + 4, ordered by score, 70/30 proven/new
  the deck STOPS once kept recipes' prep_days cover eating_days (one spare on request)

  score = 1 + affinity + mean(feature weights) − recency + overlap + protein − microwave

  learning is small and clamped: keep +0.08/feature +0.10 affinity, skip −0.05/−0.08,
  cooked 👍 +0.15 affinity (→ proven), skipped cooking −0.10; 2 % decay per cycle.
"""

from __future__ import annotations

import datetime
import math
from dataclasses import dataclass, field

from sqlalchemy.orm import Session

from app.models.food import CycleMeal, MealCycle, PreferenceWeight, Recipe, Swipe

CYCLE_DAYS = 14
KEEP_FEATURE_STEP = 0.08
SKIP_FEATURE_STEP = -0.05
KEEP_AFFINITY_STEP = 0.10
SKIP_AFFINITY_STEP = -0.08
DWELL_BONUS_MS = 6000
DWELL_BONUS = 0.02
COOKED_AFFINITY = 0.15
SKIPPED_COOK_AFFINITY = -0.10
DECAY_PER_CYCLE = 0.98
RECENCY_PENALTY = 0.6
OVERLAP_PER_INGREDIENT = 0.08
PROTEIN_BONUS = 0.10
PROTEIN_FLOOR_G = 40
MICROWAVE_PENALTY = 0.4
NEW_SHARE = 0.30
COLD_START_AFFINITY = 0.1


def clamp(v: float, lo: float = -1.0, hi: float = 1.0) -> float:
    return max(lo, min(hi, v))


# ---------------------------------------------------------------------------
# Features
# ---------------------------------------------------------------------------


def features(r: Recipe) -> list[str]:
    return [
        f"cuisine:{(r.cuisine or 'other').lower()}",
        f"reheat:{(r.reheat or 'pan').lower()}",
        f"keeps:{'batch' if (r.prep_days or 0) >= 3 else 'short'}",
        f"time:{'long' if r.total_minutes > 45 else 'quick'}",
        f"source:{(r.source_site or 'other').lower()}",
        f"protein:{(r.protein_source or 'other').lower()}",
    ]


def load_weights(db: Session, user_id: int) -> dict[str, float]:
    return {
        w.feature: w.weight
        for w in db.query(PreferenceWeight)
        .filter(PreferenceWeight.user_id == user_id)
        .all()
    }


def essential_ingredient_ids(r: Recipe) -> set[int]:
    return {ri.ingredient_id for ri in r.ingredients if ri.essential}


# ---------------------------------------------------------------------------
# Cycle arithmetic
# ---------------------------------------------------------------------------


def travel_set(cycle: MealCycle) -> set[datetime.date]:
    return {datetime.date.fromisoformat(d) for d in (cycle.travel_days or [])}


def cycle_days(cycle: MealCycle) -> list[datetime.date]:
    return [
        cycle.start_date + datetime.timedelta(days=i)
        for i in range((cycle.end_date - cycle.start_date).days + 1)
    ]


def eating_days(cycle: MealCycle) -> int:
    travel = travel_set(cycle)
    n_travel = sum(1 for d in cycle_days(cycle) if d in travel)
    return max(0, len(cycle_days(cycle)) - n_travel - (cycle.eat_out_days or 0))


def max_deck_cards(cycle: MealCycle) -> int:
    return math.ceil(eating_days(cycle) / 2) + 4


def kept_recipes(db: Session, cycle: MealCycle) -> list[Recipe]:
    ids = [s.recipe_id for s in cycle.swipes if s.decision == "keep"]
    if not ids:
        return []
    by_id = {r.id: r for r in db.query(Recipe).filter(Recipe.id.in_(ids)).all()}
    return [by_id[i] for i in ids if i in by_id]


def coverage(kept: list[Recipe]) -> int:
    return sum(r.prep_days or 0 for r in kept)


def distinct_ingredients(kept: list[Recipe]) -> int:
    return len({ri.ingredient_id for r in kept for ri in r.ingredients if ri.essential})


# ---------------------------------------------------------------------------
# Scoring and deck
# ---------------------------------------------------------------------------


def score(
    r: Recipe, weights: dict[str, float], kept: list[Recipe], last_cycle_ids: set[int]
) -> float:
    feats = features(r)
    fw = sum(weights.get(f, 0.0) for f in feats) / len(feats)
    recency = RECENCY_PENALTY if r.id in last_cycle_ids else 0.0
    mine = essential_ingredient_ids(r)
    overlap = (
        sum(len(mine & essential_ingredient_ids(k)) for k in kept)
        * OVERLAP_PER_INGREDIENT
    )
    protein = (
        PROTEIN_BONUS if (r.protein_g_per_serving or 0) >= PROTEIN_FLOOR_G else 0.0
    )
    micro = MICROWAVE_PENALTY if (r.reheat or "").lower() == "microwave" else 0.0
    return 1.0 + (r.affinity or 0.0) + fw + overlap + protein - recency - micro


def last_cycle_recipe_ids(
    db: Session, user_id: int, before: MealCycle | None
) -> set[int]:
    q = db.query(MealCycle).filter(MealCycle.user_id == user_id)
    if before is not None:
        q = q.filter(
            MealCycle.id != before.id, MealCycle.start_date < before.start_date
        )
    prev = q.order_by(MealCycle.start_date.desc()).first()
    if not prev:
        return set()
    return {m.recipe_id for m in prev.meals if m.status != "skipped"}


def build_deck(db: Session, user_id: int, cycle: MealCycle) -> list[int]:
    """Ordered recipe ids for the cycle's deck: 70/30 proven/new, capped by coverage need."""
    weights = load_weights(db, user_id)
    last_ids = last_cycle_recipe_ids(db, user_id, cycle)
    pool = (
        db.query(Recipe)
        .filter(Recipe.user_id == user_id, Recipe.status != "retired")
        .all()
    )
    ranked = sorted(pool, key=lambda r: score(r, weights, [], last_ids), reverse=True)
    proven = [r for r in ranked if r.status == "proven"]
    fresh = [r for r in ranked if r.status != "proven"]
    n = min(len(pool), max_deck_cards(cycle))
    n_fresh = min(len(fresh), round(n * NEW_SHARE))
    n_proven = min(len(proven), n - n_fresh)
    chosen = proven[:n_proven] + fresh[:n_fresh]
    # top up from whichever side has more if one side was short
    if len(chosen) < n:
        rest = [r for r in ranked if r not in chosen]
        chosen += rest[: n - len(chosen)]
    chosen.sort(key=lambda r: score(r, weights, [], last_ids), reverse=True)
    return [r.id for r in chosen]


@dataclass
class DeckState:
    eating_days: int
    coverage: int
    enough: bool
    exhausted: bool
    kept: list[Recipe]
    remaining: list[Recipe]  # re-ranked by current score (overlap with kept)
    distinct_ingredients: int
    ingredient_cap: int
    learned: list[str] = field(default_factory=list)


def deck_state(
    db: Session, user_id: int, cycle: MealCycle, *, spare: bool = False
) -> DeckState:
    swiped = {s.recipe_id for s in cycle.swipes}
    kept = kept_recipes(db, cycle)
    need = eating_days(cycle)
    cov = coverage(kept)
    remaining_ids = [rid for rid in (cycle.deck or []) if rid not in swiped]
    remaining: list[Recipe] = []
    if remaining_ids:
        weights = load_weights(db, user_id)
        last_ids = last_cycle_recipe_ids(db, user_id, cycle)
        by_id = {
            r.id: r for r in db.query(Recipe).filter(Recipe.id.in_(remaining_ids)).all()
        }
        remaining = sorted(
            (by_id[i] for i in remaining_ids if i in by_id),
            key=lambda r: score(r, weights, kept, last_ids),
            reverse=True,
        )
    enough = cov >= need
    if enough and not spare:
        remaining = []
    return DeckState(
        eating_days=need,
        coverage=cov,
        enough=enough,
        exhausted=not remaining_ids,
        kept=kept,
        remaining=remaining,
        distinct_ingredients=distinct_ingredients(kept),
        ingredient_cap=cycle.ingredient_cap or 24,
    )


# ---------------------------------------------------------------------------
# Learning
# ---------------------------------------------------------------------------


def _bump(db: Session, user_id: int, feature: str, delta: float) -> float:
    row = (
        db.query(PreferenceWeight)
        .filter(
            PreferenceWeight.user_id == user_id, PreferenceWeight.feature == feature
        )
        .first()
    )
    if row is None:
        row = PreferenceWeight(user_id=user_id, feature=feature, weight=0.0, samples=0)
        db.add(row)
    before = row.weight
    row.weight = clamp(row.weight + delta)
    row.samples += 1
    return row.weight - before


def record_swipe(
    db: Session,
    user_id: int,
    cycle: MealCycle,
    recipe: Recipe,
    decision: str,
    dwell_ms: int | None = None,
) -> list[str]:
    """Persist the swipe and nudge the weights. Returns human-readable 'learned' deltas."""
    if decision not in ("keep", "skip"):
        raise ValueError("decision must be keep or skip")
    existing = (
        db.query(Swipe)
        .filter(Swipe.cycle_id == cycle.id, Swipe.recipe_id == recipe.id)
        .first()
    )
    if existing:
        return []  # idempotent: a second swipe on the same card is ignored
    db.add(
        Swipe(
            cycle_id=cycle.id,
            recipe_id=recipe.id,
            decision=decision,
            position=len(cycle.swipes),
            dwell_ms=dwell_ms,
        )
    )

    fstep = KEEP_FEATURE_STEP if decision == "keep" else SKIP_FEATURE_STEP
    astep = KEEP_AFFINITY_STEP if decision == "keep" else SKIP_AFFINITY_STEP
    if decision == "keep" and dwell_ms and dwell_ms >= DWELL_BONUS_MS:
        fstep += DWELL_BONUS
    learned: list[str] = []
    for f in features(recipe):
        d = _bump(db, user_id, f, fstep)
        if d:
            learned.append(f"{'↑' if d > 0 else '↓'} {f.split(':', 1)[1]}")
    recipe.affinity = clamp(
        (recipe.affinity if recipe.affinity is not None else COLD_START_AFFINITY)
        + astep
    )
    db.commit()
    db.refresh(cycle)
    return learned[:3]


def record_cooked(
    db: Session, meal: CycleMeal, cooked: bool, rating: int | None = None
) -> None:
    r = meal.recipe
    if cooked:
        meal.status = "cooked"
        meal.rating = rating
        r.times_cooked = (r.times_cooked or 0) + 1
        r.last_cooked = datetime.date.today()
        if rating is None or rating >= 0:
            r.affinity = clamp((r.affinity or 0) + COOKED_AFFINITY)
            if r.status == "candidate":
                r.status = "proven"
        else:
            r.affinity = clamp((r.affinity or 0) + SKIPPED_COOK_AFFINITY)
    else:
        meal.status = "skipped"
        r.affinity = clamp((r.affinity or 0) + SKIPPED_COOK_AFFINITY)
    db.commit()


def decay_weights(db: Session, user_id: int) -> None:
    for w in (
        db.query(PreferenceWeight).filter(PreferenceWeight.user_id == user_id).all()
    ):
        w.weight = clamp(w.weight * DECAY_PER_CYCLE)
    db.commit()


def taste_profile(db: Session, user_id: int, n: int = 6) -> list[dict]:
    ws = sorted(load_weights(db, user_id).items(), key=lambda kv: kv[1], reverse=True)
    return [
        {"feature": f, "label": f.split(":", 1)[1], "weight": round(w, 3)}
        for f, w in ws[:n]
    ]


# ---------------------------------------------------------------------------
# Plan layout
# ---------------------------------------------------------------------------


def layout_plan(db: Session, cycle: MealCycle) -> list[CycleMeal]:
    """Greedy: shortest-keeping (most perishable) recipes first, each spanning consecutive
    non-travel days; the last `eat_out_days` eating days stay open. Replaces any existing plan."""
    for m in list(cycle.meals):
        db.delete(m)
    db.flush()

    kept = sorted(
        kept_recipes(db, cycle), key=lambda r: (r.prep_days or 0, -(r.affinity or 0))
    )
    travel = travel_set(cycle)
    slots = [d for d in cycle_days(cycle) if d not in travel]
    slots = slots[: max(0, len(slots) - (cycle.eat_out_days or 0))]

    meals: list[CycleMeal] = []
    i = 0
    for pos, r in enumerate(kept):
        if i >= len(slots):
            break
        span = slots[i : i + max(1, r.prep_days or 1)]
        # a travel gap inside the span would spoil leftovers: cut the span at the gap
        cut = [span[0]]
        for d in span[1:]:
            if (d - cut[-1]).days == 1:
                cut.append(d)
            else:
                break
        meal = CycleMeal(
            cycle_id=cycle.id,
            recipe_id=r.id,
            cook_date=cut[0],
            days_covered=[d.isoformat() for d in cut],
            servings=r.servings or 4,
            status="planned",
            position=pos,
        )
        db.add(meal)
        meals.append(meal)
        i += len(cut)
    cycle.status = "planned"
    db.commit()
    db.refresh(cycle)
    return cycle.meals
