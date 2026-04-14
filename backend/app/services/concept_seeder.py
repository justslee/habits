"""LLM-powered concept tree seeder (P5-2) — Enhanced with Research Mode.

Three-stage pipeline:
1. **Notion KB Scan**: Fetches user's Knowledge Base to understand what they've
   already studied, their confidence levels, and gaps.
2. **Web Research**: Performs web searches (Brave/Tavily) to gather the latest
   information, then synthesizes into a research brief.
3. **Concept Synthesis**: Feeds everything (Notion KB + research + Vision) into
   a final LLM call that generates a personalized concept tree.

Supports two seeding modes:
- `quick`: Vision-only context, single LLM call (original behavior)
- `research`: Full 3-stage pipeline with Notion KB + web research + Vision
"""

from __future__ import annotations

import json
import logging
from typing import Any

from sqlalchemy.orm import Session

from app.models.concept import PillarConcept
from app.models.pillar import Pillar
from app.models.user import User
from app.models.vision import Vision
from app.services.evaluation import call_claude
from app.services.notion_kb import get_kb_summary_for_pillar, KBSummary
from app.services.web_research import research_pillar, ResearchBrief

logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# System prompts
# ---------------------------------------------------------------------------

SEEDER_SYSTEM_PROMPT = """You are an expert curriculum designer and mastery coach.

Your job: Generate a comprehensive concept tree for a specific learning pillar.
The tree should map out everything someone needs to learn to achieve deep mastery,
organized in 5 tiers from foundational to frontier.

## Tier Definitions
- **Tier 1 — Foundation** (8-15 concepts): Core prerequisites. Things you MUST know before anything else.
  Examples: basic terminology, fundamental principles, prerequisite math/skills.
- **Tier 2 — Core** (10-20 concepts): Standard curriculum material. The bread and butter of the discipline.
  Examples: key techniques, standard tools, essential frameworks.
- **Tier 3 — Advanced** (10-20 concepts): Deep competence. Requires significant practice and understanding.
  Examples: advanced techniques, integration of multiple concepts, real-world application.
- **Tier 4 — Expert** (5-15 concepts): Specialist knowledge. Distinguishes practitioners from experts.
  Examples: cutting-edge methods, research-level understanding, novel synthesis.
- **Tier 5 — Frontier** (3-10 concepts): Pushing boundaries. Original contribution territory.
  Examples: open problems, emerging research, novel frameworks, publishable work.

## Rules
- Generate 40-80 concepts total, distributed across tiers as indicated above.
- Each concept should be specific and actionable (not vague categories).
- Prerequisites should reference other concept names from the same tree.
- Key resources should be specific books, papers, courses, or tools.
- Description should be 1-2 sentences explaining what mastery of this concept looks like.
- Sort concepts within each tier from most foundational to most advanced.

## Response Format
You MUST respond with valid JSON only. No markdown, no explanation outside the JSON.
{
  "concepts": [
    {
      "name": "Concept Name",
      "tier": 1,
      "description": "What mastery of this concept looks like.",
      "prerequisites": ["Other Concept Name"],
      "key_resources": "Specific book/paper/course/tool",
      "sort_order": 1
    }
  ]
}"""

