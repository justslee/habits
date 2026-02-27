"""PillarConcept model — deep concept trees for pillar mastery (P5-2).

Each pillar has 40-80 concepts organized in 5 tiers (Foundation → Frontier).
Concepts are seeded by LLM from the user's Vision, then fully customizable.
"""

from datetime import datetime
from typing import Optional

from sqlalchemy import DateTime, ForeignKey, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base, TimestampMixin


class PillarConcept(Base, TimestampMixin):
    """A single concept within a pillar's mastery tree."""

    __tablename__ = "pillar_concepts"

    id: Mapped[int] = mapped_column(primary_key=True)
    pillar_id: Mapped[int] = mapped_column(ForeignKey("pillars.id"), nullable=False)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), nullable=False)

    name: Mapped[str] = mapped_column(String(200), nullable=False)
    tier: Mapped[int] = mapped_column(Integer, nullable=False)  # 1-5
    description: Mapped[Optional[str]] = mapped_column(Text, nullable=True)

    # Prerequisites — JSON array of concept IDs
    prerequisites: Mapped[Optional[str]] = mapped_column(Text, nullable=True)

    # Status
    status: Mapped[str] = mapped_column(
        String(20), default="not_started"
    )  # not_started, in_progress, mastered

    # User notes
    notes: Mapped[Optional[str]] = mapped_column(Text, nullable=True)

    # Key learning resources
    key_resources: Mapped[Optional[str]] = mapped_column(Text, nullable=True)

    # Display order within tier
    sort_order: Mapped[int] = mapped_column(Integer, default=0)

    def __repr__(self) -> str:
        return f"<PillarConcept(id={self.id}, tier={self.tier}, name='{self.name}', status={self.status})>"
