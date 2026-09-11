"""Recipe discovery = one model call with web search (docs/PLAN-FOOD.md §4).

The model searches the web itself, reads the pages, and returns recipes already normalised
for the planner. No scraping, no browser, no bot walls. The prompt carries the owner's
standing brief (editable in the app), the learned taste weights, and the titles already in
the catalogue so it looks for new ones. Code still enforces the hard rules (≤ 12 essential
ingredients, ≤ 90 minutes) and dedupes by URL.
"""

from __future__ import annotations

import hashlib
import logging
import re
from urllib.parse import urlparse

from sqlalchemy.orm import Session

from app.models.food import (
    FoodSettings,
    Ingredient,
    PantryItem,
    Recipe,
    RecipeIngredient,
)
from app.services import food_planner as fp

logger = logging.getLogger(__name__)

SOURCE_PRIORITY = [
    "maangchi.com",
    "justonecookbook.com",
    "koreanbapsang.com",
    "mykoreankitchen.com",
    "seriouseats.com",
    "bonappetit.com",
    "cooking.nytimes.com",
    "thewoksoflife.com",
]
MAX_INGREDIENTS = 12
MAX_MINUTES = 90
STORE_FOR_CATEGORY = {
    "protein": "wf",
    "produce": "weg",
    "staple": "hmart",
    "ferment": "hmart",
    "dairy": "weg",
    "other": "hmart",
}

DEFAULT_DISCOVERY_PROMPT = (
    "I cook rarely and meal-prep: dishes that batch for 2–4 days and reheat well in an oven or pan "
    "(microwave is a last resort). Few ingredients, nothing exotic bought for one dish. High protein "
    "for muscle. I love Korean food — Maangchi is my go-to — and Japanese food. Things I already make: "
    "sundubu jjigae, dak galbi, hot pot udon, dak dori tang, galbi tang. Variety, but don't get too creative."
)

INGREDIENT_SCHEMA = {
    "type": "object",
    "properties": {
        "name": {
            "type": "string",
            "description": "canonical purchasable name, lower case, e.g. 'chicken thighs'",
        },
        "quantity": {"type": "number"},
        "unit": {"type": "string"},
        "essential": {
            "type": "boolean",
            "description": "true only if the dish would not taste like itself without it",
        },
        "reason": {"type": "string", "description": "short"},
        "category": {
            "type": "string",
            "description": "protein|produce|staple|ferment|dairy|other",
        },
        "shelf_stable": {"type": "boolean"},
        "shelf_life_days": {"type": "integer"},
        "preferred_store": {"type": "string", "description": "hmart|wf|weg"},
        "est_price": {"type": "number", "description": "USD for one typical pack"},
        "pack_label": {
            "type": "string",
            "description": "e.g. '3 lb', '500 g', 'bunch'",
        },
    },
    "required": ["name", "essential", "category"],
}

SEARCH_SCHEMA = {
    "type": "object",
    "properties": {
        "recipes": {
            "type": "array",
            "items": {
                "type": "object",
                "properties": {
                    "title": {"type": "string"},
                    "source_url": {
                        "type": "string",
                        "description": "the exact recipe page you read",
                    },
                    "source_site": {
                        "type": "string",
                        "description": "e.g. maangchi, justonecookbook, seriouseats",
                    },
                    "rating": {
                        "type": "number",
                        "description": "the page's own rating if shown; omit if none",
                    },
                    "review_count": {"type": "integer"},
                    "cuisine": {"type": "string"},
                    "protein_source": {
                        "type": "string",
                        "description": "chicken|beef|pork|fish|tofu|egg|other",
                    },
                    "prep_minutes": {"type": "integer"},
                    "cook_minutes": {"type": "integer"},
                    "servings": {"type": "integer"},
                    "protein_g_per_serving": {"type": "number"},
                    "prep_days": {
                        "type": "integer",
                        "description": "days a batch keeps well in the fridge",
                    },
                    "reheat": {
                        "type": "string",
                        "description": "oven|pan|cold|microwave",
                    },
                    "batch_ok": {"type": "boolean"},
                    "why": {
                        "type": "string",
                        "description": "one short line: why this fits the brief",
                    },
                    "ingredients": {"type": "array", "items": INGREDIENT_SCHEMA},
                },
                "required": [
                    "title",
                    "source_url",
                    "source_site",
                    "cuisine",
                    "protein_source",
                    "servings",
                    "prep_days",
                    "reheat",
                    "ingredients",
                ],
            },
        }
    },
    "required": ["recipes"],
}


