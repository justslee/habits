"""Vision Statement model — the user's North Star (P5-7, D-020).

Stores the high-level vision, per-pillar targets, time horizon milestones,
and anti-goals. Injected into all AI system prompts for context alignment.
"""

from datetime import datetime
from typing import Optional

from sqlalchemy import DateTime, ForeignKey, Integer, Text
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base, TimestampMixin


class Vision(Base, TimestampMixin):
    """
    User's Vision Statement / North Star.

    Single row per user (upsert pattern). The vision text, pillar targets,
    time horizon milestones, and anti-goals drive all AI coaching and evaluation.
    """

    __tablename__ = "visions"

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(
        ForeignKey("users.id"), unique=True, nullable=False
    )

    # Free-form vision text — the north star statement
    vision_text: Mapped[Optional[str]] = mapped_column(Text, nullable=True)

    # Per-pillar targets — JSON: {"1": "target text", "2": "...", ...}
    pillar_targets: Mapped[Optional[str]] = mapped_column(Text, nullable=True)

    # Time horizon milestones — JSON array: [{"title": "...", "target_date": "YYYY-MM-DD"}, ...]
    time_horizon: Mapped[Optional[str]] = mapped_column(Text, nullable=True)

    # Anti-goals — JSON array: ["thing to avoid 1", "thing to avoid 2", ...]
    anti_goals: Mapped[Optional[str]] = mapped_column(Text, nullable=True)

    def __repr__(self) -> str:
        preview = (self.vision_text or "")[:50]
        return f"<Vision(user={self.user_id}, text='{preview}...')>"
