"""AI Evaluation Engine — Claude integration via Anthropic SDK.

Engineered for brutal honesty (D-003 — no participation trophies).
Uses tool_use for structured outputs — no more JSON-in-prompt.
"""

import json
import logging
from typing import Any

from sqlalchemy.orm import Session

from app.models.daily_entry import DailyEntry
from app.models.evaluation import Evaluation
from app.models.pillar import Pillar
from app.models.vision import Vision
from app.services.adaptive import build_adaptive_context_block, calculate_consistency_multiplier
from app.services.llm import SONNET, structured_output

logger = logging.getLogger(__name__)

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
Return their names EXACTLY as listed (case-sensitive match required)."""

EVALUATION_SCHEMA = {
    "type": "object",
    "properties": {
        "depth_score": {"type": "integer", "minimum": 0, "maximum": 100, "description": "How deep the engagement was (0=surface, 100=research-level)"},
        "relevance_score": {"type": "integer", "minimum": 0, "maximum": 100, "description": "How relevant to the pillar's depth target (0=tangential, 100=bullseye)"},
        "one_percent_better": {"type": "boolean", "description": "Would doing this daily for a year make them meaningfully better?"},
        "verdict_explanation": {"type": "string", "description": "1-2 sentences explaining the verdict"},
        "commentary": {"type": "string", "description": "2-4 sentences of brutally honest feedback"},
        "concepts_touched": {
            "type": "array",
            "items": {"type": "string"},
            "description": "Exact names of concepts touched in this session (case-sensitive match to provided list)",
        },
    },
    "required": ["depth_score", "relevance_score", "one_percent_better", "verdict_explanation", "commentary", "concepts_touched"],
}


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


async def evaluate_with_tool_use(system_prompt: str, user_prompt: str) -> dict[str, Any]:
    """Evaluate an entry using tool_use structured output.

    Returns the parsed evaluation dict directly — no JSON parsing needed.
    """
    return await structured_output(
        system=system_prompt,
        user_prompt=user_prompt,
        tool_name="submit_evaluation",
        tool_description="Submit the evaluation scores, verdict, commentary, and concepts touched for this learning session.",
        output_schema=EVALUATION_SCHEMA,
        model=SONNET,
        temperature=0.3,
    )


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


OVERALL_DAY_SYSTEM_PROMPT = """You are the Honest Mirror — a brutally honest AI evaluator for a personal mastery tracking system.

Your job: give ONE overall verdict on whether today moved the needle. You'll see all the work done across multiple pillars/domains.

## Your Values
- NO participation trophies. Showing up is not enough.
- Surface-level work across many pillars doesn't beat deep work in one.
- Jumping between domains without depth is scattered, not productive.
- Genuine difficulty and depth matter more than time spent.

## Scoring Guidelines

### Depth Score (0-100) — Overall Day
Rate the DEEPEST work done today. If one pillar had research-level depth, score high even if others were shallow.
- 0-20: Fully surface-level across the board.
- 21-40: Passive consumption. Reading, watching, no active engagement anywhere.
- 41-60: Some active work. Problems attempted, things built.
- 61-80: Real engagement with hard material. Deep work happened.
- 81-100: Exceptional depth. Research-quality sessions, novel problem solving.

### Relevance Score (0-100)
How well did today's work advance the user's stated goals and pillar depth targets?

### 1% Better Verdict — Overall Day
Was today a 1% better day?
- YES only if there was genuine depth AND real progress in at least one pillar.
- NO if it was all maintenance, easy tasks, or comfort-zone work.

