"""Recipe discovery from JSON-LD pages, dedupe, constraints; merchant deals."""

import json

import pytest
from httpx import ASGITransport, AsyncClient

from app.main import app
from app.models.food import Recipe
from app.services import recipe_discovery as rd


def _client():
    return AsyncClient(transport=ASGITransport(app=app), base_url="http://test")


def _page(
    title,
    ingredients,
    rating="4.8",
    count="612",
    prep="PT15M",
    cook="PT30M",
    yield_="4 servings",
    cuisine="Korean",
    graph=False,
):
    rec = {
        "@context": "https://schema.org",
        "@type": "Recipe",
        "name": title,
        "recipeIngredient": ingredients,
        "recipeInstructions": [
            {"@type": "HowToStep", "text": "Marinate the meat."},
            {"@type": "HowToStep", "text": "Pan-fry until done."},
        ],
        "prepTime": prep,
        "cookTime": cook,
        "recipeYield": yield_,
        "recipeCuisine": cuisine,
        "aggregateRating": {
            "@type": "AggregateRating",
            "ratingValue": rating,
            "ratingCount": count,
        },
        "image": {"@type": "ImageObject", "url": "https://img.example/x.jpg"},
    }
    data = (
        {"@context": "https://schema.org", "@graph": [{"@type": "WebPage"}, rec]}
        if graph
        else rec
    )
    return f'<html><head><script type="application/ld+json">{json.dumps(data)}</script></head><body>x</body></html>'


PAGES = {
    "https://www.maangchi.com/recipe/jeyuk-bokkeum": _page(
        "Spicy stir-fried pork (Jeyuk bokkeum)",
        [
            "1 pound pork shoulder, thinly sliced",
            "3 tablespoons gochujang",
            "1 tablespoon gochugaru",
            "1 medium onion, sliced",
            "4 cloves garlic, minced",
            "2 scallions, chopped",
            "1 tablespoon soy sauce",
            "1 teaspoon sesame seeds, for garnish",
        ],
        graph=True,
    ),
    "https://www.justonecookbook.com/gyudon/": _page(
        "Gyudon (Beef Bowl)",
        [
            "1 lb thinly sliced beef",
            "1 onion",
            "4 tbsp soy sauce",
            "2 tbsp mirin",
            "2 tbsp sake",
            "1 cup dashi",
            "2 cups cooked rice",
        ],
        rating="4.9",
        count="1024",
        cuisine="Japanese",
    ),
    "https://example.com/blog": "<html><body>no recipe here</body></html>",
    "https://example.com/too-many": _page(
        "Fussy dish", [f"1 tsp spice {i}" for i in range(16)], cuisine="Fusion"
    ),
}


async def fake_fetch(url: str) -> str:
    if url not in PAGES:
        raise RuntimeError("404")
    return PAGES[url]


def test_extract_recipe_reads_jsonld_and_graph():
    f = rd.extract_recipe(
        PAGES["https://www.maangchi.com/recipe/jeyuk-bokkeum"],
        "https://www.maangchi.com/recipe/jeyuk-bokkeum",
    )
    assert f and f.title.startswith("Spicy stir-fried pork")
    assert (
        f.rating == 4.8
        and f.review_count == 612
        and f.prep_minutes == 15
        and f.cook_minutes == 30
        and f.servings == 4
    )
    assert (
        f.cuisine == "korean"
        and f.image == "https://img.example/x.jpg"
        and len(f.steps) == 2
    )
    assert rd.extract_recipe(PAGES["https://example.com/blog"], "x") is None


def test_heuristic_normalise_marks_garnish_optional_and_parses_quantities():
    f = rd.extract_recipe(
        PAGES["https://www.maangchi.com/recipe/jeyuk-bokkeum"],
        "https://www.maangchi.com/recipe/jeyuk-bokkeum",
    )
    n = rd.heuristic_normalise(f)
    by = {i["name"]: i for i in n["ingredients"]}
    assert (
        by["pork shoulder"]["quantity"] == 1.0
        and by["pork shoulder"]["unit"] == "lb"
        and by["pork shoulder"]["essential"]
    )
    assert by["gochujang"]["category"] == "staple" and by["gochujang"]["shelf_stable"]
    assert by["sesame seeds"]["essential"] is False
    assert (
        n["protein_source"] == "pork"
        and n["cuisine"] == "korean"
        and n["suitable"] is True
    )


def test_rank_urls_prefers_priority_sources():
    ranked = rd.rank_urls(
        [
            "https://random.blog/x",
            "https://www.justonecookbook.com/a/",
            "https://www.maangchi.com/recipe/b?utm=1",
            "https://www.maangchi.com/recipe/b",
        ]
    )
    assert (
        ranked[0].startswith("https://www.maangchi.com")
        and ranked[1].startswith("https://www.justonecookbook.com")
        and len(ranked) == 3
    )


@pytest.mark.asyncio
async def test_discover_adds_candidates_dedupes_and_filters(db_session):
    async with _client() as client:
        await client.get("/api/v1/food/recipes")
        out = await rd.discover(
            db_session,
            1,
            limit=6,
            urls=list(PAGES),
            fetch=fake_fetch,
            normaliser=lambda f: _async(rd.heuristic_normalise(f)),
        )
        titles = {a["title"] for a in out["added"]}
        assert "Gyudon (Beef Bowl)" in titles and any(
            t.startswith("Spicy stir-fried pork") for t in titles
        )
        assert "Fussy dish" not in titles, "16 ingredients breaks the ≤12 rule"
        assert out["skipped"] >= 2
        r = (
            db_session.query(Recipe)
            .filter(Recipe.title == "Gyudon (Beef Bowl)")
            .first()
        )
        assert (
            r.status == "candidate"
            and r.rating == 4.9
            and r.source_site == "justonecookbook"
            and r.protein_source == "beef"
        )
        assert {ri.ingredient.name for ri in r.ingredients} >= {
            "beef",
            "soy sauce",
            "mirin",
        }
        assert all(ri.ingredient.package_sizes for ri in r.ingredients), (
            "new ingredients get a store and a pack estimate"
        )
        # second pass: nothing new
        again = await rd.discover(
            db_session,
            1,
            limit=6,
            urls=list(PAGES),
            fetch=fake_fetch,
            normaliser=lambda f: _async(rd.heuristic_normalise(f)),
        )
        assert again["added"] == []
        # the new candidates can show up in a deck
        cycle = (
            await client.post("/api/v1/food/cycles", json={"start_date": "2026-10-04"})
        ).json()
        deck = (await client.get(f"/api/v1/food/cycles/{cycle['id']}/deck")).json()
        assert deck["remaining_count"] > 0
        assert (await client.get("/api/v1/food/discover/queries")).json()["sources"][
            0
        ] == "maangchi.com"


async def _async(v):
    return v


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
        # add a DoorDash grocer with a deal, and put a deal on Wegmans
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
        # bags apply the deal as a negative line when the bag clears the deal minimum
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