RESEARCH_SEEDER_SYSTEM_PROMPT = """You are an expert curriculum designer, mastery coach, and research synthesizer.

Your job: Generate a comprehensive, PERSONALIZED concept tree for a specific learning pillar.
You have been given THREE sources of context:

1. **The user's Notion Knowledge Base** — topics they've already studied, with confidence ratings.
   Use this to understand their current level and identify gaps.
2. **A web research brief** — the latest developments, resources, and frontier topics in the field.
   Use this to ensure the concept tree is CURRENT and includes cutting-edge material.
3. **The user's Vision statement** — their North Star, pillar-specific targets, and anti-goals.
   Use this to prioritize concepts that align with their specific career path.

## Personalization Rules
- If the user has already mastered a topic (High/Completed in their KB), still include it but
  add "(reviewed)" to the description so they know it's covered.
- If the user has Low confidence on a topic, mark it as a priority in the description.
- Identify GAPS — important topics that are NOT in their KB at all. These are the most valuable.
- Use the web research to include topics/resources that are NEW (2024-2026) and wouldn't be
  in older textbooks.
- Weight the tree toward the user's specific vision/targets, not generic curriculum.

## Tier Definitions
- **Tier 1 — Foundation** (8-15 concepts): Core prerequisites. Things you MUST know before anything else.
- **Tier 2 — Core** (10-20 concepts): Standard curriculum material. The bread and butter.
- **Tier 3 — Advanced** (10-20 concepts): Deep competence. Integration + real-world application.
- **Tier 4 — Expert** (5-15 concepts): Specialist knowledge. Cutting-edge methods.
- **Tier 5 — Frontier** (3-10 concepts): Pushing boundaries. Original contribution territory.

## Rules
- Generate 50-80 concepts total (research mode produces more thorough trees).
- Each concept should be specific and actionable (not vague categories).
- Prerequisites should reference other concept names from the same tree.
- Key resources should be specific books, papers, courses, or tools — CURRENT ones from the research.
- Description should be 1-2 sentences explaining what mastery looks like. Flag if user already knows it.
- Sort concepts within each tier from most foundational to most advanced.

## Response Format
You MUST respond with valid JSON only. No markdown, no explanation outside the JSON.
{
  "concepts": [
    {
      "name": "Concept Name",
      "tier": 1,
      "description": "What mastery of this concept looks like. (reviewed) if user knows it. PRIORITY if low confidence.",
      "prerequisites": ["Other Concept Name"],
      "key_resources": "Specific book/paper/course/tool — prefer current resources from research",
      "sort_order": 1
    }
  ]
}"""


# ---------------------------------------------------------------------------
# Prompt builders
# ---------------------------------------------------------------------------

def _get_vision_target(vision: Vision | None, pillar_id: int) -> str | None:
    """Extract the specific pillar target from Vision."""
    if not vision or not vision.pillar_targets:
        return None
    try:
        targets = json.loads(vision.pillar_targets)
        return targets.get(str(pillar_id))
    except (json.JSONDecodeError, TypeError):
        return None


def _build_quick_prompt(pillar: Pillar, vision: Vision | None) -> str:
    """Build the user prompt for quick (Vision-only) concept tree generation."""
    parts = [f"Generate a concept tree for the pillar: **{pillar.name}**"]

    if pillar.depth_target:
        parts.append(f"\nPillar depth target: {pillar.depth_target}")

    if vision:
        if vision.vision_text:
            parts.append(f"\nUser's North Star Vision: {vision.vision_text}")

        target = _get_vision_target(vision, pillar.id)
        if target:
            parts.append(f"\nSpecific target for this pillar: {target}")

        if vision.anti_goals:
            try:
                anti = json.loads(vision.anti_goals)
                if anti:
                    parts.append(f"\nAnti-goals (avoid these): {', '.join(anti)}")
            except (json.JSONDecodeError, TypeError):
                pass

    parts.append(
        "\nGenerate a research-depth concept tree. Be specific — use real textbook "
        "chapters, real paper titles, real tools. No generic platitudes."
    )

    return "\n".join(parts)