def build_prompt(
    db: Session, user_id: int, *, limit: int, prompt: str | None = None
) -> tuple[str, str]:
    settings = db.query(FoodSettings).filter(FoodSettings.user_id == user_id).first()
    brief = prompt or (
        settings.discovery_prompt
        if settings and settings.discovery_prompt
        else DEFAULT_DISCOVERY_PROMPT
    )
    known = db.query(Recipe).filter(Recipe.user_id == user_id).all()
    known_titles = [r.title for r in known][:80]
    profile = fp.taste_profile(db, user_id, n=8)
    taste = (
        ", ".join(f"{p['label']} ({p['weight']:+.2f})" for p in profile) or "none yet"
    )
    system = (
        "You are a meal-prep recipe scout with web search. Find real recipe pages that match the owner's brief, "
        "open each page, and return the recipes normalised for a planner. Prefer these sources in order: "
        + ", ".join(SOURCE_PRIORITY)
        + f". Only return pages you actually opened; copy the exact URL. Hard rules: at most {MAX_INGREDIENTS} "
        f"essential ingredients, at most {MAX_MINUTES} minutes total, batchable, high protein. Mark an ingredient "
        "essential only if the dish would not taste like itself without it; garnishes and optional items are not. "
        "Use canonical purchasable ingredient names in lower case (e.g. 'chicken thighs') with a store guess "
        "(hmart for Korean/Japanese staples, wf for meat and fish, weg for produce), a typical pack label and a USD "
        "price. Never invent ratings: omit rating if the page shows none. Keep every string short; no recipe steps."
    )
    user = (
        f"Brief from the owner:\n{brief}\n\n"
        f"Learned taste weights (higher = liked more): {taste}\n\n"
        f"Already in the catalogue — do not return these or close variants: {'; '.join(known_titles) or 'nothing yet'}\n\n"
        f"Return {limit} new recipes (fewer if the web offers fewer that fit)."
    )
    return system, user


async def default_searcher(system: str, user: str) -> dict:
    from app.services.llm import REASONING, structured_output

    return await structured_output(
        system=system,
        user_prompt=user,
        tool_name="find_recipes",
        tool_description="Return the recipes found.",
        output_schema=SEARCH_SCHEMA,
        model=REASONING,
        max_tokens=16000,
        tools=[{"type": "web_search"}],
        reasoning_effort="medium",
        timeout=420.0,
        max_retries=1,
    )


def _slug(title: str) -> str:
    s = re.sub(r"[^a-z0-9]+", "-", title.lower()).strip("-")
    return s[:70] or hashlib.sha1(title.encode()).hexdigest()[:10]


