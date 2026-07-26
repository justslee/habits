"""Per-user third-party OAuth connections (Whoop today; Strava-ready).

Replaces the old single on-disk Whoop token file with per-user rows so the
integration is opt-in and connectable by any user, not owner-only.
"""

import datetime
from typing import Optional

from sqlalchemy import DateTime, ForeignKey, String, Text, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base, TimestampMixin


class OAuthConnection(Base, TimestampMixin):
    """A user's OAuth connection to a provider (e.g. whoop)."""

    __tablename__ = "oauth_connections"
    __table_args__ = (UniqueConstraint("user_id", "provider", name="uq_oauth_user_provider"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), nullable=False)
    provider: Mapped[str] = mapped_column(String(30), nullable=False)  # "whoop", "strava"

    access_token: Mapped[str] = mapped_column(Text, nullable=False)
    refresh_token: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    expires_at: Mapped[Optional[datetime.datetime]] = mapped_column(DateTime, nullable=True)
    scope: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    provider_user_id: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
    connected_at: Mapped[datetime.datetime] = mapped_column(DateTime, nullable=False)

    def __repr__(self) -> str:
        return f"<OAuthConnection(user={self.user_id}, provider={self.provider})>"
