"""Auto-suggest pillar tags using tool_use structured outputs (D-012).

Analyzes entry description text and suggests relevant pillars
with confidence scores and sub-topic hints. Uses Haiku for speed/cost.
"""

import logging
from typing import Any

from sqlalchemy.orm import Session

from app.models.pillar import Pillar
from app.services.llm import HAIKU, structured_output

logger = logging.getLogger(__name__)

SUGGEST_SYSTEM_PROMPT = """\
You are a classification engine for a personal mastery tracker.

Given a description of a learning/practice session, identify which
pillars it belongs to and suggest sub-topic hints.

## The Five Pillars

{pillars_context}

## Rules
- Suggest 1-3 pillars maximum. Most entries map to 1-2.
- Confidence: 0.0-1.0. Only suggest pillars with confidence >= 0.3.
- Sub-topic hints: specific areas within the pillar
  (e.g., "stochastic calculus", "derivatives pricing").
- Be precise. Don't suggest a pillar unless the activity clearly relates to it.

Use the submit_tag_suggestions tool to return your suggestions."""

SUGGEST_SCHEMA = {
    "type": "object",
    "properties": {
        "suggestions": {
            "type": "array",
            "items": {
                "type": "object",
                "properties": {
                    "pillar_id": {"type": "integer"},
                    "pillar_name": {"type": "string"},
                    "confidence": {"type": "number", "minimum": 0.0, "maximum": 1.0},
                    "sub_topics": {"type": "array", "items": {"type": "string"}},
                },
                "required": ["pillar_id", "pillar_name", "confidence", "sub_topics"],
            },
        },
    },
    "required": ["suggestions"],
}


def _build_pillars_context(pillars: list[Pillar]) -> str:
    """Build pillar descriptions for the system prompt."""
    lines = []
    for p in pillars:
        lines.append(f"{p.id}. **{p.name}** ({p.short_name}): {p.description}")
    return "\n".join(lines)


async def suggest_tags(description: str, db: Session) -> list[dict[str, Any]]:
    """Analyze description text and suggest pillar tags.

    Uses Haiku for speed and cost efficiency — this is a simple classification task.

    Args:
        description: Free-text description of the learning session.
        db: Database session.

    Returns:
        List of suggestion dicts with pillar_id, pillar_name, confidence, sub_topics.
    """
    pillars = db.query(Pillar).order_by(Pillar.display_order).all()
    pillars_context = _build_pillars_context(pillars)
    system_prompt = SUGGEST_SYSTEM_PROMPT.format(pillars_context=pillars_context)

    user_prompt = f"Classify this learning session:\n\n{description}"

    parsed = await structured_output(
        system=system_prompt,
        user_prompt=user_prompt,
        tool_name="submit_tag_suggestions",
        tool_description="Submit pillar tag suggestions with confidence scores and sub-topic hints.",
        output_schema=SUGGEST_SCHEMA,
        model=HAIKU,
    )

    valid_ids = {p.id for p in pillars}
    suggestions = []
    for s in parsed.get("suggestions", []):
        pid = int(s["pillar_id"])
        if pid not in valid_ids:
            continue
        confidence = max(0.0, min(1.0, float(s["confidence"])))
        if confidence < 0.3:
            continue
        suggestions.append(
            {
                "pillar_id": pid,
                "pillar_name": str(s["pillar_name"]),
                "confidence": round(confidence, 2),
                "sub_topics": [str(t) for t in s.get("sub_topics", [])],
            }
        )

    suggestions.sort(key=lambda x: x["confidence"], reverse=True)
    return suggestions
