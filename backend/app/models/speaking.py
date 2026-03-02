"""Speaking Practice models — record, transcribe, evaluate presentations."""

from datetime import date, datetime
from typing import Optional

from sqlalchemy import Boolean, Date, DateTime, Float, ForeignKey, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base, TimestampMixin


class SpeakingSession(Base, TimestampMixin):
    """A speaking practice session — explaining a concept out loud."""

    __tablename__ = "speaking_sessions"

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), nullable=False)

    # What was explained
    topic: Mapped[str] = mapped_column(String(500), nullable=False)
    audience: Mapped[str] = mapped_column(String(50), default="general")  # junior_analyst, lp_meeting, technical_peer, podcast
    target_seconds: Mapped[int] = mapped_column(Integer, default=180)  # target duration
    actual_seconds: Mapped[int] = mapped_column(Integer, nullable=True)  # actual duration

    # Source concept (optional link)
    concept_id: Mapped[Optional[int]] = mapped_column(ForeignKey("pillar_concepts.id"), nullable=True)

    # Audio + transcript
    audio_path: Mapped[Optional[str]] = mapped_column(String(500), nullable=True)
    transcript: Mapped[Optional[str]] = mapped_column(Text, nullable=True)

    session_date: Mapped[date] = mapped_column(Date, nullable=False)

    # Evaluation (one-to-one)
    evaluation: Mapped["SpeakingEvaluation"] = relationship(
        "SpeakingEvaluation", back_populates="session", uselist=False
    )

    def __repr__(self) -> str:
        return f"<SpeakingSession(id={self.id}, topic='{self.topic[:40]}')>"


class SpeakingEvaluation(Base, TimestampMixin):
    """AI evaluation of a speaking session."""

    __tablename__ = "speaking_evaluations"

    id: Mapped[int] = mapped_column(primary_key=True)
    session_id: Mapped[int] = mapped_column(
        ForeignKey("speaking_sessions.id"), unique=True, nullable=False
    )

    # Dimension scores (0-100)
    clarity_score: Mapped[int] = mapped_column(Integer, nullable=False)
    accuracy_score: Mapped[int] = mapped_column(Integer, nullable=False)
    structure_score: Mapped[int] = mapped_column(Integer, nullable=False)
    conciseness_score: Mapped[int] = mapped_column(Integer, nullable=False)
    confidence_score: Mapped[int] = mapped_column(Integer, nullable=False)
    overall_score: Mapped[int] = mapped_column(Integer, nullable=False)

    # Filler words — JSON: {"um": 5, "like": 3, "you know": 2}
    filler_words: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    filler_count: Mapped[int] = mapped_column(Integer, default=0)

    # Specific feedback — JSON array: [{"quote": "...", "feedback": "...", "type": "improvement|strength"}]
    specific_feedback: Mapped[Optional[str]] = mapped_column(Text, nullable=True)

    # Overall commentary
    commentary: Mapped[str] = mapped_column(Text, nullable=False)

    # Raw LLM response
    raw_llm_response: Mapped[Optional[str]] = mapped_column(Text, nullable=True)

    # Relationship
    session: Mapped["SpeakingSession"] = relationship("SpeakingSession", back_populates="evaluation")

    def __repr__(self) -> str:
        return f"<SpeakingEvaluation(session={self.session_id}, overall={self.overall_score})>"
