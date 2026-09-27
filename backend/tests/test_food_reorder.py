"""Reordering a plan: batches take the new order, dates follow, the past stays put, and a
trip still never splits a batch."""

import datetime

import pytest
from httpx import ASGITransport, AsyncClient

from app.main import app
from app.models.food import CycleMeal, MealCycle, Recipe, TravelSpan
from app.services import plan_import, plan_layout

MON = datetime.date(2026, 9, 28)
D = datetime.timedelta


def _meal(slug, dinners):
    return {
        "slug": slug,
        "title": slug.title(),
        "dinners": dinners,
        "ingredients": [{"name": "salmon fillet", "quantity": 14, "unit": "oz"}],
        "steps": ["Cook it."],
    }


def _plan(db, *meals, start=MON):
    spec = plan_import.PlanSpec.model_validate(
        {"title": "plan", "start_date": start, "meals": [_meal(s, n) for s, n in meals]}
    )
    return plan_import.import_plan(db, 1, spec)


def _ids(cycle, *slugs):
    by_slug = {m.recipe.slug: m.id for m in cycle.meals}
    return [by_slug[s] for s in slugs]


def _layout(cycle):
    return [(m.recipe.slug, m.days_covered[0], m.days_covered[-1]) for m in cycle.meals]


def _iso(d):
    return d.isoformat()


def test_batches_take_the_new_order_and_dates_follow(db_session):
    cycle = _plan(db_session, ("teriyaki", 2), ("jjigae", 3), ("curry", 3))
    plan_layout.reorder(
        db_session, cycle, _ids(cycle, "curry", "teriyaki", "jjigae"), today=MON - D(1)
    )
    assert _layout(cycle) == [
        ("curry", _iso(MON), _iso(MON + D(2))),
        ("teriyaki", _iso(MON + D(3)), _iso(MON + D(4))),
        ("jjigae", _iso(MON + D(5)), _iso(MON + D(7))),
    ]
    assert [m.cook_date for m in cycle.meals] == [MON, MON + D(3), MON + D(5)]
    assert cycle.end_date == MON + D(7)


def test_a_started_batch_stays_put_and_nothing_lands_in_the_past(db_session):
    cycle = _plan(db_session, ("a", 2), ("b", 3), ("c", 3), ("d", 2))
    # two days in: a is being eaten, b hasn't started
    plan_layout.reorder(
        db_session, cycle, _ids(cycle, "d", "c", "b", "a"), today=MON + D(2)
    )
    assert _layout(cycle) == [
        ("a", _iso(MON), _iso(MON + D(1))),
        ("d", _iso(MON + D(2)), _iso(MON + D(3))),
        ("c", _iso(MON + D(4)), _iso(MON + D(6))),
        ("b", _iso(MON + D(7)), _iso(MON + D(9))),
    ]


def test_a_cooked_batch_keeps_its_days_even_if_listed_later(db_session):
    cycle = _plan(db_session, ("a", 2), ("b", 2))
    first = next(m for m in cycle.meals if m.recipe.slug == "a")
    first.status = "cooked"
    db_session.commit()
    plan_layout.reorder(db_session, cycle, _ids(cycle, "b", "a"), today=MON - D(1))
    assert _layout(cycle) == [
        ("a", _iso(MON), _iso(MON + D(1))),
        ("b", _iso(MON + D(2)), _iso(MON + D(3))),
    ]


def test_a_trip_still_cuts_a_batch_and_the_cycle_follows(db_session):
    db_session.add(
        TravelSpan(
            user_id=1,
            uid="philly",
            start_date=MON + D(4),
            end_date=MON + D(5),
            summary="Philly",
        )
    )
    db_session.commit()
    cycle = _plan(db_session, ("teriyaki", 2), ("pasta", 4), ("curry", 2))
    assert _layout(cycle)[1] == (
        "pasta",
        _iso(MON + D(2)),
        _iso(MON + D(3)),
    )  # cut by the trip

    plan_layout.reorder(
        db_session, cycle, _ids(cycle, "pasta", "teriyaki", "curry"), today=MON - D(1)
    )
    assert _layout(cycle) == [
        ("pasta", _iso(MON), _iso(MON + D(3))),  # whole again
        ("teriyaki", _iso(MON + D(6)), _iso(MON + D(7))),  # after the trip
        ("curry", _iso(MON + D(8)), _iso(MON + D(9))),
    ]
    assert cycle.end_date == MON + D(9)
    assert cycle.travel_days == [_iso(MON + D(4)), _iso(MON + D(5))]


def test_an_order_that_isnt_this_plan_is_refused(db_session):
    cycle = _plan(db_session, ("a", 2), ("b", 2))
    a, b = _ids(cycle, "a", "b")
    for bad in ([a], [a, a], [a, b, 999]):
        with pytest.raises(plan_layout.ReorderError):
            plan_layout.reorder(db_session, cycle, bad, today=MON)


def test_a_lunch_and_dinner_plan_keeps_its_two_day_batches(db_session):
    cycle = MealCycle(user_id=1, start_date=MON, end_date=MON + D(13), status="planned")
    db_session.add(cycle)
    db_session.flush()
    for pos, slug in enumerate(("x", "y")):
        r = Recipe(user_id=1, slug=slug, title=slug, servings=4, prep_days=2)
        db_session.add(r)
        db_session.flush()
        days = [MON + D(2 * pos), MON + D(2 * pos + 1)]
        db_session.add(
            CycleMeal(
                cycle_id=cycle.id,
                recipe_id=r.id,
                cook_date=days[0],
                days_covered=[_iso(d) for d in days],
                servings=4,
                position=pos,
            )
        )
    db_session.commit()
    db_session.refresh(cycle)
    plan_layout.reorder(db_session, cycle, _ids(cycle, "y", "x"), today=MON - D(1))
    assert _layout(cycle) == [
        ("y", _iso(MON), _iso(MON + D(1))),
        ("x", _iso(MON + D(2)), _iso(MON + D(3))),
    ]


@pytest.mark.asyncio
async def test_the_app_can_reorder_its_plan(db_session):
    tomorrow = datetime.date.today() + D(1)
    cycle = _plan(db_session, ("teriyaki", 2), ("curry", 3), start=tomorrow)
    async with AsyncClient(
        transport=ASGITransport(app=app), base_url="http://test"
    ) as client:
        r = await client.post(
            f"/api/v1/food/cycles/{cycle.id}/reorder",
            json={"meal_ids": _ids(cycle, "curry", "teriyaki")},
        )
        assert r.status_code == 200, r.text
        assert [m["recipe"]["slug"] for m in r.json()["meals"]] == ["curry", "teriyaki"]
        assert r.json()["meals"][0]["days_covered"][0] == _iso(tomorrow)
        bad = await client.post(
            f"/api/v1/food/cycles/{cycle.id}/reorder", json={"meal_ids": [1]}
        )
        assert bad.status_code == 422
