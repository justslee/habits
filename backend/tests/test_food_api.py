"""Food planner + API: deck sizing, stop rule, bounded learning, plan layout."""

import datetime

import pytest
from httpx import ASGITransport, AsyncClient

from app.main import app
from app.models.food import MealCycle, PreferenceWeight, Recipe
from app.services import food_planner as fp


def _client():
    return AsyncClient(transport=ASGITransport(app=app), base_url="http://test")


async def _start_cycle(client, travel=3, eat_out=2):
    start = datetime.date(2026, 9, 20)
    travel_days = [
        (start + datetime.timedelta(days=5 + i)).isoformat() for i in range(travel)
    ]
    resp = await client.post(
        "/api/v1/food/cycles",
        json={
            "start_date": start.isoformat(),
            "travel_days": travel_days,
            "eat_out_days": eat_out,
        },
    )
    assert resp.status_code == 200, resp.text
    return resp.json()


@pytest.mark.asyncio
async def test_catalogue_seeds_on_first_call(db_session):
    async with _client() as client:
        resp = await client.get("/api/v1/food/recipes")
    assert resp.status_code == 200
    recipes = resp.json()
    assert len(recipes) == 10
    dak = next(r for r in recipes if r["slug"] == "dak-galbi")
    assert dak["status"] == "proven"
    assert {i["name"] for i in dak["ingredients"] if i["essential"]} >= {
        "chicken thighs",
        "gochujang",
        "rice cakes",
    }


@pytest.mark.asyncio
async def test_deck_is_sized_by_coverage_need(db_session):
    async with _client() as client:
        cycle = await _start_cycle(client, travel=3, eat_out=2)
        assert cycle["eating_days"] == 14 - 3 - 2 == 9
        # ceil(9/2) + 4 = 9 cards max, out of a 10-recipe catalogue
        assert cycle["deck_size"] == 9
        deck = (await client.get(f"/api/v1/food/cycles/{cycle['id']}/deck")).json()
        assert deck["remaining_count"] == 9
        assert len(deck["cards"]) == 2
        # 70/30: 9 cards → 3 new candidates, 6 proven
        statuses = [
            r["status"] for r in (await client.get("/api/v1/food/recipes")).json()
        ]
        assert statuses.count("candidate") == 3


@pytest.mark.asyncio
async def test_deck_stops_when_eating_days_are_covered(db_session):
    async with _client() as client:
        cycle = await _start_cycle(client)
        cid = cycle["id"]
        deck = (await client.get(f"/api/v1/food/cycles/{cid}/deck")).json()
        keeps = 0
        while not deck["enough"] and deck["cards"]:
            card = deck["cards"][0]
            deck = (
                await client.post(
                    f"/api/v1/food/cycles/{cid}/swipe",
                    json={
                        "recipe_id": card["id"],
                        "decision": "keep",
                        "dwell_ms": 1200,
                    },
                )
            ).json()
            keeps += 1
        assert deck["enough"] is True
        assert deck["coverage"] >= deck["eating_days"] == 9
        assert keeps <= 4, "nine eating days should never need more than four recipes"
        assert deck["cards"] == [], "the deck stops once the cycle is covered"
        # one spare on request
        spare = (await client.get(f"/api/v1/food/cycles/{cid}/deck?spare=1")).json()
        assert len(spare["cards"]) >= 1


@pytest.mark.asyncio
async def test_swipes_learn_in_small_bounded_steps(db_session):
    async with _client() as client:
        cycle = await _start_cycle(client)
        cid = cycle["id"]
        deck = (await client.get(f"/api/v1/food/cycles/{cid}/deck")).json()
        card = deck["cards"][0]
        before = {w.feature: w.weight for w in db_session.query(PreferenceWeight).all()}
        aff_before = db_session.get(Recipe, card["id"]).affinity
        out = (
            await client.post(
                f"/api/v1/food/cycles/{cid}/swipe",
                json={"recipe_id": card["id"], "decision": "keep", "dwell_ms": 800},
            )
        ).json()
        assert out["learned"], "a swipe reports what it learned"
        db_session.expire_all()
        after = {w.feature: w.weight for w in db_session.query(PreferenceWeight).all()}
        moved = [f for f in after if abs(after[f] - before.get(f, 0.0)) > 1e-9]
        assert moved and all(
            abs(after[f] - before.get(f, 0.0))
            <= fp.KEEP_FEATURE_STEP + fp.DWELL_BONUS + 1e-9
            for f in moved
        )
        assert db_session.get(Recipe, card["id"]).affinity == pytest.approx(
            min(1.0, aff_before + fp.KEEP_AFFINITY_STEP)
        )
        # idempotent: swiping the same card again changes nothing
        again = (
            await client.post(
                f"/api/v1/food/cycles/{cid}/swipe",
                json={"recipe_id": card["id"], "decision": "skip"},
            )
        ).json()
        assert again["learned"] == []
        assert all(
            w.weight <= 1.0 and w.weight >= -1.0
            for w in db_session.query(PreferenceWeight).all()
        )


