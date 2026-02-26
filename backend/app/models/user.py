"""User model - single user for personal app."""

from sqlalchemy import String
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base, TimestampMixin


class User(Base, TimestampMixin):
    """
    User model.
    
    For this personal app, there's only one user (Justin),
    but we model it properly for clean architecture.
    """

    __tablename__ = "users"

    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(100), nullable=False)
    email: Mapped[str] = mapped_column(String(255), unique=True, nullable=True)
    push_token: Mapped[str] = mapped_column(String(255), nullable=True)

    # Relationships
    entries = relationship("DailyEntry", back_populates="user")
    pillar_scores = relationship("PillarScore", back_populates="user")
    streaks = relationship("Streak", back_populates="user")
    milestones = relationship("Milestone", back_populates="user")

    def __repr__(self) -> str:
        return f"<User(id={self.id}, name='{self.name}')>"
