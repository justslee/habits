"""Recipe discovery from the web (docs/PLAN-FOOD.md §4).

1. queries shaped by the taste profile, plus a source-priority list (Maangchi, Just One
   Cookbook first); with no search key configured, a curated URL list per source keeps
   discovery working
2. fetch the page and read its schema.org Recipe JSON-LD: title, ingredients, steps,
   times, yield, rating and review count — most recipe sites publish it
3. normalise with the LLM when a key is present (essential verdicts with reasons, protein
   estimate, keeps-for days, reheat, canonical ingredient names with store and pack
   estimates); a heuristic path covers the no-key case
4. filter to the owner's constraints (≤ 12 ingredients, ≤ 90 minutes, batchable) and
   upsert as `candidate` recipes; the deck mixes them in at 30 %
"""

from __future__ import annotations

import hashlib
import json
import logging
import re
from dataclasses import dataclass, field
from urllib.parse import urlparse

import httpx
from sqlalchemy.orm import Session

from app.models.food import Ingredient, Recipe, RecipeIngredient
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
# Works without a search key: known batch-friendly, high-protein pages on the priority sources.
CURATED_URLS = [
    "https://www.maangchi.com/recipe/dakgangjeong",
    "https://www.maangchi.com/recipe/jeyuk-bokkeum",
    "https://www.maangchi.com/recipe/doenjang-jjigae",
    "https://www.maangchi.com/recipe/samgyetang",
    "https://www.maangchi.com/recipe/yukgaejang",
    "https://www.maangchi.com/recipe/tteokgalbi",
    "https://www.maangchi.com/recipe/godeungeo-jorim",
    "https://www.maangchi.com/recipe/dakjjim",
    "https://www.justonecookbook.com/gyudon/",
    "https://www.justonecookbook.com/chicken-katsu/",
    "https://www.justonecookbook.com/nikujaga/",
    "https://www.justonecookbook.com/miso-salmon/",
    "https://www.justonecookbook.com/japanese-curry/",
    "https://www.justonecookbook.com/chicken-teriyaki/",
    "https://www.justonecookbook.com/shogayaki/",
    "https://www.justonecookbook.com/butadon/",
]
MAX_INGREDIENTS = 12
MAX_MINUTES = 90
GARNISH_WORDS = re.compile(
    r"\b(garnish|optional|to serve|for serving|sesame seeds|toasted sesame|sprinkle)\b",
    re.I,
)
QTY_RE = re.compile(
    r"^\s*(\d+(?:[./]\d+)?|\d+\s+\d/\d|½|¼|¾|⅓|⅔)?\s*(tablespoons|tablespoon|tbsp|teaspoons|teaspoon|tsp|pounds|pound|lbs|lb|ounces|ounce|oz|cups|cup|cloves|clove|pieces|piece|packages|package|cans|can|slices|slice|bunch|head|inch|kg|g|ml|l)?\b\s*(?:of\s+)?(.*)$",
    re.I,
)
FRACTIONS = {"½": 0.5, "¼": 0.25, "¾": 0.75, "⅓": 0.33, "⅔": 0.67}
PROTEIN_WORDS = {
    "chicken": "chicken",
    "beef": "beef",
    "short rib": "beef",
    "brisket": "beef",
    "pork": "pork",
    "salmon": "fish",
    "mackerel": "fish",
    "cod": "fish",
    "shrimp": "fish",
    "tofu": "tofu",
    "egg": "egg",
}
STORE_FOR_CATEGORY = {
    "protein": "wf",
    "produce": "weg",
    "staple": "hmart",
    "ferment": "hmart",
    "dairy": "weg",
    "other": "hmart",
}
KOREAN_STAPLES = (
    "gochujang",
    "gochugaru",
    "doenjang",
    "soy sauce",
    "sesame oil",
    "mirin",
    "rice cakes",
    "kimchi",
    "dashi",
    "miso",
    "udon",
    "rice",
    "fish sauce",
    "rice wine",
    "sake",
)


@dataclass
class Found:
    url: str
    title: str
    rating: float | None
    review_count: int | None
    ingredients_raw: list[str]
    steps: list[str]
    prep_minutes: int
    cook_minutes: int
    servings: int
    cuisine: str | None
    image: str | None = None
    extra: dict = field(default_factory=dict)


# ---------------------------------------------------------------------------
# 1. queries
# ---------------------------------------------------------------------------


