"""Seed the food catalogue with the owner's proven recipes and the ingredients they use.

Idempotent: keyed on recipe slug and ingredient name. Prices and package sizes are
starting estimates that the cart builder overwrites with what the store actually shows.
"""

from __future__ import annotations

from sqlalchemy.orm import Session

from app.models.food import (
    Ingredient,
    PantryItem,
    PreferenceWeight,
    Recipe,
    RecipeIngredient,
)

# name: (category, store, tier, shelf_life_days, shelf_stable, {store: (label, price)})
INGREDIENTS: dict[str, tuple] = {
    "chicken thighs": (
        "protein",
        "wf",
        "high",
        3,
        False,
        {"wf": ("3 lb", 14.97), "weg": ("3 lb", 13.49), "hmart": ("3 lb", 12.99)},
    ),
    "beef short rib": (
        "protein",
        "hmart",
        "high",
        3,
        False,
        {"hmart": ("2 lb", 27.98), "wf": ("2 lb", 31.98)},
    ),
    "pork belly": (
        "protein",
        "hmart",
        "high",
        3,
        False,
        {"hmart": ("1 lb", 9.99), "wf": ("1 lb", 11.99)},
    ),
    "salmon fillet": (
        "protein",
        "wf",
        "high",
        2,
        False,
        {"wf": ("1.5 lb", 22.49), "weg": ("1.5 lb", 19.99)},
    ),
    "silken tofu": (
        "protein",
        "hmart",
        "standard",
        10,
        False,
        {"hmart": ("2 tubes", 3.98), "wf": ("2 tubes", 5.49)},
    ),
    "eggs": (
        "protein",
        "weg",
        "high",
        21,
        False,
        {"weg": ("18 ct", 5.49), "wf": ("18 ct", 6.99), "hmart": ("18 ct", 5.99)},
    ),
    "kimchi": ("ferment", "hmart", "standard", 60, False, {"hmart": ("32 oz", 9.99)}),
    "gochujang": ("staple", "hmart", "standard", 365, True, {"hmart": ("500 g", 6.49)}),
    "gochugaru": ("staple", "hmart", "standard", 365, True, {"hmart": ("1 lb", 8.99)}),
    "soy sauce": (
        "staple",
        "hmart",
        "standard",
        365,
        True,
        {"hmart": ("1 L", 4.99), "weg": ("1 L", 5.49)},
    ),
    "rice cakes": ("staple", "hmart", "standard", 14, False, {"hmart": ("1 lb", 3.49)}),
    "udon": ("staple", "hmart", "standard", 120, True, {"hmart": ("5 pk", 4.29)}),
    "dashi packets": (
        "staple",
        "hmart",
        "standard",
        365,
        True,
        {"hmart": ("10 pk", 7.99)},
    ),
    "mirin": (
        "staple",
        "hmart",
        "standard",
        365,
        True,
        {"hmart": ("500 ml", 5.49), "weg": ("500 ml", 6.49)},
    ),
    "short-grain rice": (
        "staple",
        "hmart",
        "standard",
        365,
        True,
        {"hmart": ("5 lb", 11.99)},
    ),
    "sesame oil": (
        "staple",
        "hmart",
        "standard",
        365,
        True,
        {"hmart": ("320 ml", 6.99)},
    ),
    "potatoes": (
        "produce",
        "weg",
        "standard",
        21,
        False,
        {"weg": ("3 lb", 3.99), "wf": ("3 lb", 4.99)},
    ),
    "onions": (
        "produce",
        "weg",
        "standard",
        21,
        False,
        {"weg": ("3 lb", 3.49), "wf": ("3 lb", 3.99), "hmart": ("3 lb", 2.99)},
    ),
    "carrots": (
        "produce",
        "weg",
        "standard",
        14,
        False,
        {"weg": ("2 lb", 2.49), "wf": ("2 lb", 2.99)},
    ),
    "scallions": (
        "produce",
        "weg",
        "standard",
        7,
        False,
        {"weg": ("bunch", 1.29), "hmart": ("bunch", 0.99)},
    ),
    "garlic": (
        "produce",
        "weg",
        "standard",
        30,
        False,
        {"weg": ("3 heads", 1.99), "hmart": ("peeled 8 oz", 2.99)},
    ),
    "napa cabbage": (
        "produce",
        "hmart",
        "standard",
        10,
        False,
        {"hmart": ("1 head", 3.99)},
    ),
    "zucchini": ("produce", "weg", "standard", 7, False, {"weg": ("2", 2.29)}),
    "mushrooms": (
        "produce",
        "hmart",
        "standard",
        5,
        False,
        {"hmart": ("enoki + shiitake", 4.49)},
    ),
    "ginger": (
        "produce",
        "weg",
        "standard",
        21,
        False,
        {"weg": ("knob", 1.49), "hmart": ("knob", 0.99)},
    ),
}