def _build_research_prompt(
    pillar: Pillar,
    vision: Vision | None,
    kb_summary: KBSummary | None,
    research_brief: ResearchBrief | None,
) -> str:
    """Build the comprehensive user prompt with Notion KB + web research + Vision."""
    parts = [f"Generate a PERSONALIZED concept tree for the pillar: **{pillar.name}**"]

    if pillar.depth_target:
        parts.append(f"\nPillar depth target: {pillar.depth_target}")

    # --- Vision Context ---
    if vision:
        parts.append("\n--- USER'S VISION ---")
        if vision.vision_text:
            parts.append(f"North Star: {vision.vision_text}")

        target = _get_vision_target(vision, pillar.id)
        if target:
            parts.append(f"Specific target for this pillar: {target}")

        if vision.anti_goals:
            try:
                anti = json.loads(vision.anti_goals)
                if anti:
                    parts.append(f"Anti-goals (avoid these): {', '.join(anti)}")
            except (json.JSONDecodeError, TypeError):
                pass

    # --- Notion KB Context ---
    if kb_summary and kb_summary.total_entries > 0:
        parts.append(f"\n{kb_summary.to_context_block()}")
    else:
        parts.append("\n--- NOTION KNOWLEDGE BASE ---")
        parts.append("No existing Knowledge Base entries found for this pillar.")
        parts.append("The user is starting from scratch — emphasize foundational concepts.")

    # --- Web Research Context ---
    if research_brief and (research_brief.synthesis or research_brief.key_topics):
        parts.append(f"\n{research_brief.to_context_block()}")
    else:
        parts.append("\n--- WEB RESEARCH ---")
        parts.append("No web research available. Use your training data for current topics.")

    # --- Final instruction ---
    parts.append(
        "\n--- INSTRUCTION ---"
        "\nUsing ALL the context above (Vision, Knowledge Base, Web Research), generate "
        "a comprehensive, personalized concept tree. Key priorities:"
        "\n1. Fill GAPS — topics missing from the user's KB are highest priority"
        "\n2. Include CURRENT resources from the web research (2024-2026)"
        "\n3. Align with the user's specific Vision and pillar targets"
        "\n4. Flag topics the user already knows (from KB) with '(reviewed)' in description"
        "\n5. Flag topics with Low confidence as 'PRIORITY' in description"
        "\n6. Be extremely specific — real papers, real tools, real textbook chapters"
    )

    return "\n".join(parts)


# ---------------------------------------------------------------------------
# Response parsing
# ---------------------------------------------------------------------------

def _parse_seeder_response(raw_response: dict[str, Any]) -> list[dict]:
    """Parse the LLM response into a list of concept dicts."""
    content = raw_response["choices"][0]["message"]["content"]

    # Strip markdown code fences if present
    content = content.strip()
    if content.startswith("```"):
        content = content.split("\n", 1)[1] if "\n" in content else content[3:]
        if content.endswith("```"):
            content = content[:-3]
        content = content.strip()

    parsed = json.loads(content)
    concepts = parsed.get("concepts", [])

    # Validate and clean
    cleaned = []
    for c in concepts:
        tier = max(1, min(5, int(c.get("tier", 1))))
        cleaned.append({
            "name": str(c.get("name", "Unnamed"))[:200],
            "tier": tier,
            "description": str(c.get("description", "")) if c.get("description") else None,
            "prerequisites": json.dumps(c.get("prerequisites", [])) if c.get("prerequisites") else None,
            "key_resources": str(c.get("key_resources", "")) if c.get("key_resources") else None,
            "sort_order": int(c.get("sort_order", 0)),
        })

    return cleaned


# ---------------------------------------------------------------------------
# Persistence
# ---------------------------------------------------------------------------

def _persist_concepts(
    concept_dicts: list[dict],
    pillar_id: int,
    user_id: int,
    db: Session,
) -> list[PillarConcept]:
    """Delete existing concepts and bulk-create new ones."""
    # Delete existing concepts for this pillar + user
    db.query(PillarConcept).filter(
        PillarConcept.pillar_id == pillar_id,
        PillarConcept.user_id == user_id,
    ).delete()

    # Bulk create
    created = []
    for cd in concept_dicts:
        concept = PillarConcept(
            pillar_id=pillar_id,
            user_id=user_id,
            name=cd["name"],
            tier=cd["tier"],
            description=cd["description"],
            prerequisites=cd["prerequisites"],
            key_resources=cd["key_resources"],
            sort_order=cd["sort_order"],
            status="not_started",
        )
        db.add(concept)
        created.append(concept)

    db.commit()
    for c in created:
        db.refresh(c)

    return created


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------

