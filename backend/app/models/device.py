"""Registered phones for server-initiated push notifications (Expo push tokens)."""

import datetime

from sqlalchemy import DateTime, ForeignKey, String
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base, TimestampMixin


class PushDevice(Base, TimestampMixin):
    """One installed app instance that can receive pushes."""

    __tablename__ = "push_devices"

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(
        ForeignKey("users.id"), nullable=False, index=True
    )
    expo_push_token: Mapped[str] = mapped_column(
        String(255), unique=True, nullable=False
    )
    platform: Mapped[str | None] = mapped_column(
        String(20), nullable=True
    )  # ios | android | web
    app_version: Mapped[str | None] = mapped_column(String(40), nullable=True)
    build_number: Mapped[str | None] = mapped_column(String(20), nullable=True)
    device_name: Mapped[str | None] = mapped_column(String(100), nullable=True)
    last_seen_at: Mapped[datetime.datetime] = mapped_column(DateTime, nullable=False)

    def __repr__(self) -> str:
        return f"<PushDevice(user={self.user_id}, platform={self.platform}, token={self.expo_push_token[:12]}…)>"
