"""Recipe discovery = one model call with web search; merchant deals."""

import pytest
from httpx import ASGITransport, AsyncClient

from app.main import app
from app.models.food import PantryItem, Recipe
from app.services import recipe_discovery as rd


def _client():
    return AsyncClient(transport=ASGITransport(app=app), base_url="http://test")


BASE_ING = [
    {
        "name": "chicken thighs",
        "quantity": 2,
        "unit": "lb",
        "essential": True,
        "reason": "core",
        "category": "protein",
        "preferred_store": "wf",
        "est_price": 12.99,
        "pack_label": "3 lb",
    },
    {
        "name": "soy sauce",
        "quantity": 3,
        "unit": "tbsp",
        "essential": True,
        "reason": "the sauce",
        "category": "staple",
        "shelf_stable": True,
        "preferred_store": "hmart",
        "est_price": 4.99,
        "pack_label": "1 L",
    },
    {
        "name": "mirin",
        "quantity": 1,
        "unit": "tbsp",
        "essential": True,
        "category": "staple",
        "shelf_stable": True,
        "preferred_store": "hmart",
        "est_price": 5.49,
        "pack_label": "500 ml",
    },
    {
        "name": "sesame seeds",
        "essential": False,
        "reason": "garnish",
        "category": "staple",
        "shelf_stable": True,
    },
]


async def fake_searcher(system, user):
    fake_searcher.calls.append((system, user))
    return {
        "recipes": [
            {
                "title": "Chicken Bulgogi Bowls",
                "source_url": "https://www.maangchi.com/recipe/dak-bulgogi",
                "source_site": "maangchi",
                "rating": 4.8,
                "review_count": 300,
                "cuisine": "korean",
                "protein_source": "chicken",
                "prep_minutes": 15,
                "cook_minutes": 15,
                "servings": 4,
                "protein_g_per_serving": 40,
                "prep_days": 3,
                "reheat": "pan",
                "batch_ok": True,
                "why": "batchable, few ingredients",
                "ingredients": BASE_ING,
            },
            {
                "title": "Dak galbi",
                "source_url": "https://www.maangchi.com/recipe/dakgalbi",
                "source_site": "maangchi",
                "cuisine": "korean",
                "protein_source": "chicken",
                "servings": 4,
                "prep_days": 3,
                "reheat": "pan",
                "ingredients": BASE_ING,
            },
            {
                "title": "Weekend Ramen Project",
                "source_url": "https://example.com/ramen",
                "source_site": "example",
                "cuisine": "japanese",
                "protein_source": "pork",
                "prep_minutes": 60,
                "cook_minutes": 240,
                "servings": 6,
                "prep_days": 3,
                "reheat": "pan",
                "ingredients": BASE_ING,
            },
            {
                "title": "Untraceable",
                "source_url": "",
                "source_site": "x",
                "cuisine": "korean",
                "protein_source": "beef",
                "servings": 4,
                "prep_days": 3,
                "reheat": "pan",
                "ingredients": BASE_ING,
            },
            {
                "title": "Kitchen-sink stew",
                "source_url": "https://example.com/stew",
                "source_site": "example",
                "cuisine": "korean",
                "protein_source": "beef",
                "servings": 4,
                "prep_days": 3,
                "reheat": "pan",
                "ingredients": [
                    {"name": f"thing {i}", "essential": True, "category": "other"}
                    for i in range(14)
                ],
            },
        ]
    }


fake_searcher.calls = []


def test_prompt_and_schema_are_compact():
    assert "steps" not in str(rd.SEARCH_SCHEMA), (
        "no recipe steps: they blow the output budget"
    )
    assert rd.SOURCE_PRIORITY[0] == "maangchi.com"
    assert "Maangchi" in rd.DEFAULT_DISCOVERY_PROMPT