async def seed_pillar_concepts(
    pillar_id: int,
    db: Session,
    mode: str = "quick",
) -> list[PillarConcept]:
    """Generate and persist concept tree for a pillar via LLM.

    Deletes existing concepts for the pillar first (full re-seed).

    Args:
        pillar_id: The pillar to seed concepts for.
        db: Database session.
        mode: Seeding mode — "quick" (Vision-only) or "research" (full pipeline).

    Returns:
        List of created PillarConcept objects.
    """
    user = db.query(User).first()
    if not user:
        raise ValueError("No user found")

    pillar = db.query(Pillar).filter(Pillar.id == pillar_id).first()
    if not pillar:
        raise ValueError(f"Pillar {pillar_id} not found")

    # Load vision for context
    vision = db.query(Vision).filter(Vision.user_id == user.id).first()

    logger.info(f"Seeding concepts for pillar {pillar.name} (id={pillar_id}, mode={mode})")

    if mode == "research":
        concept_dicts = await _seed_research_mode(pillar, vision)
    else:
        concept_dicts = await _seed_quick_mode(pillar, vision)

    logger.info(f"LLM generated {len(concept_dicts)} concepts for pillar {pillar.name}")

    created = _persist_concepts(concept_dicts, pillar_id, user.id, db)
    logger.info(f"Persisted {len(created)} concepts for pillar {pillar.name}")
    return created


async def _seed_quick_mode(
    pillar: Pillar,
    vision: Vision | None,
) -> list[dict]:
    """Original single-call seeding with Vision context only."""
    user_prompt = _build_quick_prompt(pillar, vision)
    raw_response = await call_claude(SEEDER_SYSTEM_PROMPT, user_prompt)
    return _parse_seeder_response(raw_response)


async def _seed_research_mode(
    pillar: Pillar,
    vision: Vision | None,
) -> list[dict]:
    """Enhanced 3-stage pipeline: Notion KB + Web Research + Vision → Concepts.

    Stage 1: Fetch Notion Knowledge Base entries for this pillar
    Stage 2: Run web research to gather latest developments
    Stage 3: Combine everything into a comprehensive LLM prompt → concept tree
    """
    vision_target = _get_vision_target(vision, pillar.id)

    # Stage 1: Notion KB Scan
    logger.info(f"[Research Mode] Stage 1: Scanning Notion KB for {pillar.name}")
    try:
        kb_summary = await get_kb_summary_for_pillar(pillar.id, pillar.name)
        logger.info(
            f"[Research Mode] KB scan complete: {kb_summary.total_entries} entries, "
            f"{len(kb_summary.completed)} mastered, {len(kb_summary.low_confidence)} low-confidence"
        )
    except Exception as e:
        logger.warning(f"[Research Mode] Notion KB scan failed (continuing without): {e}")
        kb_summary = None

    # Stage 2: Web Research
    logger.info(f"[Research Mode] Stage 2: Web research for {pillar.name}")
    try:
        research_brief = await research_pillar(
            pillar_name=pillar.name,
            depth_target=pillar.depth_target,
            vision_target=vision_target,
        )
        logger.info(
            f"[Research Mode] Research complete: {len(research_brief.key_topics)} topics, "
            f"{len(research_brief.raw_results)} search results"
        )
    except Exception as e:
        logger.warning(f"[Research Mode] Web research failed (continuing without): {e}")
        research_brief = None

    # Stage 3: Concept Synthesis
    logger.info(f"[Research Mode] Stage 3: Synthesizing concept tree for {pillar.name}")
    user_prompt = _build_research_prompt(pillar, vision, kb_summary, research_brief)

    # Use the research-enhanced system prompt
    raw_response = await call_claude(RESEARCH_SEEDER_SYSTEM_PROMPT, user_prompt)
    return _parse_seeder_response(raw_response)
