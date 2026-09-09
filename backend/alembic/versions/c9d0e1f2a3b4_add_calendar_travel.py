"""add calendar_feeds, travel_spans; scheduler bookkeeping on food_settings

Revision ID: c9d0e1f2a3b4
Revises: b7c8d9e0f1a2
Create Date: 2026-09-09 03:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'c9d0e1f2a3b4'
down_revision: Union[str, Sequence[str], None] = 'b7c8d9e0f1a2'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def _ts():
    return [
        sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(), nullable=False, server_default=sa.func.now()),
    ]


def upgrade() -> None:
    op.create_table(
        "calendar_feeds",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("user_id", sa.Integer(), sa.ForeignKey("users.id"), nullable=False),
        sa.Column("url", sa.String(600), nullable=False),
        sa.Column("label", sa.String(80), nullable=False, server_default="Google Calendar"),
        sa.Column("enabled", sa.Boolean(), nullable=False, server_default=sa.true()),
        sa.Column("last_synced_at", sa.DateTime()),
        sa.Column("last_error", sa.String(300)),
        *_ts(),
    )
    op.create_index("ix_calendar_feeds_user_id", "calendar_feeds", ["user_id"])
    op.create_table(
        "travel_spans",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("user_id", sa.Integer(), sa.ForeignKey("users.id"), nullable=False),
        sa.Column("feed_id", sa.Integer(), sa.ForeignKey("calendar_feeds.id")),
        sa.Column("uid", sa.String(200), nullable=False),
        sa.Column("start_date", sa.Date(), nullable=False),
        sa.Column("end_date", sa.Date(), nullable=False),
        sa.Column("summary", sa.String(160)),
        sa.Column("reason", sa.String(60)),
        sa.Column("confirmed", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column("ignored", sa.Boolean(), nullable=False, server_default=sa.false()),
        *_ts(),
        sa.UniqueConstraint("feed_id", "uid", name="uq_travel_feed_uid"),
    )
    op.create_index("ix_travel_spans_user_id", "travel_spans", ["user_id"])
    with op.batch_alter_table("food_settings") as batch:
        batch.add_column(sa.Column("last_pantry_push", sa.Date()))
        batch.add_column(sa.Column("last_cook_push", sa.Date()))


def downgrade() -> None:
    with op.batch_alter_table("food_settings") as batch:
        batch.drop_column("last_cook_push")
        batch.drop_column("last_pantry_push")
    op.drop_table("travel_spans")
    op.drop_table("calendar_feeds")
