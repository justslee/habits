"""Auto-suggest pillar tags using Claude (D-012).

Analyzes entry description text and suggests relevant pillars
with confidence scores and sub-topic hints.
"""

import json
import logging
from typing import Any

from sqlalchemy.orm import Session

from app.models.pillar import Pillar
from app.services.evaluation import call_claude

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

## Response Format
Respond with valid JSON only. No markdown, no explanation outside the JSON.
{{
  "suggestions": [
    {{
      "pillar_id": <int>,
      "pillar_name": "<string>",
      "confidence": <float 0.0-1.0>,
      "sub_topics": ["<topic1>", "<topic2>"]
    }}
  ]
}}"""


def _build_pillars_context(pillars: list[Pillar]) -> str:
    """Build pillar descriptions for the system prompt."""
    lines = []
    for p in pillars:
        lines.append(f"{p.id}. **{p.name}** ({p.short_name}): {p.description}")
    return "\n".join(lines)


async def suggest_tags(description: str, db: Session) -> list[dict[str, Any]]:
    """Analyze description text and suggest pillar tags.

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

    raw_response = await call_claude(system_prompt, user_prompt)
    return parse_suggest_response(raw_response, pillars)


def parse_suggest_response(
    raw_response: dict[str, Any], pillars: list[Pillar]
) -> list[dict[str, Any]]:
    """Parse LLM response into suggestion list."""
    content = raw_response["choices"][0]["message"]["content"]

    # Strip markdown code fences if present
    content = content.strip()
    if content.startswith("```"):
        content = content.split("\n", 1)[1] if "\n" in content else content[3:]
        if content.endswith("```"):
            content = content[:-3]
        content = content.strip()

    parsed = json.loads(content)
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

    # Sort by confidence descending
    suggestions.sort(key=lambda x: x["confidence"], reverse=True)
    return suggestions
