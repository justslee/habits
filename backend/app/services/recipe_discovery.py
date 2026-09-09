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
    "https://www.maangchi.com/recipe/jeyuk-deopbap",
    "https://www.maangchi.com/recipe/doenjang-jjigae",
    "https://www.maangchi.com/recipe/samgyetang",
    "https://www.maangchi.com/recipe/yukgaejang",
    "https://www.maangchi.com/recipe/tteokgalbi",
    "https://www.maangchi.com/recipe/godeungeo-gui",
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
MAANGCHI_INDEX = "https://www.maangchi.com/recipes"
INDEX_KEYWORDS = (
    "dak",
    "chicken",
    "jeyuk",
    "pork",
    "bulgogi",
    "beef",
    "galbi",
    "jjim",
    "jjigae",
    "tang",
    "gui",
    "bokkeum",
    "deopbap",
    "samgyeopsal",
    "godeungeo",
    "saengseon",
)
MAX_INGREDIENTS = 12
MAX_MINUTES = 90
GARNISH_WORDS = re.compile(
    r"\b(garnish|optional|to serve|for serving|sesame seeds|toasted sesame|sprinkle)\b",
    re.I,
)
QTY_RE = re.compile(
    r"^\s*(?:plus\s+)?(\d+\s*[½¼¾⅓⅔]|\d+(?:[./]\d+)?|\d+\s+\d/\d|½|¼|¾|⅓|⅔)?\s*(tablespoons|tablespoon|tbsp|teaspoons|teaspoon|tsp|pounds|pound|lbs|lb|ounces|ounce|oz|cups|cup|cloves|clove|pieces|piece|packages|package|cans|can|slices|slice|bunch|head|inch|kg|g|ml|l)?\b\s*(?:of\s+)?(.*)$",
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


BOT_WALL_MARKERS = (
    "Attention Required! | Cloudflare",
    "Just a moment...",
    "cf-challenge",
    "captcha-delivery",
)


def _looks_blocked(status: int, text: str) -> bool:
    return status in (403, 429, 503) or any(m in text[:6000] for m in BOT_WALL_MARKERS)


class BrowserSession:
    """One headed Chrome (the Habits profile) reused across a discovery run. Headless Chrome
    does not clear Maangchi's Cloudflare check; headed does. Throttled to be a polite guest."""

    def __init__(self, headless: bool = False, min_gap_s: float = 3.0):
        self.headless = headless
        self.min_gap_s = min_gap_s
        self._pw = self._ctx = self._page = None
        self._last = 0.0

    def _open(self):
        if self._page:
            return self._page
        from playwright.sync_api import sync_playwright

        from app.services.store_adapters import PROFILE_DIR

        PROFILE_DIR.mkdir(parents=True, exist_ok=True)
        self._pw = sync_playwright().start()
        try:
            self._ctx = self._pw.chromium.launch_persistent_context(
                str(PROFILE_DIR), headless=self.headless, channel="chrome"
            )
        except Exception:  # noqa: BLE001 — no Google Chrome: bundled Chromium
            self._ctx = self._pw.chromium.launch_persistent_context(
                str(PROFILE_DIR), headless=self.headless
            )
        self._page = self._ctx.new_page()
        return self._page

    def get(self, url: str) -> str:
        import time

        page = self._open()
        gap = self.min_gap_s - (time.time() - self._last)
        if gap > 0:
            time.sleep(gap)
        page.goto(url, wait_until="domcontentloaded", timeout=45000)
        for _ in range(15):  # give an interstitial a few seconds to clear
            if not any(
                m in page.title() for m in ("Attention Required", "Just a moment")
            ):
                break
            time.sleep(1.5)
        try:  # recipe cards are often lazy; wait for one, then let the page settle
            page.wait_for_selector(
                ".recipe-card-ingredients, .wprm-recipe-ingredients, .tasty-recipes-ingredients, [class*='ingredients'] li, script[type='application/ld+json']",
                timeout=12000,
            )
            page.wait_for_load_state("networkidle", timeout=10000)
        except Exception:  # noqa: BLE001 — take whatever rendered
            pass
        self._last = time.time()
        html = page.content()
        if any(m in page.title() for m in ("Attention Required", "Just a moment")):
            raise RuntimeError("bot wall did not clear")
        return html

    def close(self) -> None:
        try:
            if self._ctx:
                self._ctx.close()
            if self._pw:
                self._pw.stop()
        finally:
            self._pw = self._ctx = self._page = None


def fetch_html_browser(url: str, headless: bool = False) -> str:
    """One-off browser fetch (a run should prefer a shared BrowserSession)."""
    sess = BrowserSession(headless=headless)
    try:
        return sess.get(url)
    finally:
        sess.close()


def maangchi_index_urls(session: "BrowserSession") -> list[str]:
    """Recipe links from Maangchi's index, filtered to protein-forward mains."""
    html = session.get(MAANGCHI_INDEX)
    links = sorted(
        set(re.findall(r'href="(https://www\.maangchi\.com/recipe/[a-z0-9\-]+)"', html))
    )
    return [u for u in links if any(k in u for k in INDEX_KEYWORDS)]


async def fetch_html(url: str, session: BrowserSession | None = None) -> str:
    """Plain HTTP first; a real browser when the site blocks bots."""
    import asyncio

    async with httpx.AsyncClient(
        timeout=20.0,
        follow_redirects=True,
        headers={"User-Agent": "Mozilla/5.0 (Habits food planner)"},
    ) as client:
        r = await client.get(url)
        if not _looks_blocked(r.status_code, r.text):
            r.raise_for_status()
            return r.text
    try:
        if session is not None:
            return await asyncio.to_thread(session.get, url)
        return await asyncio.to_thread(fetch_html_browser, url)
    except Exception as e:  # noqa: BLE001
        raise RuntimeError(
            f"blocked by a bot wall and no browser available ({e.__class__.__name__})"
        ) from e


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


def _strip(html: str) -> str:
    return (
        re.sub(r"\s+", " ", re.sub(r"<[^>]+>", " ", html))
        .replace("&amp;", "&")
        .replace("&#8217;", "'")
        .replace("&nbsp;", " ")
        .strip()
    )


NOISE = re.compile(r"<(script|iframe|style|noscript)\b.*?</\1>", re.S | re.I)
AD_DIV = re.compile(
    r"<div[^>]+class=\"[^\"]*adthrive[^\"]*\"[^>]*>.*?</div>", re.S | re.I
)


def _declutter(html: str) -> str:
    """Drop scripts, iframes and ad containers so lists and headings sit next to each other."""
    html = NOISE.sub(" ", html)
    return AD_DIV.sub(" ", html)


def extract_recipe_html(html: str, url: str) -> Found | None:
    """Fallback for pages without schema.org Recipe (Maangchi): title from og:title, the first
    list under an Ingredients heading, steps under Directions/Instructions, 'Serves N'."""
    html = _declutter(html)
    m = re.search(
        r"class=\"[^\"]*(?:recipe-card-ingredients|wprm-recipe-ingredients|tasty-recipes-ingredients)[^\"]*\"[^>]*>(.{0,8000})",
        html,
        re.S | re.I,
    ) or re.search(
        r"<h[1-6][^>]*>\s*Ingredients[^<]*</h[1-6]>(.{0,6000})", html, re.S | re.I
    )
    if not m:
        return None
    items = [_strip(i) for i in re.findall(r"<li[^>]*>(.*?)</li>", m.group(1), re.S)]
    items = [i for i in items if 2 < len(i) < 160][:24]
    if len(items) < 3:
        return None
    t = re.search(r'property="og:title" content="([^"]+)"', html) or re.search(
        r"<title>(.*?)</title>", html, re.S
    )
    title = (
        _strip(t.group(1))
        if t
        else url.rstrip("/").split("/")[-1].replace("-", " ").title()
    )
    title = re.split(r"\s+[|\-–]\s+", title)[0][:120]
    steps: list[str] = []
    d = re.search(
        r"class=\"[^\"]*(?:recipe-card-directions|wprm-recipe-instructions|tasty-recipes-instructions)[^\"]*\"[^>]*>(.{0,12000})",
        html,
        re.S | re.I,
    ) or re.search(
        r"<h[1-6][^>]*>\s*(?:Directions|Instructions|Method)[^<]*</h[1-6]>(.{0,12000})",
        html,
        re.S | re.I,
    )
    if d:
        steps = [
            _strip(x)
            for x in re.findall(r"<(?:li|p)[^>]*>(.*?)</(?:li|p)>", d.group(1), re.S)
        ]
        steps = [x for x in steps if len(x) > 20][:30]
    sv = re.search(r"Ingredients for ([0-9]+)", html, re.I) or re.search(
        r"(?:Serves|Servings?)[:\s]*([0-9]+)", html, re.I
    )
    servings = int(sv.group(1)) if sv else 4
    host = urlparse(url).netloc.replace("www.", "")
    return Found(
        url=url,
        title=title,
        rating=None,
        review_count=None,
        ingredients_raw=items,
        steps=steps,
        prep_minutes=0,
        cook_minutes=0,
        servings=servings,
        cuisine="korean" if "maangchi" in host or "korean" in host else None,
    )


def extract_recipe(html: str, url: str) -> Found | None:
    found = _extract_jsonld(html, url)
    return found or extract_recipe_html(html, url)


def _extract_jsonld(html: str, url: str) -> Found | None:
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
        elif qty[-1] in FRACTIONS:  # "3 ½"
            q = float(qty[:-1].strip() or 0) + FRACTIONS[qty[-1]]
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
        "suitable": sum(1 for i in ings if i["essential"]) <= MAX_INGREDIENTS
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
    ordered = sorted(norm["ingredients"], key=lambda i: not i.get("essential", True))
    for spec in ordered[:MAX_INGREDIENTS]:
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
            if ing.shelf_stable:
                from app.models.food import PantryItem

                db.add(PantryItem(user_id=user_id, ingredient_id=ing.id, state="some"))
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
    import asyncio

    normaliser = normaliser or normalise
    session: BrowserSession | None = None
    own_fetch = fetch is None

    async def _fetch(url: str) -> str:
        nonlocal session
        if not own_fetch:
            return await fetch(url)
        if session is None and _needs_browser(url):
            session = BrowserSession()
        return await fetch_html(url, session)

    try:
        if urls is None:
            urls = rank_urls(await search_urls(queries_for(db, user_id)))
            if not urls:  # no search key: curated pages + the Maangchi index
                urls = list(CURATED_URLS)
                try:
                    session = session or BrowserSession()
                    urls += [
                        u
                        for u in await asyncio.to_thread(maangchi_index_urls, session)
                        if u not in urls
                    ]
                except Exception as e:  # noqa: BLE001
                    logger.info("maangchi index unavailable: %s", e)
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
                html = await _fetch(url)
            except Exception as e:  # noqa: BLE001
                logger.info("fetch failed %s: %s", url, e)
                skipped += 1
                continue
            found = extract_recipe(html, url)
            if not found:
                skipped += 1
                continue
            norm = await normaliser(found)
            n_ess = sum(
                1 for i in norm.get("ingredients", []) if i.get("essential", True)
            )
            if not norm.get("suitable", True) or n_ess > MAX_INGREDIENTS or n_ess == 0:
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
    finally:
        if session is not None:
            session.close()


def _needs_browser(url: str) -> bool:
    return "maangchi.com" in url
