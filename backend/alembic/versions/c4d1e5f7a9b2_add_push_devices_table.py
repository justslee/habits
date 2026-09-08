"""add push_devices table

Revision ID: c4d1e5f7a9b2
Revises: 7aceedf9601b
Create Date: 2026-09-08 19:05:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'c4d1e5f7a9b2'
down_revision: Union[str, Sequence[str], None] = '7aceedf9601b'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Create push_devices (Expo push tokens per installed app)."""
    op.create_table(
        "push_devices",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("user_id", sa.Integer(), sa.ForeignKey("users.id"), nullable=False),
        sa.Column("expo_push_token", sa.String(255), nullable=False),
        sa.Column("platform", sa.String(20), nullable=True),
        sa.Column("app_version", sa.String(40), nullable=True),
        sa.Column("build_number", sa.String(20), nullable=True),
        sa.Column("device_name", sa.String(100), nullable=True),
        sa.Column("last_seen_at", sa.DateTime(), nullable=False),
        sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(), nullable=False, server_default=sa.func.now()),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("expo_push_token", name="uq_push_devices_token"),
    )
    op.create_index("ix_push_devices_user_id", "push_devices", ["user_id"])


def downgrade() -> None:
    op.drop_index("ix_push_devices_user_id", table_name="push_devices")
    op.drop_table("push_devices")
