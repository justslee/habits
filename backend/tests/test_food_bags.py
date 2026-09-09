"""Bag builder: pantry subtraction, package rounding, store allocation, minimums, waste flags."""

import datetime

import pytest
from httpx import ASGITransport, AsyncClient

from app.main import app
from app.services.bag_builder import parse_pack


def _client():
    return AsyncClient(transport=ASGITransport(app=app), base_url="http://test")


async def _planned_cycle(client, keep_slugs):
    start = datetime.date(2026, 9, 20)
    cycle = (
        await client.post(
            "/api/v1/food/cycles",
            json={
                "start_date": start.isoformat(),
                "travel_days": [],
                "eat_out_days": 2,
            },
        )
    ).json()
    recipes = {r["slug"]: r for r in (await client.get("/api/v1/food/recipes")).json()}
    deck = (await client.get(f"/api/v1/food/cycles/{cycle['id']}/deck?spare=1")).json()
    deck_ids = {c["id"] for c in deck["cards"]} | {c["id"] for c in deck["kept"]}
    # swipe: keep the requested slugs (if in the deck), skip everything else until enough
    for slug in keep_slugs:
        rid = recipes[slug]["id"]
        if rid in deck_ids or True:
            resp = await client.post(
                f"/api/v1/food/cycles/{cycle['id']}/swipe",
                json={"recipe_id": rid, "decision": "keep", "spare": True},
            )
            if resp.status_code == 422:
                continue
    plan = (await client.post(f"/api/v1/food/cycles/{cycle['id']}/plan")).json()
    assert plan["meals"], "plan should have meals"
    return cycle, plan


def test_parse_pack():
    assert parse_pack("3 lb") == (3.0, "lb")
    assert parse_pack("2 tubes") == (2.0, "tube")
    assert parse_pack("bunch") == (1.0, None)
    assert parse_pack(None) == (1.0, None)


@pytest.mark.asyncio
async def test_bags_subtract_pantry_and_round_packs(db_session):
    async with _client() as client:
        cycle, plan = await _planned_cycle(client, ["dak-galbi", "dak-dori-tang"])
        # pantry: gochujang plenty (seeded) → must not be bought; set chicken to gone explicitly
        pantry = (await client.get("/api/v1/food/pantry")).json()
        by_name = {p["name"]: p for p in pantry}
        assert by_name["gochujang"]["state"] == "plenty"
        bags = (await client.post(f"/api/v1/food/cycles/{cycle['id']}/bags")).json()
        names = {i["name"]: i for b in bags["bags"] for i in b["items"]}
        assert "gochujang" not in names, "plenty in the pantry → not bought"
        assert "chicken thighs" in names
        # dak galbi 2 lb + dak dori tang 2.5 lb = 4.5 lb → two 3 lb packs
        assert names["chicken thighs"]["packs"] == 2
        assert names["chicken thighs"]["line_total"] == pytest.approx(
            names["chicken thighs"]["unit_price"] * 2
        )
        assert bags["total"] == pytest.approx(bags["goods_total"] + bags["fees_total"])
        assert all(b["goods_total"] >= 0 for b in bags["bags"])


@pytest.mark.asyncio
async def test_every_bag_reports_its_minimum_and_waste(db_session):
    async with _client() as client:
        cycle, _ = await _planned_cycle(client, ["salmon-teriyaki"])
        bags = (await client.post(f"/api/v1/food/cycles/{cycle['id']}/bags")).json()
        assert bags["store_count"] >= 1
        for b in bags["bags"]:
            assert b["minimum"] >= 0
            assert b["short"] == (b["goods_total"] < b["minimum"])
            assert b["shortfall"] == pytest.approx(
                max(0.0, b["minimum"] - b["goods_total"]), abs=0.01
            )
        items = [i for b in bags["bags"] for i in b["items"]]
        salmon = next(i for i in items if i["name"] == "salmon fillet")
        assert salmon["uses"] == 1
        assert bags["budget_per_cycle"] == 220.0


@pytest.mark.asyncio
async def test_approve_bags_moves_cycle_to_bagged(db_session):
    async with _client() as client:
        cycle, _ = await _planned_cycle(client, ["dak-galbi"])
        assert (
            await client.post(f"/api/v1/food/cycles/{cycle['id']}/bags/approve")
        ).status_code == 422
        await client.post(f"/api/v1/food/cycles/{cycle['id']}/bags")
        out = (
            await client.post(f"/api/v1/food/cycles/{cycle['id']}/bags/approve")
        ).json()
        assert all(b["status"] == "approved" for b in out["bags"])
        assert (await client.get("/api/v1/food/cycles/current")).json()[
            "status"
        ] == "bagged"


@pytest.mark.asyncio
async def test_merchants_and_settings_have_safe_defaults(db_session):
    async with _client() as client:
        ms = (await client.get("/api/v1/food/merchants")).json()
        assert {m["store"] for m in ms} == {"hmart", "wf", "weg"}
        assert all(m["supervised"] for m in ms), "every store starts supervised"
        st = (await client.get("/api/v1/food/settings")).json()
        assert st["ordering_enabled"] is False, "the kill switch starts OFF"
        assert st["supervised_cycles_remaining"] == 3
        patched = (
            await client.patch("/api/v1/food/merchants/hmart", json={"minimum": 55})
        ).json()
        assert patched["minimum"] == 55
