"""Daily tick for the food feature: calendar sync, cycle scheduling, pushes, post-cycle summary.

Runs inside the API process (see main.py) once an hour and does real work at most once
per calendar day per kind, tracked on FoodSettings so restarts don't repeat pushes.

  * sync every calendar feed
  * two days before the next shop date: "check the pantry" push
  * on a cook day (afternoon): "cook X tonight" push
  * the day after a cycle ends: close it, write a summary, decay weights, push it
"""

from __future__ import annotations

import datetime
import logging

from sqlalchemy.orm import Session

from app.models.food import CalendarFeed, CycleMeal, MealCycle, Order
from app.models.user import User
from app.services import calendar_sync
from app.services import food_planner as fp
from app.services.bag_builder import ensure_food_settings
from app.services.cart_service import reset_cycle_counters

logger = logging.getLogger(__name__)

PANTRY_LEAD_DAYS = 2
COOK_PUSH_HOUR = 16


async def _push(
    db: Session, user_id: int, title: str, body: str, data: dict | None = None
) -> None:
    try:
        from app.services.push import send_push

        await send_push(db, user_id, title=title, body=body, data=data or {})
    except Exception as e:  # noqa: BLE001 — pushes are best-effort
        logger.info("push skipped: %s", e)


def next_cycle_start(db: Session, user_id: int, today: datetime.date) -> datetime.date:
    last = (
        db.query(MealCycle)
        .filter(MealCycle.user_id == user_id)
        .order_by(MealCycle.end_date.desc())
        .first()
    )
    if last is None:
        return today
    return max(today, last.end_date + datetime.timedelta(days=1))


def summarize_cycle(db: Session, cycle: MealCycle) -> str:
    meals = list(cycle.meals)
    cooked = [m for m in meals if m.status == "cooked"]
    skipped = [m for m in meals if m.status == "skipped"]
    liked = [m for m in cooked if (m.rating or 0) > 0]
    orders = db.query(Order).filter(Order.cycle_id == cycle.id).all()
    spend = sum(o.total for o in orders)
    parts = [f"{len(cooked)} of {len(meals)} planned meals cooked"]
    if liked:
        parts.append("liked: " + ", ".join(m.recipe.title for m in liked))
    if skipped:
        parts.append("skipped: " + ", ".join(m.recipe.title for m in skipped))
    parts.append(
        f"spent ${spend:.2f} across {len(orders)} order{'s' if len(orders) != 1 else ''}"
    )
    return " · ".join(parts)


async def daily_tick(
    db: Session, *, now: datetime.datetime | None = None, force: bool = False
) -> dict:
    now = now or datetime.datetime.now()
    today = now.date()
    user = db.query(User).first()
    if not user:
        return {"skipped": "no user"}
    settings = ensure_food_settings(db, user.id)
    did: dict = {"date": today.isoformat()}

    # 1. calendars
    for feed in (
        db.query(CalendarFeed)
        .filter(CalendarFeed.user_id == user.id, CalendarFeed.enabled.is_(True))
        .all()
    ):
        try:
            did[f"feed:{feed.id}"] = await calendar_sync.sync_feed(db, feed)
        except Exception as e:  # noqa: BLE001
            did[f"feed:{feed.id}"] = f"error: {e}"

    # 2. close finished cycles
    for cycle in (
        db.query(MealCycle)
        .filter(
            MealCycle.user_id == user.id,
            MealCycle.status != "done",
            MealCycle.end_date < today,
        )
        .all()
    ):
        summary = summarize_cycle(db, cycle)
        cycle.notes = ((cycle.notes or "") + "\n" + summary).strip()
        cycle.status = "done"
        db.commit()
        fp.decay_weights(db, user.id)
        reset_cycle_counters(db, user.id)
        await _push(db, user.id, "Cycle closed", summary, {"screen": "Food"})
        did.setdefault("closed", []).append(cycle.id)

    # 3. pantry-check push, two days before the next cycle starts
    if force or settings.last_pantry_push != today:
        start = next_cycle_start(db, user.id, today)
        current = (
            db.query(MealCycle)
            .filter(MealCycle.user_id == user.id, MealCycle.status != "done")
            .first()
        )
        if current is None and (start - today).days <= PANTRY_LEAD_DAYS:
            await _push(
                db,
                user.id,
                "Shopping in 2 days",
                "Check the pantry, then pick meals for the next two weeks.",
                {"screen": "FoodPantry"},
            )
            settings.last_pantry_push = today
            db.commit()
            did["pantry_push"] = True

    # 4. cook-day push
    if (force or settings.last_cook_push != today) and (
        force or now.hour >= COOK_PUSH_HOUR
    ):
        meal = (
            db.query(CycleMeal)
            .join(MealCycle)
            .filter(
                MealCycle.user_id == user.id,
                MealCycle.status != "done",
                CycleMeal.cook_date == today,
                CycleMeal.status == "planned",
            )
            .first()
        )
        if meal:
            await _push(
                db,
                user.id,
                f"Cook {meal.recipe.title} tonight",
                f"{meal.recipe.total_minutes} min · keeps {meal.recipe.prep_days} days · reheat in the {meal.recipe.reheat}.",
                {"screen": "FoodPlan", "cycle_id": meal.cycle_id},
            )
            settings.last_cook_push = today
            db.commit()
            did["cook_push"] = meal.recipe.title
    return did