def upsert_candidate(db: Session, user_id: int, r: dict) -> Recipe | None:
    """Create a candidate recipe (and any missing ingredients) from one normalised entry."""
    url = str(r.get("source_url") or "").strip()
    title = str(r.get("title") or "").strip()[:160]
    if (
        db.query(Recipe)
        .filter(Recipe.user_id == user_id, Recipe.source_url == url)
        .first()
    ):
        return None
    slug = _slug(title)
    if db.query(Recipe).filter(Recipe.slug == slug).first():
        slug = f"{slug}-{hashlib.sha1(url.encode()).hexdigest()[:6]}"
    host = urlparse(url).netloc.replace("www.", "")
    site = (r.get("source_site") or host.split(".")[0] or "web").lower()[:80]
    rating = float(r["rating"]) if isinstance(r.get("rating"), (int, float)) else None
    recipe = Recipe(
        user_id=user_id,
        slug=slug,
        title=title,
        source_url=url,
        source_site=site,
        rating=rating,
        review_count=int(r["review_count"])
        if isinstance(r.get("review_count"), int)
        else None,
        cuisine=(str(r.get("cuisine") or "").lower() or None),
        protein_source=(str(r.get("protein_source") or "other").lower()),
        prep_minutes=int(r.get("prep_minutes") or 0),
        cook_minutes=int(r.get("cook_minutes") or 0),
        servings=int(r.get("servings") or 4),
        protein_g_per_serving=r.get("protein_g_per_serving"),
        prep_days=int(r.get("prep_days") or 2),
        reheat=(str(r.get("reheat") or "pan").lower()),
        batch_ok=bool(r.get("batch_ok", True)),
        status="candidate",
        affinity=fp.COLD_START_AFFINITY,
        hue=int(hashlib.sha1(title.encode()).hexdigest()[:2], 16) * 360 // 255,
        notes=f"found via web search · {r.get('why', '')}".strip(),
    )
    db.add(recipe)
    db.flush()
    by_name = {i.name: i for i in db.query(Ingredient).all()}
    ordered = sorted(
        r.get("ingredients", []), key=lambda i: not i.get("essential", True)
    )
    for spec in ordered[:MAX_INGREDIENTS]:
        name = (spec.get("name") or "").strip().lower()
        if not name:
            continue
        ing = by_name.get(name)
        if ing is None:
            cat = spec.get("category") or "other"
            store = (
                spec.get("preferred_store")
                if spec.get("preferred_store") in ("hmart", "wf", "weg")
                else STORE_FOR_CATEGORY.get(cat, "hmart")
            )
            ing = Ingredient(
                name=name,
                category=cat,
                preferred_store=store,
                quality_tier="high" if cat in ("protein", "produce") else "standard",
                shelf_life_days=spec.get("shelf_life_days"),
                shelf_stable=bool(spec.get("shelf_stable")),
                package_sizes={
                    store: {
                        "label": spec.get("pack_label") or "1",
                        "price": float(spec.get("est_price") or 4.99),
                        "estimated": True,
                    }
                },
            )
            db.add(ing)
            db.flush()
            by_name[name] = ing
            if ing.shelf_stable:  # new staples go through the pantry check rather than being bought blindly
                db.add(PantryItem(user_id=user_id, ingredient_id=ing.id, state="some"))
        db.add(
            RecipeIngredient(
                recipe_id=recipe.id,
                ingredient_id=ing.id,
                quantity=spec.get("quantity")
                if isinstance(spec.get("quantity"), (int, float))
                else None,
                unit=(spec.get("unit") or None),
                essential=bool(spec.get("essential", True)),
                essential_reason=(spec.get("reason") or None),
            )
        )
    db.commit()
    return recipe


async def discover(
    db: Session,
    user_id: int,
    *,
    limit: int = 6,
    prompt: str | None = None,
    searcher=None,
) -> dict:
    """One discovery pass. Returns {added, skipped, checked, log, mode}."""
    system, user = build_prompt(db, user_id, limit=limit, prompt=prompt)
    out = await (searcher or default_searcher)(system, user)
    known_urls = {
        r.source_url
        for r in db.query(Recipe).filter(Recipe.user_id == user_id).all()
        if r.source_url
    }
    added, log = [], []
    for r in (out.get("recipes") or [])[: limit * 2]:
        url = str(r.get("source_url") or "").strip()
        title = str(r.get("title") or "").strip()
        if not url.startswith("http") or not title:
            log.append(
                {"url": url, "outcome": "skipped", "detail": "no usable URL/title"}
            )
            continue
        if url in known_urls:
            log.append({"url": url, "outcome": "duplicate", "title": title})
            continue
        n_ess = sum(1 for i in r.get("ingredients", []) if i.get("essential", True))
        minutes = int(r.get("prep_minutes") or 0) + int(r.get("cook_minutes") or 0)
        if n_ess == 0 or n_ess > MAX_INGREDIENTS or minutes > MAX_MINUTES:
            log.append(
                {
                    "url": url,
                    "outcome": "not a fit",
                    "title": title,
                    "detail": f"{n_ess} essential · {minutes} min",
                }
            )
            continue
        recipe = upsert_candidate(db, user_id, r)
        if recipe:
            known_urls.add(url)
            added.append(
                {
                    "id": recipe.id,
                    "title": recipe.title,
                    "source": recipe.source_site,
                    "rating": recipe.rating,
                    "ingredients": len(recipe.ingredients),
                }
            )
            log.append(
                {
                    "url": url,
                    "outcome": "added",
                    "title": recipe.title,
                    "detail": (r.get("why") or "")[:120],
                }
            )
        else:
            log.append({"url": url, "outcome": "duplicate", "title": title})
        if len(added) >= limit:
            break
    return {
        "added": added,
        "skipped": len(log) - len(added),
        "checked": len(log),
        "log": log,
        "mode": "llm_search",
    }
