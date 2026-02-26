"""Adaptive calibration service — TASK-006.

Computes per-pillar user level context and consistency multipliers
to feed into the evaluation engine for calibrated expectations.
"""

from __future__ import annotations

import math
from dataclasses import dataclass

from sqlalchemy.orm import Session

from app.models.daily_entry import DailyEntry
from app.models.evaluation import Evaluation
from app.models.pillar import Pillar
from app.models.streak import Streak

# How many recent entries (per pillar) to include in the prompt
RECENT_HISTORY_LIMIT = 10

# How many recent depth scores to average for pillar level
ROLLING_WINDOW = 20


@dataclass
class PillarContext:
    """Snapshot of a user's current level in one pillar."""

    pillar_id: int
    pillar_name: str
    avg_depth_score: float  # rolling average over last ROLLING_WINDOW evaluations
    entry_count: int  # total entries for this pillar
    current_streak: int
    longest_streak: int


@dataclass
class RecentEntry:
    """Lightweight view of a past entry for prompt context."""

    description: str
    depth_score: int | None
    relevance_score: int | None
    one_percent_better: bool | None
    difficulty_rating: int | None
    time_invested_minutes: int


def get_pillar_contexts(user_id: int, db: Session) -> list[PillarContext]:
    """Compute current pillar level contexts for all pillars a user has entries in."""
    pillars = db.query(Pillar).all()
    contexts: list[PillarContext] = []

    for pillar in pillars:
        # Get evaluated entries for this pillar, most recent first
        entries_with_evals = (
            db.query(DailyEntry, Evaluation)
            .join(Evaluation, Evaluation.entry_id == DailyEntry.id)
            .filter(
                DailyEntry.user_id == user_id,
                DailyEntry.pillar_tags.contains(str(pillar.id)),
            )
            .order_by(DailyEntry.entry_date.desc(), DailyEntry.created_at.desc())
            .limit(ROLLING_WINDOW)
            .all()
        )

        if not entries_with_evals:
            continue

        depth_scores = [ev.depth_score for _, ev in entries_with_evals]
        avg_depth = sum(depth_scores) / len(depth_scores)

        # Total entry count (including unevaluated)
        total_entries = (
            db.query(DailyEntry)
            .filter(
                DailyEntry.user_id == user_id,
                DailyEntry.pillar_tags.contains(str(pillar.id)),
            )
            .count()
        )

        # Streak info
        streak = (
            db.query(Streak)
            .filter(Streak.user_id == user_id, Streak.pillar_id == pillar.id)
            .first()
        )

        contexts.append(
            PillarContext(
                pillar_id=pillar.id,
                pillar_name=pillar.name,
                avg_depth_score=round(avg_depth, 1),
                entry_count=total_entries,
                current_streak=streak.current_streak if streak else 0,
                longest_streak=streak.longest_streak if streak else 0,
            )
        )

    return contexts


def get_recent_entries_for_pillar(
    user_id: int, pillar_id: int, db: Session, limit: int = RECENT_HISTORY_LIMIT
) -> list[RecentEntry]:
    """Fetch recent entries (with evaluations if available) for a specific pillar."""
    rows = (
        db.query(DailyEntry)
        .outerjoin(Evaluation, Evaluation.entry_id == DailyEntry.id)
        .filter(
            DailyEntry.user_id == user_id,
            DailyEntry.pillar_tags.contains(str(pillar_id)),
        )
        .order_by(DailyEntry.entry_date.desc(), DailyEntry.created_at.desc())
        .limit(limit)
        .all()
    )

    results: list[RecentEntry] = []
    for entry in rows:
        ev = entry.evaluation
        results.append(
            RecentEntry(
                description=entry.description[:200],  # truncate for prompt size
                depth_score=ev.depth_score if ev else None,
                relevance_score=ev.relevance_score if ev else None,
                one_percent_better=ev.one_percent_better if ev else None,
                difficulty_rating=entry.difficulty_rating,
                time_invested_minutes=entry.time_invested_minutes,
            )
        )
    return results


def calculate_consistency_multiplier(user_id: int, pillar_ids: list[int], db: Session) -> float:
    """Calculate consistency multiplier from streak data.

    Rewards consistent daily practice, penalizes sporadic bursts.

    Multiplier range: 0.7 (no streak) to 1.3 (strong streak).
    Formula: base 0.85 + 0.15 * sigmoid(avg_streak - 3)
    This means:
      - 0 day streak  → ~0.81 (penalty for inconsistency)
      - 3 day streak  → ~1.0 (neutral)
      - 7+ day streak → ~1.15+ (bonus for consistency)
      - 14+ day       → ~1.2 (diminishing returns)
    """
    if not pillar_ids:
        return 1.0

    streaks = (
        db.query(Streak)
        .filter(Streak.user_id == user_id, Streak.pillar_id.in_(pillar_ids))
        .all()
    )

    if not streaks:
        return 0.85  # No streak data = slight penalty

    avg_streak = sum(s.current_streak for s in streaks) / len(streaks)

    # Sigmoid centered at 3 days, scaled to [0, 1]
    sigmoid = 1.0 / (1.0 + math.exp(-(avg_streak - 3.0)))

    # Map to [0.7, 1.3] range
    multiplier = 0.7 + 0.6 * sigmoid

    return round(multiplier, 3)


def build_adaptive_context_block(
    user_id: int, pillar_ids: list[int], db: Session
) -> str:
    """Build a text block summarizing user's level and recent history for the prompt."""
    contexts = get_pillar_contexts(user_id, db)
    if not contexts:
        return ""

    lines = ["\n## User's Current Level & History"]

    # Filter to relevant pillars
    relevant = [c for c in contexts if c.pillar_id in pillar_ids] if pillar_ids else contexts

    for ctx in relevant:
        lines.append(
            f"\n### {ctx.pillar_name}"
            f"\n- Rolling avg depth score: {ctx.avg_depth_score}/100"
            f"\n- Total entries: {ctx.entry_count}"
            f"\n- Current streak: {ctx.current_streak} days"
            f"\n- Longest streak: {ctx.longest_streak} days"
        )

        # Add recent entry summaries
        recent = get_recent_entries_for_pillar(user_id, ctx.pillar_id, db, limit=5)
        if recent:
            lines.append("\nRecent sessions:")
            for i, r in enumerate(recent, 1):
                score_info = f"depth={r.depth_score}" if r.depth_score is not None else "not evaluated"
                lines.append(
                    f"  {i}. \"{r.description[:100]}\" "
                    f"({r.time_invested_minutes}min, diff={r.difficulty_rating}/10, {score_info})"
                )

    lines.append(
        "\n## Calibration Instructions"
        "\nAdjust your expectations based on the user's demonstrated level above."
        "\n- If their avg depth is high (60+), they're advanced. Basic material should score near zero."
        "\n- If their avg depth is low (<30), they're early stage. Give credit for genuine effort on appropriate material."
        "\n- If they're re-covering material they've already mastered (check recent sessions), score it LOW."
        "\n- If they're stretching into harder territory than usual, score it HIGH even if they struggled."
        "\n- Consistency matters: a 7-day streak shows commitment. Sporadic bursts are less valuable."
    )

    return "\n".join(lines)
