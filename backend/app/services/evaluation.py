"""AI Evaluation Engine — Claude integration via Anthropic SDK.

Engineered for brutal honesty (D-003 — no participation trophies).
"""

import json
import logging
import os
from typing import Any

import anthropic
from sqlalchemy.orm import Session

from app.models.daily_entry import DailyEntry
from app.models.evaluation import Evaluation
from app.models.pillar import Pillar
from app.models.vision import Vision
from app.services.adaptive import build_adaptive_context_block, calculate_consistency_multiplier

logger = logging.getLogger(__name__)

ANTHROPIC_MODEL = "claude-opus-4-6"

# IMPORTANT: Do not hardcode API keys in the repo.
# Set ANTHROPIC_API_KEY in the environment.
ANTHROPIC_API_KEY = os.getenv("ANTHROPIC_API_KEY")

# Module-level singleton — reuses connection pool across all calls.
_anthropic_client: anthropic.AsyncAnthropic | None = None


def _get_client() -> anthropic.AsyncAnthropic:
    global _anthropic_client
    if _anthropic_client is None:
        if not ANTHROPIC_API_KEY:
            raise RuntimeError("Missing ANTHROPIC_API_KEY env var")
        _anthropic_client = anthropic.AsyncAnthropic(api_key=ANTHROPIC_API_KEY)
    return _anthropic_client

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

### Concept Identification
You will also receive a list of the user's tracked concepts for relevant pillars.
Identify which specific concepts were touched/practiced in this session.
Return their names EXACTLY as listed (case-sensitive match required).

## Response Format
You MUST respond with valid JSON only. No markdown, no explanation outside the JSON.
{
  "depth_score": <int 0-100>,
  "relevance_score": <int 0-100>,
  "one_percent_better": <true|false>,
  "verdict_explanation": "<1-2 sentences explaining the verdict>",
  "commentary": "<2-4 sentences of brutally honest feedback>",
  "concepts_touched": ["<exact concept name 1>", "<exact concept name 2>"]
}"""


def _build_user_prompt(entry: DailyEntry, pillars: list[Pillar], db: Session = None) -> str:
    """Build the user prompt from an entry."""
    pillar_names = []
    pillar_map = {p.id: p for p in pillars}
    for pid in entry.pillar_tag_list:
        p = pillar_map.get(pid)
        if p:
            pillar_names.append(f"{p.name} (target: {p.depth_target})")

    # Include available concepts for concept identification
    concepts_block = ""
    if db and entry.pillar_tag_list:
        from app.models.concept import PillarConcept
        concepts = (
            db.query(PillarConcept)
            .filter(
                PillarConcept.pillar_id.in_(entry.pillar_tag_list),
                PillarConcept.user_id == entry.user_id,
            )
            .order_by(PillarConcept.tier, PillarConcept.sort_order)
            .all()
        )
        if concepts:
            concept_lines = []
            for c in concepts:
                pname = pillar_map.get(c.pillar_id, None)
                pname = pname.name if pname else f"Pillar {c.pillar_id}"
                concept_lines.append(f"- [{pname}] Tier {c.tier}: {c.name}")
            concepts_block = "\n\n**Available concepts (identify which were touched):**\n" + "\n".join(concept_lines)

    return f"""Evaluate this learning session:

**Description:** {entry.description}
**Time invested:** {entry.time_invested_minutes} minutes
**Pillars:** {', '.join(pillar_names) if pillar_names else 'None tagged'}
**Self-rated difficulty:** {entry.difficulty_rating}/10
**Energy/focus level:** {entry.energy_level}/10
**Key takeaway:** {entry.key_takeaway or 'None provided'}

