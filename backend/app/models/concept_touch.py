"""ConceptTouch model — tracks when concepts are engaged during sessions."""

from datetime import date

from sqlalchemy import Date, ForeignKey, Integer
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base, TimestampMixin


class ConceptTouch(Base, TimestampMixin):
    """Records that a concept was touched during a learning session.

    Created by the AI evaluation engine when it identifies concepts
    referenced in a session's description/takeaway.
    """

    __tablename__ = "concept_touches"

    id: Mapped[int] = mapped_column(primary_key=True)
    concept_id: Mapped[int] = mapped_column(ForeignKey("pillar_concepts.id"), nullable=False)
    entry_id: Mapped[int] = mapped_column(ForeignKey("daily_entries.id"), nullable=False)
    evaluation_id: Mapped[int] = mapped_column(ForeignKey("evaluations.id"), nullable=True)
    touch_date: Mapped[date] = mapped_column(Date, nullable=False)
    depth_score: Mapped[int] = mapped_column(Integer, nullable=True)  # from the evaluation

    def __repr__(self) -> str:
        return f"<ConceptTouch(concept={self.concept_id}, entry={self.entry_id}, depth={self.depth_score})>"