def queries_for(db: Session, user_id: int) -> list[str]:
    profile = fp.taste_profile(db, user_id, n=8)
    proteins = [p["label"] for p in profile if p["feature"].startswith("protein:")][
        :2
    ] or ["chicken", "beef"]
    cuisines = [p["label"] for p in profile if p["feature"].startswith("cuisine:")][
        :2
    ] or ["korean", "japanese"]
    qs = []
    for c in cuisines:
        for pr in proteins:
            qs.append(f"{c} {pr} recipe meal prep high protein")
    qs.append("site:maangchi.com chicken recipe")
    qs.append("site:justonecookbook.com one pot recipe")
    return qs[:6]


async def search_urls(queries: list[str]) -> list[str]:
    try:
        from app.services.web_research import _search
    except Exception:  # noqa: BLE001
        return []
    urls: list[str] = []
    for q in queries:
        try:
            for r in await _search(q):
                u = getattr(r, "url", None) or (
                    r.get("url") if isinstance(r, dict) else None
                )
                if u:
                    urls.append(u)
        except Exception as e:  # noqa: BLE001
            logger.info("search failed for %r: %s", q, e)
    return urls


def rank_urls(urls: list[str]) -> list[str]:
    def key(u: str) -> int:
        host = urlparse(u).netloc.replace("www.", "")
        return (
            SOURCE_PRIORITY.index(host)
            if host in SOURCE_PRIORITY
            else len(SOURCE_PRIORITY)
        )

    seen, out = set(), []
    for u in sorted(urls, key=key):
        u = u.split("#")[0].split("?")[0]
        if u not in seen:
            seen.add(u)
            out.append(u)
    return out


# ---------------------------------------------------------------------------
# 2. fetch + JSON-LD
# ---------------------------------------------------------------------------


async def fetch_html(url: str) -> str:
    async with httpx.AsyncClient(
        timeout=20.0,
        follow_redirects=True,
        headers={"User-Agent": "Mozilla/5.0 (Habits food planner)"},
    ) as client:
        r = await client.get(url)
        r.raise_for_status()
        return r.text


def _iso_minutes(v) -> int:
    if not v or not isinstance(v, str):
        return 0
    m = re.match(r"P(?:(\d+)D)?T?(?:(\d+)H)?(?:(\d+)M)?", v)
    if not m:
        return 0
    d, h, mi = (int(x) if x else 0 for x in m.groups())
    return d * 1440 + h * 60 + mi


def _walk_jsonld(node):
    if isinstance(node, list):
        for n in node:
            yield from _walk_jsonld(n)
    elif isinstance(node, dict):
        t = node.get("@type")
        types = t if isinstance(t, list) else [t]
        if "Recipe" in types:
            yield node
        for k in ("@graph", "mainEntity", "itemListElement"):
            if k in node:
                yield from _walk_jsonld(node[k])