@pytest.mark.asyncio
async def test_discovery_uses_brief_dedupes_and_enforces_rules(db_session):
    async with _client() as client:
        await client.get("/api/v1/food/recipes")
        st = (
            await client.patch(
                "/api/v1/food/settings",
                json={
                    "discovery_prompt": "more Japanese, no seafood, like the bowls at a Koreatown lunch spot"
                },
            )
        ).json()
        assert "no seafood" in st["discovery_prompt"]
        fake_searcher.calls.clear()
        out = await rd.discover(db_session, 1, limit=4, searcher=fake_searcher)
        assert out["mode"] == "llm_search"
        system, user = fake_searcher.calls[0]
        assert "no seafood" in user and "Dak galbi" in user, (
            "brief and known titles travel in the prompt"
        )
        assert "web search" in system and "12" in system
        outcomes = {l.get("title") or l["url"]: l["outcome"] for l in out["log"]}
        assert outcomes["Chicken Bulgogi Bowls"] == "added"
        assert outcomes["Dak galbi"] == "duplicate", "seeded url is known"
        assert outcomes["Weekend Ramen Project"] == "not a fit", (
            "300 minutes breaks the rule"
        )
        assert outcomes["Kitchen-sink stew"] == "not a fit", (
            "14 essentials breaks the rule"
        )
        assert outcomes[""] == "skipped"
        r = (
            db_session.query(Recipe)
            .filter(Recipe.title == "Chicken Bulgogi Bowls")
            .first()
        )
        assert (
            r
            and r.status == "candidate"
            and r.rating == 4.8
            and r.source_site == "maangchi"
            and r.protein_source == "chicken"
        )
        names = {ri.ingredient.name: ri.essential for ri in r.ingredients}
        assert names["chicken thighs"] is True and names["sesame seeds"] is False
        staples = [ri.ingredient for ri in r.ingredients if ri.ingredient.shelf_stable]
        assert staples and all(
            db_session.query(PantryItem)
            .filter(PantryItem.ingredient_id == i.id)
            .first()
            for i in staples
        ), "new staples land in the pantry check"
        again = await rd.discover(db_session, 1, limit=4, searcher=fake_searcher)
        assert again["added"] == []
        cycle = (
            await client.post("/api/v1/food/cycles", json={"start_date": "2026-10-04"})
        ).json()
        deck = (await client.get(f"/api/v1/food/cycles/{cycle['id']}/deck")).json()
        assert deck["remaining_count"] > 0
        q = (await client.get("/api/v1/food/discover/queries")).json()
        assert q["sources"][0] == "maangchi.com" and "no seafood" in q["prompt"]


@pytest.mark.asyncio
async def test_merchants_carry_location_channel_and_deals(db_session):
    async with _client() as client:
        ms = {
            m["store"]: m for m in (await client.get("/api/v1/food/merchants")).json()
        }
        assert (
            ms["hmart"]["location"].startswith("38 W 32nd")
            and ms["hmart"]["channel"] == "site"
        )
        assert ms["weg"]["channel"] == "doordash" and ms["wf"]["channel"] == "amazon"
        r = await client.post(
            "/api/v1/food/merchants",
            json={
                "store": "citarella",
                "name": "Citarella · DoorDash",
                "channel": "doordash",
                "minimum": 35,
                "delivery_fee": 2.99,
                "deal_text": "$10 off $50",
                "deal_value": 10,
                "deal_min": 50,
            },
        )
        assert r.status_code == 200 and r.json()["deal_active"] is True
        assert (
            await client.post(
                "/api/v1/food/merchants", json={"store": "citarella", "name": "dup"}
            )
        ).status_code == 409
        w = (
            await client.patch(
                "/api/v1/food/merchants/weg",
                json={
                    "deal_text": "$5 off $30",
                    "deal_value": 5,
                    "deal_min": 30,
                    "deal_expires": "2099-01-01",
                },
            )
        ).json()
        assert w["deal_active"] is True
        recipes = {
            x["slug"]: x for x in (await client.get("/api/v1/food/recipes")).json()
        }
        cycle = (
            await client.post(
                "/api/v1/food/cycles",
                json={"start_date": "2026-10-04", "travel_days": []},
            )
        ).json()
        for slug in ("dak-dori-tang", "jjimdak"):
            await client.post(
                f"/api/v1/food/cycles/{cycle['id']}/swipe",
                json={
                    "recipe_id": recipes[slug]["id"],
                    "decision": "keep",
                    "spare": True,
                },
            )
        await client.post(f"/api/v1/food/cycles/{cycle['id']}/plan")
        bags = (await client.post(f"/api/v1/food/cycles/{cycle['id']}/bags")).json()
        weg = next((b for b in bags["bags"] if b["store"] == "weg"), None)
        if weg and weg["goods_total"] + 5 >= 30:
            assert any(i.get("is_deal") for i in weg["items"]), "deal line applied"
        scan = (await client.post("/api/v1/food/merchants/scan-deals")).json()
        assert scan["mode"] == "dry_run"
