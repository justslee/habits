"""A plan written elsewhere (the owner's Notion dinner plans) becomes the current cycle as
written: batches in its order on consecutive dinners, never across a trip, and never re-laid
from a deck it didn't come from."""

import datetime

import pytest
from httpx import ASGITransport, AsyncClient

from app.main import app
from app.models.food import (
    CycleMeal,
    Ingredient,
    MealCycle,
    Recipe,
    RecipeIngredient,
    TravelSpan,
)
from app.services import food_scheduler, plan_import

MON = datetime.date(2026, 9, 28)


def _meal(slug, dinners, **kw):
    return {
        "slug": slug,
        "title": kw.pop("title", slug.replace("-", " ").title()),
        "dinners": dinners,
        "protein_g": 40,
        "active_minutes": 15,
        "total_minutes": 25,
        "reheat_steps": "Warm covered over low heat.",
        "ingredients": kw.pop(
            "ingredients",
            [
                {"name": "salmon fillet", "quantity": 14, "unit": "oz"},
                {
                    "name": "broccoli florets",
                    "quantity": 8,
                    "unit": "oz",
                    "category": "produce",
                    "store": "wf",
                },
            ],
        ),
        "steps": kw.pop("steps", ["Start the rice.", "Cook the salmon."]),
        **kw,
    }


def _spec(*meals, **kw):
    return plan_import.PlanSpec.model_validate(
        {
            "title": "the Notion plan",
            "start_date": MON,
            "notes": "Fish first.",
            "meals": list(meals),
            **kw,
        }
    )


def _trip(db, start, end):
    db.add(
        TravelSpan(
            user_id=1,
            uid=f"trip-{start}",
            start_date=start,
            end_date=end,
            summary="Philly",
        )
    )
    db.commit()


def _days(cycle):
    return [(m.recipe.slug, m.days_covered, m.servings) for m in cycle.meals]


def test_batches_follow_the_plan_on_consecutive_dinners(db_session):
    cycle = plan_import.import_plan(
        db_session,
        1,
        _spec(_meal("teriyaki", 2), _meal("jjigae", 3), _meal("curry", 3)),
    )
    assert cycle.status == "stocked" and cycle.notes == "Fish first."
    assert cycle.start_date == MON and cycle.end_date == MON + datetime.timedelta(
        days=7
    )
    assert _days(cycle) == [
        ("teriyaki", ["2026-09-28", "2026-09-29"], 2),
        ("jjigae", ["2026-09-30", "2026-10-01", "2026-10-02"], 3),
        ("curry", ["2026-10-03", "2026-10-04", "2026-10-05"], 3),
    ]
    assert [m.cook_date for m in cycle.meals] == [
        MON,
        MON + datetime.timedelta(days=2),
        MON + datetime.timedelta(days=5),
    ]
    teriyaki = db_session.query(Recipe).filter(Recipe.slug == "teriyaki").one()
    assert teriyaki.source_site == "own" and teriyaki.servings == 2
    assert teriyaki.steps["steps"] == ["Start the rice.", "Cook the salmon."]
    assert teriyaki.steps["make_ahead"] == "Warm covered over low heat."
    broccoli = (
        db_session.query(Ingredient).filter(Ingredient.name == "broccoli florets").one()
    )
    assert (broccoli.category, broccoli.preferred_store) == ("produce", "wf")


def test_a_batch_never_straddles_a_trip(db_session):
    _trip(
        db_session, MON + datetime.timedelta(days=3), MON + datetime.timedelta(days=5)
    )
    cycle = plan_import.import_plan(
        db_session, 1, _spec(_meal("teriyaki", 2), _meal("pasta", 4), _meal("curry", 2))
    )
    # pasta gets the one night before the trip and keeps its four portions (spares freeze);
    # the next batch starts after the trip
    assert _days(cycle) == [
        ("teriyaki", ["2026-09-28", "2026-09-29"], 2),
        ("pasta", ["2026-09-30"], 4),
        ("curry", ["2026-10-04", "2026-10-05"], 2),
    ]
    assert cycle.travel_days == ["2026-10-01", "2026-10-02", "2026-10-03"]