def extract_recipe(html: str, url: str) -> Found | None:
    for block in re.findall(
        r"<script[^>]+type=[\"']application/ld\+json[\"'][^>]*>(.*?)</script>",
        html,
        re.S | re.I,
    ):
        try:
            data = json.loads(block.strip())
        except json.JSONDecodeError:
            continue
        for rec in _walk_jsonld(data):
            title = (rec.get("name") or "").strip()
            ings = [
                i.strip()
                for i in (rec.get("recipeIngredient") or [])
                if isinstance(i, str) and i.strip()
            ]
            if not title or not ings:
                continue
            steps = []
            for s in rec.get("recipeInstructions") or []:
                if isinstance(s, str):
                    steps.append(s.strip())
                elif isinstance(s, dict):
                    if s.get("@type") == "HowToSection":
                        steps += [
                            x.get("text", "").strip()
                            for x in s.get("itemListElement", [])
                            if isinstance(x, dict)
                        ]
                    else:
                        steps.append((s.get("text") or s.get("name") or "").strip())
            agg = rec.get("aggregateRating") or {}
            try:
                rating = (
                    float(agg.get("ratingValue"))
                    if agg.get("ratingValue") not in (None, "")
                    else None
                )
                count = (
                    int(
                        str(
                            agg.get("ratingCount") or agg.get("reviewCount") or "0"
                        ).replace(",", "")
                    )
                    or None
                )
            except (TypeError, ValueError):
                rating, count = None, None
            y = rec.get("recipeYield")
            y = y[0] if isinstance(y, list) and y else y
            m = re.search(r"\d+", str(y or ""))
            servings = int(m.group()) if m else 4
            cuisine = rec.get("recipeCuisine")
            cuisine = (
                cuisine[0] if isinstance(cuisine, list) and cuisine else cuisine
            ) or None
            img = rec.get("image")
            if isinstance(img, dict):
                img = img.get("url")
            if isinstance(img, list) and img:
                img = img[0] if isinstance(img[0], str) else img[0].get("url")
            prep, cook, total = (
                _iso_minutes(rec.get("prepTime")),
                _iso_minutes(rec.get("cookTime")),
                _iso_minutes(rec.get("totalTime")),
            )
            if not prep and not cook and total:
                prep, cook = max(5, total // 3), total - max(5, total // 3)
            return Found(
                url=url,
                title=title,
                rating=rating,
                review_count=count,
                ingredients_raw=ings,
                steps=[s for s in steps if s],
                prep_minutes=prep,
                cook_minutes=cook,
                servings=max(1, servings),
                cuisine=str(cuisine).lower() if cuisine else None,
                image=img if isinstance(img, str) else None,
            )
    return None


# ---------------------------------------------------------------------------
# 3. normalise
# ---------------------------------------------------------------------------


def _parse_ingredient(raw: str) -> dict:
    text = re.sub(r"\(.*?\)", "", raw).strip()
    m = QTY_RE.match(text)
    qty, unit, name = (m.group(1), m.group(2), m.group(3)) if m else (None, None, text)
    q = None
    if qty:
        qty = qty.strip()
        if qty in FRACTIONS:
            q = FRACTIONS[qty]
        elif " " in qty and "/" in qty:
            a, b = qty.split()
            n, d = b.split("/")
            q = float(a) + float(n) / float(d)
        elif "/" in qty:
            n, d = qty.split("/")
            q = float(n) / float(d)
        else:
            try:
                q = float(qty)
            except ValueError:
                q = None
    name = re.sub(r",.*$", "", name).strip().lower()
    name = re.sub(
        r"\b(fresh|large|medium|small|thinly sliced|sliced|chopped|minced|diced|peeled|boneless|skinless|finely|roughly|about)\b",
        "",
        name,
    ).strip(" ,")
    name = re.sub(r"\s+", " ", name)
    unit = (unit or "").lower().rstrip("s") or None
    unit = {"pound": "lb", "tablespoon": "tbsp", "teaspoon": "tsp", "ounce": "oz"}.get(
        unit, unit
    )
    return {
        "name": name[:80] or raw[:80].lower(),
        "quantity": q,
        "unit": unit,
        "raw": raw,
    }


def _category(name: str) -> str:
    if any(
        w in name
        for w in (
            "chicken",
            "beef",
            "pork",
            "rib",
            "salmon",
            "mackerel",
            "cod",
            "shrimp",
            "tofu",
            "egg",
            "brisket",
            "steak",
        )
    ):
        return "protein"
    if any(w in name for w in KOREAN_STAPLES) or any(
        w in name
        for w in (
            "sugar",
            "salt",
            "oil",
            "vinegar",
            "flour",
            "starch",
            "pepper",
            "sauce",
            "paste",
            "noodle",
            "stock",
            "broth",
            "honey",
        )
    ):
        return "staple"
    if any(
        w in name
        for w in (
            "onion",
            "garlic",
            "ginger",
            "scallion",
            "cabbage",
            "potato",
            "carrot",
            "zucchini",
            "mushroom",
            "pepper",
            "radish",
            "leek",
            "spinach",
            "bean sprout",
            "lettuce",
            "cucumber",
        )
    ):
        return "produce"
    return "other"


def heuristic_normalise(found: Found) -> dict:
    ings = []
    for raw in found.ingredients_raw[: MAX_INGREDIENTS + 4]:
        p = _parse_ingredient(raw)
        cat = _category(p["name"])
        essential = not GARNISH_WORDS.search(raw) and cat != "other"
        ings.append(
            {
                **p,
                "category": cat,
                "essential": essential,
                "reason": "garnish or optional"
                if not essential and GARNISH_WORDS.search(raw)
                else ("core ingredient" if essential else "minor"),
                "shelf_stable": cat == "staple",
                "shelf_life_days": 365
                if cat == "staple"
                else (3 if cat == "protein" else 10),
                "preferred_store": STORE_FOR_CATEGORY.get(cat, "hmart"),
                "est_price": 4.99 if cat != "protein" else 12.99,
                "pack_label": "1 lb" if cat == "protein" else "1",
            }
        )
    text = " ".join(found.ingredients_raw).lower()
    protein = next((v for k, v in PROTEIN_WORDS.items() if k in text), "other")
    host = urlparse(found.url).netloc.replace("www.", "")
    cuisine = found.cuisine or (
        "korean"
        if "maangchi" in host or "korean" in host
        else "japanese"
        if "justonecookbook" in host
        else None
    )
    total = found.prep_minutes + found.cook_minutes
    return {
        "cuisine": cuisine,
        "protein_source": protein,
        "servings": found.servings,
        "protein_g_per_serving": {
            "chicken": 42,
            "beef": 40,
            "pork": 36,
            "fish": 38,
            "tofu": 22,
            "egg": 24,
        }.get(protein, 20),
        "prep_days": 4 if found.servings >= 4 and protein != "fish" else 2,
        "reheat": "oven" if "bake" in " ".join(found.steps).lower() else "pan",
        "batch_ok": found.servings >= 3,
        "suitable": len(ings) <= MAX_INGREDIENTS
        and (total == 0 or total <= MAX_MINUTES)
        and found.servings >= 2,
        "why": "heuristic",
        "ingredients": ings,
    }


NORMALISE_SCHEMA = {
    "type": "object",
    "properties": {
        "cuisine": {"type": "string"},
        "protein_source": {
            "type": "string",
            "description": "chicken|beef|pork|fish|tofu|egg|other",
        },
        "servings": {"type": "integer"},
        "protein_g_per_serving": {"type": "number"},
        "prep_days": {
            "type": "integer",
            "description": "how many days a batch keeps well in the fridge",
        },
        "reheat": {
            "type": "string",
            "description": "oven|pan|cold|microwave — best way to reheat leftovers",
        },
        "batch_ok": {"type": "boolean"},
        "suitable": {
            "type": "boolean",
            "description": "fits: ≤12 ingredients, ≤90 min, preps well, high protein",
        },
        "why": {"type": "string"},
        "ingredients": {
            "type": "array",
            "items": {
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
                        "description": "true if the dish would not taste like itself without it",
                    },
                    "reason": {"type": "string"},
                    "category": {
                        "type": "string",
                        "description": "protein|produce|staple|ferment|dairy|other",
                    },
                    "shelf_stable": {"type": "boolean"},
                    "shelf_life_days": {"type": "integer"},
                    "preferred_store": {
                        "type": "string",
                        "description": "hmart|wf|weg",
                    },
                    "est_price": {
                        "type": "number",
                        "description": "USD for one typical pack",
                    },
                    "pack_label": {
                        "type": "string",
                        "description": "e.g. '3 lb', '500 g', 'bunch'",
                    },
                },
                "required": ["name", "essential", "category"],
            },
        },
    },
    "required": [
        "cuisine",
        "protein_source",
        "servings",
        "protein_g_per_serving",
        "prep_days",
        "reheat",
        "batch_ok",
        "suitable",
        "ingredients",
    ],
}