Be brutally honest. No sugar coating.{concepts_block}"""


async def call_clawdbot(system_prompt: str, user_prompt: str, temperature: float = 0.3) -> dict[str, Any]:
    """Call Claude via Anthropic SDK. Returns an OpenAI-compatible dict for backward compatibility."""
    client = _get_client()
    response = await client.messages.create(
        model=ANTHROPIC_MODEL,
        max_tokens=4096,
        temperature=temperature,
        system=system_prompt,
        messages=[{"role": "user", "content": user_prompt}],
    )
    # Wrap in OpenAI-compatible shape so all callers work unchanged.
    return {"choices": [{"message": {"content": response.content[0].text}}]}


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

    concepts_touched = parsed.get("concepts_touched", [])
    if not isinstance(concepts_touched, list):
        concepts_touched = []

    return {
        "depth_score": depth,
        "relevance_score": relevance,
        "one_percent_better": bool(parsed["one_percent_better"]),
        "verdict_explanation": str(parsed["verdict_explanation"]),
        "commentary": str(parsed["commentary"]),
        "concepts_touched": concepts_touched,
    }


def _build_vision_context(user_id: int, pillar_ids: list[int], pillars: list[Pillar], db: Session) -> str:
    """Build a context block from the user's Vision statement (D-020, P5-7).

    Injected into the AI system prompt so evaluations are aligned with the
    user's North Star, pillar-specific targets, and anti-goals.
    """
    vision = db.query(Vision).filter(Vision.user_id == user_id).first()
    if not vision:
        return ""

    parts = []
    parts.append("\n## User's North Star Vision")

    if vision.vision_text:
        parts.append(f"**Vision:** {vision.vision_text}")

    if vision.pillar_targets:
        try:
            targets = json.loads(vision.pillar_targets)
            pillar_map = {p.id: p.name for p in pillars}
            relevant = []
            for pid in pillar_ids:
                target = targets.get(str(pid))
                pname = pillar_map.get(pid, f"Pillar {pid}")
                if target:
                    relevant.append(f"- {pname}: {target}")
            if relevant:
                parts.append("**Pillar-specific targets for this session:**")
                parts.extend(relevant)
        except (json.JSONDecodeError, TypeError):
            pass

    if vision.anti_goals:
        try:
            anti = json.loads(vision.anti_goals)
            if anti:
                parts.append("**Anti-goals (things the user explicitly does NOT want):**")
                for ag in anti:
                    parts.append(f"- {ag}")
        except (json.JSONDecodeError, TypeError):
            pass

    parts.append(
        "\nUse this vision to calibrate relevance scoring. "
        "Sessions that directly advance the user's stated vision and pillar targets "
        "should score higher on relevance. Sessions that conflict with anti-goals "
        "should be flagged."
    )

    return "\n".join(parts)


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

    user_prompt = _build_user_prompt(entry, pillars, db)

    # TASK-006: Adaptive calibration — inject user level context
    adaptive_block = build_adaptive_context_block(
        entry.user_id, entry.pillar_tag_list, db
    )
    system_prompt = SYSTEM_PROMPT
    if adaptive_block:
        system_prompt = SYSTEM_PROMPT + "\n" + adaptive_block

    # D-020: Inject vision context for relevance alignment
    vision_block = _build_vision_context(
        entry.user_id, entry.pillar_tag_list, pillars, db
    )
    if vision_block:
        system_prompt = system_prompt + "\n" + vision_block

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
    db.flush()

    # Record concept touches and auto-update statuses
    concepts_touched_names = parsed.get("concepts_touched", [])
    if concepts_touched_names and entry.pillar_tag_list:
        from app.models.concept import PillarConcept
        from app.models.concept_touch import ConceptTouch
        from sqlalchemy import func

        for name in concepts_touched_names:
            concept = (
                db.query(PillarConcept)
                .filter(
                    PillarConcept.user_id == entry.user_id,
                    PillarConcept.pillar_id.in_(entry.pillar_tag_list),
                    PillarConcept.name == name,
                )
                .first()
            )
            if not concept:
                continue

            touch = ConceptTouch(
                concept_id=concept.id,
                entry_id=entry.id,
                evaluation_id=evaluation.id,
                touch_date=entry.entry_date,
                depth_score=evaluation.depth_score,
            )
            db.add(touch)

            # Auto-update concept status based on touch history
            touch_count = (
                db.query(func.count(ConceptTouch.id))
                .filter(ConceptTouch.concept_id == concept.id)
                .scalar()
            ) + 1  # include current touch

            avg_depth = (
                db.query(func.avg(ConceptTouch.depth_score))
                .filter(
                    ConceptTouch.concept_id == concept.id,
                    ConceptTouch.depth_score.isnot(None),
                )
                .scalar()
            )
            # Weight in current depth
            if avg_depth is not None and evaluation.depth_score:
                total_existing = touch_count - 1
                avg_depth = ((avg_depth * total_existing) + evaluation.depth_score) / touch_count

            if concept.status == "not_started" and touch_count >= 1:
                concept.status = "in_progress"
            if concept.status == "in_progress" and touch_count >= 3 and avg_depth and avg_depth >= 70:
                concept.status = "mastered"

    db.commit()
    db.refresh(evaluation)

    return evaluation
