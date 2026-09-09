"""Bag builder — shopping list → store bags (docs/PLAN-FOOD.md §5).

1. Sum essential ingredients across the cycle's planned meals (optional ones are dropped).
2. Subtract the pantry: plenty → skip; some → half the need (shelf-stable: skip).
3. Round up to package sizes per store; project leftover per item.
4. Allocate each item to its preferred store (fallback: any store that carries it).
5. Every bag must clear its store minimum: move shelf-stable items into a short bag,
   fold a tiny bag into another store, or flag the shortfall.
"""

from __future__ import annotations

import hashlib
import json
import math
import re
from dataclasses import dataclass, field

from sqlalchemy.orm import Session

from app.models.food import (
    FoodSettings,
    Ingredient,
    MealCycle,
    MerchantAccount,
    PantryItem,
    Recipe,
    RecipeIngredient,
    ShoppingBag,
)

STORE_NAMES = {
    "hmart": "H Mart",
    "wf": "Whole Foods · Amazon",
    "weg": "Wegmans · DoorDash",
}
DEFAULT_MERCHANTS = [
    dict(
        store="hmart",
        name="H Mart",
        site_url="https://www.hmart.com",
        minimum=49.0,
        delivery_fee=5.99,
    ),
    dict(
        store="wf",
        name="Whole Foods · Amazon",
        site_url="https://www.amazon.com/alm/storefront?almBrandId=VUZHIFdob2xlIEZvb2Rz",
        minimum=35.0,
        delivery_fee=0.0,
    ),
    dict(
        store="weg",
        name="Wegmans · DoorDash",
        site_url="https://www.doordash.com/store/wegmans",
        minimum=30.0,
        delivery_fee=3.99,
    ),
]
TINY_BAG_FRACTION = (
    0.5  # a bag under half its minimum gets folded into another store when possible
)
WASTE_RATIO = 1.5  # bought > 1.5× needed on a perishable single-use item → flagged
UNIT_ALIASES = {
    "lbs": "lb",
    "pound": "lb",
    "pounds": "lb",
    "tubes": "tube",
    "pk": "pack",
    "ct": "count",
}


def ensure_food_settings(db: Session, user_id: int) -> FoodSettings:
    s = db.query(FoodSettings).filter(FoodSettings.user_id == user_id).first()
    if s is None:
        s = FoodSettings(user_id=user_id)
        db.add(s)
        db.commit()
    return s


def ensure_merchants(db: Session, user_id: int) -> dict[str, MerchantAccount]:
    have = {
        m.store: m
        for m in db.query(MerchantAccount)
        .filter(MerchantAccount.user_id == user_id)
        .all()
    }
    for spec in DEFAULT_MERCHANTS:
        if spec["store"] not in have:
            m = MerchantAccount(user_id=user_id, **spec)
            db.add(m)
            have[spec["store"]] = m
    db.commit()
    return have


# ---------------------------------------------------------------------------
# Quantities
# ---------------------------------------------------------------------------


def parse_pack(label: str | None) -> tuple[float, str | None]:
    """'3 lb' → (3, 'lb'); '2 tubes' → (2, 'tube'); 'bunch' → (1, None)."""
    if not label:
        return 1.0, None
    m = re.match(r"\s*([\d.]+)\s*([a-zA-Z]+)?", label)
    if not m:
        return 1.0, None
    qty = float(m.group(1))
    unit = (m.group(2) or "").lower() or None
    unit = UNIT_ALIASES.get(unit, unit) if unit else None
    return qty, unit


@dataclass
class Need:
    ingredient: Ingredient
    quantity: float = 0.0
    unit: str | None = None
    uses: int = 0
    recipes: list[str] = field(default_factory=list)


def collect_needs(db: Session, cycle: MealCycle) -> dict[int, Need]:
    needs: dict[int, Need] = {}
    recipe_ids = [m.recipe_id for m in cycle.meals if m.status != "skipped"]
    if not recipe_ids:
        return needs
    rows = (
        db.query(RecipeIngredient)
        .join(Recipe)
        .filter(Recipe.id.in_(recipe_ids), RecipeIngredient.essential.is_(True))
        .all()
    )
    for ri in rows:
        n = needs.setdefault(
            ri.ingredient_id,
            Need(ingredient=ri.ingredient, unit=(ri.unit or "").lower() or None),
        )
        unit = (ri.unit or "").lower() or None
        unit = UNIT_ALIASES.get(unit, unit) if unit else None
        if n.unit == unit and ri.quantity:
            n.quantity += ri.quantity
        elif not n.quantity and ri.quantity:
            n.quantity, n.unit = ri.quantity, unit
        n.uses += 1
        n.recipes.append(ri.recipe.title)
    return needs


def pantry_factor(db: Session, user_id: int, ingredient: Ingredient) -> float:
    p = (
        db.query(PantryItem)
        .filter(
            PantryItem.user_id == user_id, PantryItem.ingredient_id == ingredient.id
        )
        .first()
    )
    if p is None:
        return 1.0
    if p.state == "plenty":
        return 0.0
    if p.state == "some":
        return 0.0 if ingredient.shelf_stable else 0.5
    return 1.0


def packs_for(need: Need, store: str, factor: float) -> tuple[int, float, str, float]:
    """→ (packs, unit_price, pack_label, projected_leftover_fraction)."""
    sizes = (need.ingredient.package_sizes or {}).get(store) or {}
    label, price = sizes.get("label"), float(sizes.get("price") or 0)
    pack_qty, pack_unit = parse_pack(label)
    wanted = need.quantity * factor
    if pack_unit and need.unit == pack_unit and wanted > 0:
        packs = max(1, math.ceil(wanted / pack_qty))
        leftover = (packs * pack_qty - wanted) / (packs * pack_qty)
    else:
        packs = 1
        leftover = (
            0.0 if need.uses > 1 else 0.5
        )  # unknown units: assume one pack, half left if used once
    return packs, price, label or "1", leftover