async def normalise(found: Found) -> dict:
    try:
        from app.services.llm import REASONING, structured_output
    except Exception:  # noqa: BLE001
        return heuristic_normalise(found)
    try:
        out = await structured_output(
            system=(
                "You normalise recipes for a meal-prep planner. The owner cooks rarely, batches for 2–4 days, reheats in the oven or a pan, "
                "wants few ingredients and nothing exotic bought for one dish, and prioritises protein. Mark an ingredient essential only if the "
                "dish would not taste like itself without it; garnishes and optional items are not essential. Use canonical purchasable names."
            ),
            user_prompt=f"Title: {found.title}\nURL: {found.url}\nServings: {found.servings}\nPrep {found.prep_minutes} min, cook {found.cook_minutes} min\nIngredients:\n- "
            + "\n- ".join(found.ingredients_raw)
            + "\n\nSteps:\n"
            + "\n".join(found.steps[:12]),
            tool_name="normalise_recipe",
            tool_description="Return the normalised recipe.",
            output_schema=NORMALISE_SCHEMA,
            model=REASONING,
            max_tokens=3000,
        )
        if not out.get("ingredients"):
            raise ValueError("empty normalisation")
        out.setdefault("why", "model")
        return out
    except Exception as e:  # noqa: BLE001
        logger.info("LLM normalisation unavailable (%s); using heuristics", e)
        return heuristic_normalise(found)