@pytest.mark.asyncio
async def test_plan_layout_skips_travel_and_reserves_eat_out_days(db_session):
    async with _client() as client:
        cycle = await _start_cycle(client, travel=3, eat_out=2)
        cid = cycle["id"]
        deck = (await client.get(f"/api/v1/food/cycles/{cid}/deck")).json()
        while not deck["enough"] and deck["cards"]:
            deck = (
                await client.post(
                    f"/api/v1/food/cycles/{cid}/swipe",
                    json={"recipe_id": deck["cards"][0]["id"], "decision": "keep"},
                )
            ).json()
        plan = (await client.post(f"/api/v1/food/cycles/{cid}/plan")).json()
        assert plan["cycle"]["status"] == "planned"
        travel = set(cycle["travel_days"])
        covered = [d for m in plan["meals"] for d in m["days_covered"]]
        assert not (set(covered) & travel), "no meal lands on a travel day"
        assert len(covered) == len(set(covered)), "no day is covered twice"
        assert len(covered) <= 9
        # the last two eating days stay open for eating out
        eating = [
            (datetime.date(2026, 9, 20) + datetime.timedelta(days=i)).isoformat()
            for i in range(14)
        ]
        eating = [d for d in eating if d not in travel]
        assert not (set(covered) & set(eating[-2:]))


@pytest.mark.asyncio
async def test_cooked_promotes_candidate_and_cycle_completion_decays(db_session):
    async with _client() as client:
        cycle = await _start_cycle(client)
        cid = cycle["id"]
        deck_ids = db_session.get(MealCycle, cid).deck
        target = (
            db_session.query(Recipe)
            .filter(Recipe.id.in_(deck_ids), Recipe.status == "candidate")
            .first()
        )
        assert target is not None, "the deck always carries some new candidates"
        await client.post(
            f"/api/v1/food/cycles/{cid}/swipe",
            json={"recipe_id": target.id, "decision": "keep"},
        )
        plan = (await client.post(f"/api/v1/food/cycles/{cid}/plan")).json()
        meal = next(m for m in plan["meals"] if m["recipe"]["id"] == target.id)
        out = (
            await client.post(
                f"/api/v1/food/cycles/{cid}/meals/{meal['id']}/cooked",
                json={"cooked": True, "rating": 1},
            )
        ).json()
        db_session.expire_all()
        assert db_session.get(Recipe, target.id).status == "proven"
        assert (
            next(m for m in out["meals"] if m["id"] == meal["id"])["status"] == "cooked"
        )
        w_before = {
            w.feature: w.weight for w in db_session.query(PreferenceWeight).all()
        }
        done = (await client.post(f"/api/v1/food/cycles/{cid}/complete")).json()
        assert done["status"] == "done"
        db_session.expire_all()
        w_after = {
            w.feature: w.weight for w in db_session.query(PreferenceWeight).all()
        }
        assert all(abs(w_after[f]) <= abs(w_before[f]) + 1e-9 for f in w_before), (
            "weights decay toward zero"
        )
        assert (await client.get("/api/v1/food/cycles/current")).json() is None


@pytest.mark.asyncio
async def test_a_planned_meal_can_be_swapped_or_dropped(db_session):
    """A plan you cannot change is a plan you abandon."""
    async with _client() as client:
        cycle = await _start_cycle(client, travel=0, eat_out=0)
        cid = cycle["id"]
        deck = (await client.get(f"/api/v1/food/cycles/{cid}/deck")).json()
        while not deck["enough"] and deck["cards"]:
            deck = (
                await client.post(
                    f"/api/v1/food/cycles/{cid}/swipe",
                    json={"recipe_id": deck["cards"][0]["id"], "decision": "keep"},
                )
            ).json()
        plan = (await client.post(f"/api/v1/food/cycles/{cid}/plan")).json()
        assert len(plan["meals"]) >= 2
        meal = plan["meals"][0]
        in_plan = {m["recipe"]["id"] for m in plan["meals"]}

        # Swapping keeps the slot and only changes the dish.
        other = (await client.get("/api/v1/food/recipes")).json()
        spare = next(r for r in other if r["id"] not in in_plan)
        after = (
            await client.post(
                f"/api/v1/food/cycles/{cid}/meals/{meal['id']}/swap",
                json={"recipe_id": spare["id"]},
            )
        ).json()
        swapped = next(m for m in after["meals"] if m["id"] == meal["id"])
        assert swapped["recipe"]["id"] == spare["id"]
        assert swapped["days_covered"] == meal["days_covered"]
        assert len(after["meals"]) == len(plan["meals"])

        # The same dish twice in one plan is refused.
        dup = await client.post(
            f"/api/v1/food/cycles/{cid}/meals/{after['meals'][1]['id']}/swap",
            json={"recipe_id": spare["id"]},
        )
        assert dup.status_code == 409

        # Dropping one frees the days it held.
        before_open = after["open_days"]
        dropped = (
            await client.delete(f"/api/v1/food/cycles/{cid}/meals/{meal['id']}")
        ).json()
        assert len(dropped["meals"]) == len(after["meals"]) - 1
        assert dropped["open_days"] > before_open
        assert await_missing(dropped, meal["id"])


def await_missing(plan: dict, meal_id: int) -> bool:
    return all(m["id"] != meal_id for m in plan["meals"])