# ---------------------------------------------------------------------------
# Allocation
# ---------------------------------------------------------------------------


def _hash(items: list[dict]) -> str:
    key = json.dumps(
        sorted(
            (i["ingredient_id"], i["packs"], round(i["line_total"], 2)) for i in items
        )
    )
    return hashlib.sha256(key.encode()).hexdigest()


def build_bags(db: Session, user_id: int, cycle: MealCycle) -> list[ShoppingBag]:
    merchants = {k: m for k, m in ensure_merchants(db, user_id).items() if m.enabled}
    needs = collect_needs(db, cycle)

    # 1–4: per-item store choice
    lines: dict[str, list[dict]] = {}
    for need in needs.values():
        ing = need.ingredient
        factor = pantry_factor(db, user_id, ing)
        if factor <= 0:
            continue
        carriers = [s for s in (ing.package_sizes or {}) if s in merchants]
        if not carriers:
            continue
        store = ing.preferred_store if ing.preferred_store in carriers else carriers[0]
        packs, price, label, leftover = packs_for(need, store, factor)
        waste = None
        if not ing.shelf_stable and need.uses == 1 and leftover >= 1 - 1 / WASTE_RATIO:
            waste = f"about {int(leftover * 100)}% likely left over — reuse in another meal or drop"
        lines.setdefault(store, []).append(
            {
                "ingredient_id": ing.id,
                "name": ing.name,
                "packs": packs,
                "pack_label": label,
                "unit_price": round(price, 2),
                "line_total": round(price * packs, 2),
                "uses": need.uses,
                "recipes": need.recipes,
                "shelf_stable": ing.shelf_stable,
                "alt_stores": [s for s in carriers if s != store],
                "waste_note": waste,
                "projected_waste_value": round(price * packs * leftover, 2)
                if waste
                else 0.0,
                "moved_from": None,
            }
        )

    def goods(store: str) -> float:
        return sum(i["line_total"] for i in lines.get(store, []))

    # 5a: fold tiny bags into a store that carries everything in them
    for store in list(lines):
        m = merchants[store]
        if m.minimum and goods(store) < m.minimum * TINY_BAG_FRACTION:
            for target in lines:
                if target == store:
                    continue
                if all(target in i["alt_stores"] for i in lines[store]):
                    for i in lines[store]:
                        i["moved_from"] = store
                        i["alt_stores"] = [
                            s for s in i["alt_stores"] + [store] if s != target
                        ]
                        p, price, label, _ = packs_for(
                            needs[i["ingredient_id"]], target, 1.0
                        )
                        i["unit_price"], i["pack_label"], i["line_total"] = (
                            round(price, 2),
                            label,
                            round(price * i["packs"], 2),
                        )
                        lines[target].append(i)
                    lines[store] = []
                    break

    # 5b: fill short bags with shelf-stable items other stores also carry
    for store in list(lines):
        m = merchants[store]
        if not lines[store] or goods(store) >= m.minimum:
            continue
        for other in list(lines):
            if other == store or goods(store) >= m.minimum:
                continue
            movable = [
                i
                for i in lines[other]
                if i["shelf_stable"] and store in i["alt_stores"]
            ]
            for i in movable:
                if goods(store) >= m.minimum:
                    break
                om = merchants[other]
                if (
                    goods(other) - i["line_total"] < om.minimum
                    and goods(other) >= om.minimum
                ):
                    continue  # don't break the other bag to fix this one
                lines[other].remove(i)
                i["moved_from"] = other
                i["alt_stores"] = [s for s in i["alt_stores"] + [other] if s != store]
                p, price, label, _ = packs_for(needs[i["ingredient_id"]], store, 1.0)
                i["unit_price"], i["pack_label"], i["line_total"] = (
                    round(price, 2),
                    label,
                    round(price * i["packs"], 2),
                )
                lines[store].append(i)

    # persist
    for b in db.query(ShoppingBag).filter(ShoppingBag.cycle_id == cycle.id).all():
        db.delete(b)
    db.flush()
    bags: list[ShoppingBag] = []
    for store, items in lines.items():
        if not items:
            continue
        m = merchants[store]
        total = round(sum(i["line_total"] for i in items), 2)
        short = bool(m.minimum and total < m.minimum)
        bag = ShoppingBag(
            cycle_id=cycle.id,
            store=store,
            items=sorted(items, key=lambda i: (-i["line_total"], i["name"])),
            goods_total=total,
            minimum=m.minimum,
            delivery_fee=m.delivery_fee,
            short=short,
            shortfall=round(max(0.0, m.minimum - total), 2),
            projected_waste=round(sum(i["projected_waste_value"] for i in items), 2),
            status="proposed",
            bag_hash=_hash(items),
        )
        db.add(bag)
        bags.append(bag)
    cycle.status = (
        "bagged" if False else cycle.status
    )  # status flips on approval, not on proposal
    db.commit()
    for b in bags:
        db.refresh(b)
    return sorted(bags, key=lambda b: -b.goods_total)


def approve_bags(db: Session, cycle: MealCycle) -> list[ShoppingBag]:
    bags = db.query(ShoppingBag).filter(ShoppingBag.cycle_id == cycle.id).all()
    for b in bags:
        b.status = "approved"
    cycle.status = "bagged"
    db.commit()
    return bags
