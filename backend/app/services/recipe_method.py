"""Fetch a recipe's method once, from its own source, and keep it.

Discovery deliberately collects no steps — it is optimised for finding and costing recipes. This
fills the gap on demand: one web-search call per recipe, summarised from the page the recipe
actually came from, cached on the row so it is never fetched twice.

What it will not do: invent quantities, or replace the source. Quantities stay with the
ingredients the discovery pass recorded, the summary is labelled as a summary, and the original
URL travels with it so the owner can always read the real thing.
"""

from __future__ import annotations

import logging

from sqlalchemy.orm import Session

from app.models.food import Recipe

logger = logging.getLogger(__name__)

METHOD_SCHEMA = {
    "type": "object",
    "properties": {
        "steps": {
            "type": "array",
            "description": "The method in order. One action per step, imperative, under 220 characters, with no leading number.",
            "items": {"type": "string"},
        },
        "equipment": {
            "type": "array",
            "description": "Pans, pots or tools the method needs beyond a knife and a board.",
            "items": {"type": "string"},
        },
        "make_ahead": {
            "type": "string",
            "description": "How to batch it, what to freeze, and how to bring it back. Empty if the source says nothing.",
        },
        "source_note": {
            "type": "string",
            "description": "Where the method came from, e.g. 'Summarised from Maangchi'.",
        },
    },
    "required": ["steps", "equipment", "make_ahead", "source_note"],
}


def _prompt(recipe: Recipe) -> str:
    names = [ri.ingredient.name for ri in recipe.ingredients][:24]
    return (
        f"Recipe: {recipe.title}\n"
        f"Source: {recipe.source_site or 'unknown'} — {recipe.source_url or 'no URL recorded'}\n"
        f"Serves {recipe.servings}. Reheats by {recipe.reheat}. Keeps about {recipe.prep_days} days.\n"
        f"Ingredients already recorded: {', '.join(names) or 'none recorded'}\n\n"
        "Read the source page and write its method as short numbered steps a competent home cook "
        "can follow. Keep the source's technique and order. Do not invent quantities — refer to the "
        "ingredients by name and let the amounts live with the ingredient list. Fold marinating or "
        "resting time into the step that needs it. If the dish is cooked in batches for the week, "
        "say in make_ahead how to cool, store and reheat it. Be concrete and brief."
    )


async def fetch_method(db: Session, recipe: Recipe, *, refresh: bool = False) -> Recipe:
    """Fill `recipe.steps` from the source. Returns the recipe unchanged if it already has one."""
    if recipe.steps and not refresh:
        return recipe

    from app.services.llm import REASONING, structured_output

    parsed = await structured_output(
        system=(
            "You summarise a single recipe's method from its own published page. You never invent "
            "quantities and never substitute a different recipe. If the page cannot be read, return "
            "an empty steps list rather than guessing."
        ),
        user_prompt=_prompt(recipe),
        tool_name="submit_method",
        tool_description="The recipe's method, equipment and make-ahead guidance.",
        output_schema=METHOD_SCHEMA,
        model=REASONING,
        max_tokens=4000,
        tools=[{"type": "web_search"}],
        reasoning_effort="low",
    )

    steps = [s.strip() for s in (parsed.get("steps") or []) if isinstance(s, str) and s.strip()]
    if not steps:
        logger.warning("no method found for recipe %s (%s)", recipe.slug, recipe.source_url)
        return recipe

    recipe.steps = {
        "steps": steps,
        "equipment": [e for e in (parsed.get("equipment") or []) if isinstance(e, str)],
        "make_ahead": (parsed.get("make_ahead") or "").strip(),
        "source_note": (parsed.get("source_note") or "").strip()
        or f"Summarised from {recipe.source_site or 'the source'}",
    }
    db.commit()
    db.refresh(recipe)
    return recipe