def test_reimporting_updates_recipes_and_replaces_the_open_cycle(db_session):
    first = plan_import.import_plan(db_session, 1, _spec(_meal("teriyaki", 2)))
    recipe_id = db_session.query(Recipe).filter(Recipe.slug == "teriyaki").one().id
    with pytest.raises(plan_import.PlanConflict):
        plan_import.import_plan(db_session, 1, _spec(_meal("teriyaki", 2)))

    second = plan_import.import_plan(
        db_session,
        1,
        _spec(
            _meal(
                "teriyaki",
                3,
                title="Salmon Teriyaki Donburi",
                ingredients=[{"name": "salmon fillet", "quantity": 21, "unit": "oz"}],
            )
        ),
        replace=True,
    )
    r = db_session.query(Recipe).filter(Recipe.slug == "teriyaki").one()
    assert (
        r.id == recipe_id and r.title == "Salmon Teriyaki Donburi" and r.servings == 3
    )
    lines = (
        db_session.query(RecipeIngredient)
        .filter(RecipeIngredient.recipe_id == r.id)
        .all()
    )
    assert [(line.ingredient.name, line.quantity) for line in lines] == [
        ("salmon fillet", 21)
    ]
    # the first cycle had a plan in it, so it closes rather than vanishing
    assert db_session.get(MealCycle, first.id).status == "done"
    assert second.status == "stocked"


def test_an_untouched_open_cycle_is_simply_removed(db_session):
    started = MealCycle(
        user_id=1,
        start_date=MON,
        end_date=MON + datetime.timedelta(days=13),
        status="deck",
    )
    db_session.add(started)
    db_session.commit()
    plan_import.import_plan(db_session, 1, _spec(_meal("teriyaki", 2)), replace=True)
    # deleted, not closed: an empty cycle adds nothing to the history
    assert [c.status for c in db_session.query(MealCycle).all()] == ["stocked"]


def test_a_calendar_change_never_erases_an_imported_plan(db_session):
    cycle = plan_import.import_plan(
        db_session, 1, _spec(_meal("teriyaki", 2), _meal("curry", 3), stocked=False)
    )
    assert cycle.status == "planned"
    _trip(
        db_session, MON + datetime.timedelta(days=1), MON + datetime.timedelta(days=1)
    )
    assert food_scheduler.refresh_travel(db_session, 1, cycle) is True
    db_session.expire_all()
    assert (
        db_session.query(CycleMeal).filter(CycleMeal.cycle_id == cycle.id).count() == 2
    )


@pytest.mark.asyncio
async def test_the_food_tab_sees_the_imported_plan(db_session):
    plan_import.import_plan(
        db_session, 1, _spec(_meal("teriyaki", 2), _meal("curry", 3))
    )
    async with AsyncClient(
        transport=ASGITransport(app=app), base_url="http://test"
    ) as client:
        current = (await client.get("/api/v1/food/cycles/current")).json()
        assert current["status"] == "stocked" and current["notes"] == "Fish first."
        plan = (await client.get(f"/api/v1/food/cycles/{current['id']}/plan")).json()
    assert [m["recipe"]["slug"] for m in plan["meals"]] == ["teriyaki", "curry"]
    assert plan["covered_days"] == 5 and sum(m["servings"] for m in plan["meals"]) == 5


@pytest.mark.asyncio
async def test_your_own_recipe_is_never_re_read_from_the_web(db_session, monkeypatch):
    from app.services import llm, recipe_method

    async def must_not_run(**_kw):
        raise AssertionError("an own recipe went to the web")

    monkeypatch.setattr(llm, "structured_output", must_not_run)
    plan_import.import_plan(db_session, 1, _spec(_meal("teriyaki", 2)))
    r = db_session.query(Recipe).filter(Recipe.slug == "teriyaki").one()
    same = await recipe_method.fetch_method(db_session, r, refresh=True)
    assert same.steps["steps"] == ["Start the rice.", "Cook the salmon."]