## Response Format
You MUST respond with valid JSON only. No markdown, no explanation outside the JSON.
{
  "depth_score": <int 0-100>,
  "relevance_score": <int 0-100>,
  "one_percent_better": <true|false>,
  "verdict_explanation": "<1-2 sentences overall verdict>",
  "commentary": "<3-5 sentences holistic assessment mentioning specific pillars and work done>",
  "concepts_touched": ["<exact concept name 1>", "<exact concept name 2>"]
}"""


def _build_overall_day_prompt(
    entry: DailyEntry,
    pillar_summaries: list[dict],
    pillars: list[Pillar],
    db: Session = None,
) -> str:
    """Build a holistic day prompt covering all pillars at once."""
    pillar_lines = []
    for ps in pillar_summaries:
        pillar_lines.append(
            f"  • {ps['pillar_name']} (target: {ps['depth_target']}, {ps['time_minutes']}min): {ps['todos']}"
        )
    pillar_section = "\n".join(pillar_lines)

    concepts_block = ""
    if db and entry.pillar_tag_list:
        from app.models.concept import PillarConcept
        pillar_map = {p.id: p for p in pillars}
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
                pname = pillar_map.get(c.pillar_id)
                pname = pname.name if pname else f"Pillar {c.pillar_id}"
                concept_lines.append(f"- [{pname}] Tier {c.tier}: {c.name}")
            concepts_block = "\n\n**Available concepts (identify which were touched):**\n" + "\n".join(concept_lines)

    return f"""Evaluate this overall day of learning and practice:

**Work done today:**
{pillar_section}

**Total time invested:** {entry.time_invested_minutes} minutes
**Self-rated focus:** {entry.difficulty_rating}/10
**Energy level:** {entry.energy_level}/10
**Key takeaway:** {entry.key_takeaway or 'None provided'}

Give ONE holistic assessment. Comment on depth, breadth, and whether this was a genuinely productive day. Be brutally honest.{concepts_block}"""


async def evaluate_overall_day(
    entry: DailyEntry,
    pillar_summaries: list[dict],
    db: Session,
) -> Evaluation:
    """Evaluate an entire day holistically across all pillars with one AI call.

    Args:
        entry: Combined DailyEntry with all pillar_ids tagged.
        pillar_summaries: List of dicts with pillar_id, pillar_name, depth_target, time_minutes, todos.
        db: Database session.

    Returns:
        The created Evaluation object.
    """
    pillars = db.query(Pillar).all()

    user_prompt = _build_overall_day_prompt(entry, pillar_summaries, pillars, db)

    adaptive_block = build_adaptive_context_block(
        entry.user_id, entry.pillar_tag_list, db
    )
    system_prompt = OVERALL_DAY_SYSTEM_PROMPT
    if adaptive_block:
        system_prompt = system_prompt + "\n" + adaptive_block

    vision_block = _build_vision_context(
        entry.user_id, entry.pillar_tag_list, pillars, db
    )
    if vision_block:
        system_prompt = system_prompt + "\n" + vision_block

    consistency_mult = calculate_consistency_multiplier(
        entry.user_id, entry.pillar_tag_list, db
    )

    parsed = await evaluate_with_tool_use(system_prompt, user_prompt)

    evaluation = Evaluation(
        entry_id=entry.id,
        depth_score=parsed["depth_score"],
        relevance_score=parsed["relevance_score"],
        consistency_multiplier=consistency_mult,
        one_percent_better=parsed["one_percent_better"],
        verdict_explanation=parsed["verdict_explanation"],
        commentary=parsed["commentary"],
        raw_llm_response=json.dumps(parsed),
    )

    db.add(evaluation)
    db.flush()

    # Record concept touches
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

            touch_count = (
                db.query(func.count(ConceptTouch.id))
                .filter(ConceptTouch.concept_id == concept.id)
                .scalar()
            ) + 1

            avg_depth = (
                db.query(func.avg(ConceptTouch.depth_score))
                .filter(
                    ConceptTouch.concept_id == concept.id,
                    ConceptTouch.depth_score.isnot(None),
                )
                .scalar()
            )
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

    parsed = await evaluate_with_tool_use(system_prompt, user_prompt)

    # Clamp scores (schema enforces range but belt-and-suspenders)
    depth = max(0, min(100, int(parsed["depth_score"])))
    relevance = max(0, min(100, int(parsed["relevance_score"])))

    evaluation = Evaluation(
        entry_id=entry.id,
        depth_score=depth,
        relevance_score=relevance,
        consistency_multiplier=consistency_mult,
        one_percent_better=bool(parsed["one_percent_better"]),
        verdict_explanation=str(parsed["verdict_explanation"]),
        commentary=str(parsed["commentary"]),
        raw_llm_response=json.dumps(parsed),
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
