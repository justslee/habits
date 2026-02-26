"""AI Evaluation Engine — Claude integration via Clawdbot.

Routes LLM calls through Clawdbot at localhost:18789 (D-012).
Engineered for brutal honesty (D-003 — no participation trophies).
"""

import json
import logging
import os
from typing import Any

import httpx
from sqlalchemy.orm import Session

from app.models.daily_entry import DailyEntry
from app.models.evaluation import Evaluation
from app.models.pillar import Pillar
from app.services.adaptive import build_adaptive_context_block, calculate_consistency_multiplier

logger = logging.getLogger(__name__)

CLAWDBOT_URL = "http://localhost:18789/v1/chat/completions"
CLAWDBOT_MODEL = "claude-sonnet-4-20250514"

# IMPORTANT: Do not hardcode tokens in the repo.
# Set CLAWDBOT_TOKEN (or OPENCLAW_GATEWAY_TOKEN) in the environment.
CLAWDBOT_TOKEN = os.getenv("CLAWDBOT_TOKEN") or os.getenv("OPENCLAW_GATEWAY_TOKEN")

SYSTEM_PROMPT = """You are the Honest Mirror — a brutally honest AI evaluator for a personal mastery tracking system.

Your job: evaluate whether a learning/practice session actually made the user 1% better at their craft.

## Your Values
- NO participation trophies. Showing up is not enough.
- Surface-level engagement gets called out ruthlessly.
- Difficulty and depth matter more than time spent.
- Re-reading easy material you already know scores near zero.
- Struggling with genuinely hard material scores high even if incomplete.
- Relevance to the pillar's depth target matters.

## Scoring Guidelines

### Depth Score (0-100)
- 0-20: Surface skimming. Watching a YouTube overview. Reading a blog post summary.
- 21-40: Textbook reading without active engagement. Passive consumption.
- 41-60: Active learning — working problems, writing notes, building something.
- 61-80: Deep engagement — tackling hard problems, original thinking, teaching others.
- 81-100: Research-level depth — proving theorems, building novel systems, publishing-quality work.

### Relevance Score (0-100)
- 0-20: Barely related to the pillar. Tangential at best.
- 21-40: Related but not directly advancing toward the depth target.
- 41-60: Directly relevant, standard curriculum material.
- 61-80: Highly relevant, advancing toward the stated depth target.
- 81-100: Precisely what's needed to reach the next level in this pillar.

### 1% Better Verdict
Ask: "If they did exactly this every day for a year, would they be meaningfully better?"
- YES only if the session had genuine depth AND moved the needle.
- NO if it was maintenance, busy work, or comfort zone activity.

## Response Format
You MUST respond with valid JSON only. No markdown, no explanation outside the JSON.
{
  "depth_score": <int 0-100>,
  "relevance_score": <int 0-100>,
  "one_percent_better": <true|false>,
  "verdict_explanation": "<1-2 sentences explaining the verdict>",
  "commentary": "<2-4 sentences of brutally honest feedback>"
}"""


def _build_user_prompt(entry: DailyEntry, pillars: list[Pillar]) -> str:
    """Build the user prompt from an entry."""
    pillar_names = []
    pillar_map = {p.id: p for p in pillars}
    for pid in entry.pillar_tag_list:
        p = pillar_map.get(pid)
        if p:
            pillar_names.append(f"{p.name} (target: {p.depth_target})")

    return f"""Evaluate this learning session:

**Description:** {entry.description}
**Time invested:** {entry.time_invested_minutes} minutes
**Pillars:** {', '.join(pillar_names) if pillar_names else 'None tagged'}
**Self-rated difficulty:** {entry.difficulty_rating}/10
**Energy/focus level:** {entry.energy_level}/10
**Key takeaway:** {entry.key_takeaway or 'None provided'}

Be brutally honest. No sugar coating."""


async def call_clawdbot(system_prompt: str, user_prompt: str) -> dict[str, Any]:
    """Call Clawdbot's OpenAI-compatible chat completions endpoint."""
    payload = {
        "model": CLAWDBOT_MODEL,
        "messages": [
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": user_prompt},
        ],
        "temperature": 0.3,
    }

    if not CLAWDBOT_TOKEN:
        raise RuntimeError(
            "Missing CLAWDBOT_TOKEN (or OPENCLAW_GATEWAY_TOKEN) env var for Clawdbot auth"
        )

    headers = {"Authorization": f"Bearer {CLAWDBOT_TOKEN}"}
    async with httpx.AsyncClient(timeout=60.0) as client:
        response = await client.post(CLAWDBOT_URL, json=payload, headers=headers)
        response.raise_for_status()
        return response.json()


def parse_llm_response(raw_response: dict[str, Any]) -> dict[str, Any]:
    """Parse the LLM response into evaluation fields."""
    content = raw_response["choices"][0]["message"]["content"]

    # Strip markdown code fences if present
    content = content.strip()
    if content.startswith("```"):
        content = content.split("\n", 1)[1] if "\n" in content else content[3:]
        if content.endswith("```"):
            content = content[:-3]
        content = content.strip()

    parsed = json.loads(content)

    # Validate and clamp scores
    depth = max(0, min(100, int(parsed["depth_score"])))
    relevance = max(0, min(100, int(parsed["relevance_score"])))

    return {
        "depth_score": depth,
        "relevance_score": relevance,
        "one_percent_better": bool(parsed["one_percent_better"]),
        "verdict_explanation": str(parsed["verdict_explanation"]),
        "commentary": str(parsed["commentary"]),
    }


async def evaluate_entry(entry: DailyEntry, db: Session) -> Evaluation:
    """Evaluate an entry using the AI engine and store the result.

    Args:
        entry: The DailyEntry to evaluate.
        db: Database session.

    Returns:
        The created Evaluation object.
    """
    # Load pillars for context
    pillars = db.query(Pillar).all()

    user_prompt = _build_user_prompt(entry, pillars)

    # TASK-006: Adaptive calibration — inject user level context
    adaptive_block = build_adaptive_context_block(
        entry.user_id, entry.pillar_tag_list, db
    )
    system_prompt = SYSTEM_PROMPT
    if adaptive_block:
        system_prompt = SYSTEM_PROMPT + "\n" + adaptive_block

    # TASK-006: Calculate consistency multiplier from streak data
    consistency_mult = calculate_consistency_multiplier(
        entry.user_id, entry.pillar_tag_list, db
    )

    raw_response = await call_clawdbot(system_prompt, user_prompt)
    parsed = parse_llm_response(raw_response)

    evaluation = Evaluation(
        entry_id=entry.id,
        depth_score=parsed["depth_score"],
        relevance_score=parsed["relevance_score"],
        consistency_multiplier=consistency_mult,
        one_percent_better=parsed["one_percent_better"],
        verdict_explanation=parsed["verdict_explanation"],
        commentary=parsed["commentary"],
        raw_llm_response=json.dumps(raw_response),
    )

    db.add(evaluation)
    db.commit()
    db.refresh(evaluation)

    return evaluation
