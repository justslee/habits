"""Laying batches onto days, and moving them around once they're laid.

One rule for every plan, imported or built from the deck: a batch takes consecutive days
from where the previous one ended, skips travel, and never straddles a trip. A batch cut
short by a trip keeps its portions (the spares freeze), and the next batch starts after.
"""

from __future__ import annotations

import datetime
import math

from sqlalchemy.orm import Session

from app.models.food import CycleMeal, MealCycle
from app.services import calendar_sync


class ReorderError(ValueError):
    """The order doesn't describe this plan's meals."""


def consecutive_spans(
    db: Session, user_id: int, start: datetime.date, wanted: list[int]
) -> list[list[datetime.date]]:
    """One run of days per batch, in order, each as long as wanted unless a trip cuts it."""
    horizon = start + datetime.timedelta(days=max(90, 3 * sum(wanted)))
    travel = set(calendar_sync.travel_days_between(db, user_id, start, horizon))
    day = start
    out: list[list[datetime.date]] = []
    for n in wanted:
        while day in travel:
            day += datetime.timedelta(days=1)
        span = [day]
        while len(span) < max(1, n):
            nxt = span[-1] + datetime.timedelta(days=1)
            if nxt in travel:
                break  # the rest of the batch would wait out a trip: cut here
            span.append(nxt)
        out.append(span)
        day = span[-1] + datetime.timedelta(days=1)
    return out


def _days(meal: CycleMeal) -> list[datetime.date]:
    return [datetime.date.fromisoformat(d) for d in (meal.days_covered or [])]


def is_fixed(meal: CycleMeal, today: datetime.date) -> bool:
    """Cooked, or already being eaten: the past can't move."""
    days = _days(meal)
    return meal.status == "cooked" or bool(days and days[0] < today)


def portions_per_day(cycle: MealCycle) -> int:
    """About one portion a day covered means dinners only; about two, lunch and dinner."""
    servings = sum(m.servings or 0 for m in cycle.meals)
    covered = sum(len(m.days_covered or []) for m in cycle.meals)
    return 1 if covered and servings / covered < 1.5 else 2


def reorder(
    db: Session, cycle: MealCycle, meal_ids: list[int], today: datetime.date
) -> MealCycle:
    """Put the plan's meals in `meal_ids` order and lay the movable ones out again.

    Fixed meals keep their days. The rest run consecutively from the day after the last
    fixed one (and never before today or the cycle's start), each as many days as its
    portions feed, and the cycle's end follows the last one."""
    meals = list(cycle.meals)
    by_id = {m.id: m for m in meals}
    if sorted(meal_ids) != sorted(by_id) or len(set(meal_ids)) != len(meal_ids):
        raise ReorderError("The order must list each meal in this plan exactly once.")

    fixed = sorted(
        (m for m in meals if is_fixed(m, today)), key=lambda m: _days(m) or [today]
    )
    movable = [by_id[i] for i in meal_ids if not is_fixed(by_id[i], today)]
    if not movable:
        return cycle

    start = max(cycle.start_date, today)
    for m in fixed:
        if _days(m):
            start = max(start, _days(m)[-1] + datetime.timedelta(days=1))

    per_day = portions_per_day(cycle)
    wanted = [max(1, math.ceil((m.servings or per_day) / per_day)) for m in movable]
    spans = consecutive_spans(db, cycle.user_id, start, wanted)
    for pos, (meal, span) in enumerate(zip(movable, spans), start=len(fixed)):
        meal.cook_date = span[0]
        meal.days_covered = [d.isoformat() for d in span]
        meal.position = pos
    for pos, meal in enumerate(fixed):
        meal.position = pos

    last = max(max(_days(m)) for m in meals if m.days_covered)
    cycle.end_date = max(last, cycle.start_date)
    cycle.travel_days = [
        d.isoformat()
        for d in calendar_sync.travel_days_between(
            db, cycle.user_id, cycle.start_date, cycle.end_date
        )
    ]
    db.commit()
    db.refresh(cycle)
    return cycle