# ---------------------------------------------------------------------------
# 4. upsert
# ---------------------------------------------------------------------------


def _slug(title: str) -> str:
    s = re.sub(r"[^a-z0-9]+", "-", title.lower()).strip("-")
    return s[:70] or hashlib.sha1(title.encode()).hexdigest()[:10]


def upsert_candidate(
    db: Session, user_id: int, found: Found, norm: dict
) -> Recipe | None:
    if (
        db.query(Recipe)
        .filter(Recipe.user_id == user_id, Recipe.source_url == found.url)
        .first()
    ):
        return None
    slug = _slug(found.title)
    if db.query(Recipe).filter(Recipe.slug == slug).first():
        slug = f"{slug}-{hashlib.sha1(found.url.encode()).hexdigest()[:6]}"
    host = urlparse(found.url).netloc.replace("www.", "")
    site = host.split(".")[0]
    recipe = Recipe(
        user_id=user_id,
        slug=slug,
        title=found.title[:160],
        source_url=found.url,
        source_site=site,
        rating=found.rating,
        review_count=found.review_count,
        cuisine=(norm.get("cuisine") or None),
        protein_source=norm.get("protein_source"),
        prep_minutes=found.prep_minutes,
        cook_minutes=found.cook_minutes,
        servings=int(norm.get("servings") or found.servings),
        protein_g_per_serving=norm.get("protein_g_per_serving"),
        prep_days=int(norm.get("prep_days") or 2),
        reheat=(norm.get("reheat") or "pan").lower(),
        batch_ok=bool(norm.get("batch_ok", True)),
        status="candidate",
        affinity=fp.COLD_START_AFFINITY,
        steps=found.steps[:30] or None,
        image_url=found.image,
        hue=int(hashlib.sha1(found.title.encode()).hexdigest()[:2], 16) * 360 // 255,
        notes=f"found via discovery · {norm.get('why', '')}".strip(),
    )
    db.add(recipe)
    db.flush()
    by_name = {i.name: i for i in db.query(Ingredient).all()}
    for spec in norm["ingredients"][:MAX_INGREDIENTS]:
        name = (spec.get("name") or "").strip().lower()
        if not name:
            continue
        ing = by_name.get(name)
        if ing is None:
            store = (
                spec.get("preferred_store")
                if spec.get("preferred_store") in ("hmart", "wf", "weg")
                else STORE_FOR_CATEGORY.get(spec.get("category", "other"), "hmart")
            )
            ing = Ingredient(
                name=name,
                category=spec.get("category"),
                preferred_store=store,
                quality_tier="high"
                if spec.get("category") in ("protein", "produce")
                else "standard",
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
        db.add(
            RecipeIngredient(
                recipe_id=recipe.id,
                ingredient_id=ing.id,
                quantity=spec.get("quantity"),
                unit=spec.get("unit"),
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
    urls: list[str] | None = None,
    fetch=None,
    normaliser=None,
) -> dict:
    """Run one discovery pass. Returns {added: [...], skipped: n, checked: n}."""
    fetch = fetch or fetch_html
    normaliser = normaliser or normalise
    if urls is None:
        urls = await search_urls(queries_for(db, user_id))
        urls = rank_urls(urls) + [u for u in CURATED_URLS if u not in urls]
    known = {
        r.source_url
        for r in db.query(Recipe).filter(Recipe.user_id == user_id).all()
        if r.source_url
    }
    added, skipped, checked = [], 0, 0
    for url in urls:
        if len(added) >= limit:
            break
        if url in known:
            continue
        checked += 1
        try:
            html = await fetch(url)
        except Exception as e:  # noqa: BLE001
            logger.info("fetch failed %s: %s", url, e)
            skipped += 1
            continue
        found = extract_recipe(html, url)
        if not found:
            skipped += 1
            continue
        norm = await normaliser(found)
        if not norm.get("suitable", True):
            skipped += 1
            continue
        recipe = upsert_candidate(db, user_id, found, norm)
        if recipe:
            added.append(
                {
                    "id": recipe.id,
                    "title": recipe.title,
                    "source": recipe.source_site,
                    "rating": recipe.rating,
                    "ingredients": len(recipe.ingredients),
                }
            )
    return {"added": added, "skipped": skipped, "checked": checked}