# slug: dict(recipe fields) + ingredients: [(name, qty, unit, essential, reason)]
RECIPES: list[dict] = [
    dict(
        slug="sundubu-jjigae",
        title="Sundubu jjigae",
        source_site="maangchi",
        source_url="https://www.maangchi.com/recipe/sundubu-jjigae",
        rating=4.9,
        review_count=1200,
        cuisine="korean",
        protein_source="pork",
        prep_minutes=10,
        cook_minutes=20,
        servings=4,
        protein_g_per_serving=38,
        prep_days=3,
        reheat="pan",
        status="proven",
        affinity=0.5,
        hue=340,
        ingredients=[
            ("silken tofu", 2, "tube", True, "it is the dish"),
            ("pork belly", 0.5, "lb", True, "the fat carries the broth"),
            ("kimchi", 1, "cup", True, "sour depth"),
            ("gochugaru", 2, "tbsp", True, "the heat and colour"),
            ("eggs", 4, "", False, "nice on top"),
            ("scallions", 2, "", False, ""),
            ("garlic", 3, "clove", True, ""),
        ],
    ),
    dict(
        slug="dak-galbi",
        title="Dak galbi",
        source_site="maangchi",
        source_url="https://www.maangchi.com/recipe/dakgalbi",
        rating=4.9,
        review_count=900,
        cuisine="korean",
        protein_source="chicken",
        prep_minutes=20,
        cook_minutes=25,
        servings=4,
        protein_g_per_serving=46,
        prep_days=3,
        reheat="pan",
        status="proven",
        affinity=0.6,
        hue=12,
        ingredients=[
            ("chicken thighs", 2, "lb", True, ""),
            ("gochujang", 3, "tbsp", True, "the sauce"),
            ("gochugaru", 2, "tbsp", True, ""),
            ("rice cakes", 1, "cup", True, "the chew"),
            ("napa cabbage", 0.25, "head", False, ""),
            ("onions", 1, "", False, ""),
            ("soy sauce", 2, "tbsp", True, ""),
            ("garlic", 4, "clove", True, ""),
        ],
    ),
    dict(
        slug="hot-pot-udon",
        title="Hot pot udon",
        source_site="own",
        rating=None,
        review_count=None,
        cuisine="japanese",
        protein_source="egg",
        prep_minutes=10,
        cook_minutes=15,
        servings=2,
        protein_g_per_serving=34,
        prep_days=2,
        reheat="pan",
        status="proven",
        affinity=0.4,
        hue=200,
        ingredients=[
            ("udon", 2, "pk", True, ""),
            ("dashi packets", 1, "", True, "the broth"),
            ("mushrooms", 1, "pk", False, ""),
            ("eggs", 2, "", True, "the protein"),
            ("napa cabbage", 0.25, "head", False, ""),
            ("scallions", 1, "", False, ""),
            ("soy sauce", 1, "tbsp", True, ""),
            ("mirin", 1, "tbsp", True, ""),
        ],
    ),
    dict(
        slug="dak-dori-tang",
        title="Dak dori tang",
        source_site="maangchi",
        source_url="https://www.maangchi.com/recipe/dakdoritang",
        rating=4.8,
        review_count=700,
        cuisine="korean",
        protein_source="chicken",
        prep_minutes=15,
        cook_minutes=45,
        servings=4,
        protein_g_per_serving=44,
        prep_days=4,
        reheat="oven",
        status="proven",
        affinity=0.5,
        hue=20,
        ingredients=[
            ("chicken thighs", 2.5, "lb", True, ""),
            ("potatoes", 2, "", True, "they soak the sauce"),
            ("carrots", 1, "", False, ""),
            ("onions", 1, "", True, ""),
            ("gochujang", 2, "tbsp", True, ""),
            ("gochugaru", 2, "tbsp", True, ""),
            ("soy sauce", 3, "tbsp", True, ""),
            ("garlic", 5, "clove", True, ""),
        ],
    ),
    dict(
        slug="galbi-tang",
        title="Galbi tang",
        source_site="maangchi",
        source_url="https://www.maangchi.com/recipe/galbitang",
        rating=4.8,
        review_count=500,
        cuisine="korean",
        protein_source="beef",
        prep_minutes=15,
        cook_minutes=90,
        servings=4,
        protein_g_per_serving=42,
        prep_days=4,
        reheat="pan",
        status="proven",
        affinity=0.45,
        hue=30,
        ingredients=[
            ("beef short rib", 2, "lb", True, "the whole dish"),
            ("garlic", 4, "clove", True, ""),
            ("onions", 1, "", True, ""),
            ("scallions", 2, "", False, ""),
            ("soy sauce", 1, "tbsp", False, ""),
            ("eggs", 2, "", False, "egg garnish"),
        ],
    ),
    dict(
        slug="kimchi-jjigae",
        title="Kimchi jjigae",
        source_site="maangchi",
        source_url="https://www.maangchi.com/recipe/kimchi-jjigae",
        rating=4.9,
        review_count=1500,
        cuisine="korean",
        protein_source="pork",
        prep_minutes=10,
        cook_minutes=30,
        servings=4,
        protein_g_per_serving=36,
        prep_days=4,
        reheat="pan",
        status="proven",
        affinity=0.4,
        hue=355,
        ingredients=[
            ("kimchi", 2, "cup", True, "it is the dish"),
            ("pork belly", 0.5, "lb", True, ""),
            ("silken tofu", 1, "tube", False, ""),
            ("gochugaru", 1, "tbsp", False, ""),
            ("onions", 0.5, "", False, ""),
            ("scallions", 2, "", False, ""),
        ],
    ),
    dict(
        slug="bulgogi-bowls",
        title="Bulgogi rice bowls",
        source_site="maangchi",
        source_url="https://www.maangchi.com/recipe/bulgogi",
        rating=4.9,
        review_count=2000,
        cuisine="korean",
        protein_source="beef",
        prep_minutes=20,
        cook_minutes=10,
        servings=4,
        protein_g_per_serving=43,
        prep_days=3,
        reheat="pan",
        status="proven",
        affinity=0.5,
        hue=10,
        ingredients=[
            ("beef short rib", 1.5, "lb", True, "thin-sliced"),
            ("soy sauce", 4, "tbsp", True, "the marinade"),
            ("garlic", 4, "clove", True, ""),
            ("onions", 1, "", False, ""),
            ("scallions", 2, "", False, ""),
            ("sesame oil", 1, "tbsp", True, ""),
            ("short-grain rice", 2, "cup", True, ""),
            ("zucchini", 1, "", False, ""),
        ],
    ),
    dict(
        slug="oyakodon",
        title="Oyakodon",
        source_site="justonecookbook",
        source_url="https://www.justonecookbook.com/oyakodon/",
        rating=4.9,
        review_count=800,
        cuisine="japanese",
        protein_source="chicken",
        prep_minutes=10,
        cook_minutes=15,
        servings=2,
        protein_g_per_serving=40,
        prep_days=2,
        reheat="pan",
        status="candidate",
        affinity=0.1,
        hue=45,
        ingredients=[
            ("chicken thighs", 1, "lb", True, ""),
            ("eggs", 4, "", True, ""),
            ("onions", 1, "", True, ""),
            ("dashi packets", 1, "", True, ""),
            ("soy sauce", 2, "tbsp", True, ""),
            ("mirin", 2, "tbsp", True, ""),
            ("short-grain rice", 2, "cup", True, ""),
        ],
    ),
    dict(
        slug="salmon-teriyaki",
        title="Salmon teriyaki",
        source_site="justonecookbook",
        source_url="https://www.justonecookbook.com/teriyaki-salmon/",
        rating=4.8,
        review_count=600,
        cuisine="japanese",
        protein_source="fish",
        prep_minutes=5,
        cook_minutes=15,
        servings=3,
        protein_g_per_serving=41,
        prep_days=2,
        reheat="oven",
        status="candidate",
        affinity=0.1,
        hue=15,
        ingredients=[
            ("salmon fillet", 1.5, "lb", True, ""),
            ("soy sauce", 3, "tbsp", True, ""),
            ("mirin", 3, "tbsp", True, "the glaze"),
            ("ginger", 1, "tsp", False, ""),
            ("short-grain rice", 2, "cup", True, ""),
            ("scallions", 1, "", False, ""),
        ],
    ),
    dict(
        slug="jjimdak",
        title="Jjimdak",
        source_site="maangchi",
        source_url="https://www.maangchi.com/recipe/jjimdak",
        rating=4.8,
        review_count=400,
        cuisine="korean",
        protein_source="chicken",
        prep_minutes=15,
        cook_minutes=40,
        servings=4,
        protein_g_per_serving=45,
        prep_days=3,
        reheat="oven",
        status="candidate",
        affinity=0.1,
        hue=25,
        ingredients=[
            ("chicken thighs", 2.5, "lb", True, ""),
            ("potatoes", 2, "", True, ""),
            ("carrots", 1, "", False, ""),
            ("soy sauce", 5, "tbsp", True, "the braise"),
            ("garlic", 5, "clove", True, ""),
            ("ginger", 1, "tsp", False, ""),
            ("onions", 1, "", False, ""),
        ],
    ),
]

# Cold-start taste weights, from what the owner told us.
SEED_WEIGHTS = {
    "reheat:pan": 0.30,
    "reheat:oven": 0.15,
    "reheat:microwave": -0.30,
    "source:maangchi": 0.30,
    "source:justonecookbook": 0.15,
    "cuisine:korean": 0.25,
    "cuisine:japanese": 0.15,
    "keeps:batch": 0.30,
    "keeps:short": -0.05,
    "time:quick": 0.10,
    "time:long": -0.05,
    "protein:chicken": 0.15,
    "protein:beef": 0.15,
    "protein:pork": 0.10,
    "protein:fish": 0.05,
}

DEFAULT_PANTRY = {
    "gochujang": "plenty",
    "gochugaru": "plenty",
    "soy sauce": "plenty",
    "sesame oil": "plenty",
    "short-grain rice": "some",
    "mirin": "some",
    "dashi packets": "some",
    "kimchi": "some",
}


def seed_food(db: Session, user_id: int) -> dict[str, int]:
    """Create any missing ingredients, recipes, weights and pantry rows. Returns counts created."""
    created = {"ingredients": 0, "recipes": 0, "weights": 0, "pantry": 0}

    by_name: dict[str, Ingredient] = {i.name: i for i in db.query(Ingredient).all()}
    for name, (cat, store, tier, life, stable, sizes) in INGREDIENTS.items():
        if name in by_name:
            continue
        ing = Ingredient(
            name=name,
            category=cat,
            preferred_store=store,
            quality_tier=tier,
            shelf_life_days=life,
            shelf_stable=stable,
            package_sizes={
                s: {"label": lbl, "price": price} for s, (lbl, price) in sizes.items()
            },
        )
        db.add(ing)
        by_name[name] = ing
        created["ingredients"] += 1
    db.flush()

    existing_slugs = {
        r.slug for r in db.query(Recipe).filter(Recipe.user_id == user_id).all()
    }
    for spec in RECIPES:
        if spec["slug"] in existing_slugs:
            continue
        spec = dict(spec)
        ings = spec.pop("ingredients")
        recipe = Recipe(user_id=user_id, **spec)
        db.add(recipe)
        db.flush()
        for name, qty, unit, essential, reason in ings:
            db.add(
                RecipeIngredient(
                    recipe_id=recipe.id,
                    ingredient_id=by_name[name].id,
                    quantity=qty,
                    unit=unit or None,
                    essential=essential,
                    essential_reason=reason or None,
                )
            )
        created["recipes"] += 1

    have_weights = {
        w.feature
        for w in db.query(PreferenceWeight)
        .filter(PreferenceWeight.user_id == user_id)
        .all()
    }
    for feature, weight in SEED_WEIGHTS.items():
        if feature in have_weights:
            continue
        db.add(
            PreferenceWeight(user_id=user_id, feature=feature, weight=weight, samples=0)
        )
        created["weights"] += 1

    have_pantry = {
        p.ingredient_id
        for p in db.query(PantryItem).filter(PantryItem.user_id == user_id).all()
    }
    for name, state in DEFAULT_PANTRY.items():
        ing = by_name[name]
        if ing.id in have_pantry:
            continue
        db.add(PantryItem(user_id=user_id, ingredient_id=ing.id, state=state))
        created["pantry"] += 1

    db.commit()
    return created
