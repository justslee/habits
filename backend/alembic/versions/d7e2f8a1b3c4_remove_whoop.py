"""remove whoop + oauth integration

Revision ID: d7e2f8a1b3c4
Revises: c4d1e5f7a9b2
Create Date: 2026-09-08 20:30:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'd7e2f8a1b3c4'
down_revision: Union[str, Sequence[str], None] = 'c4d1e5f7a9b2'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

WORKOUT_COLS = ("whoop_recovery_score", "whoop_hrv", "whoop_resting_hr", "whoop_sleep_score")
RUN_COLS = ("whoop_recovery_score", "whoop_strain")


def upgrade() -> None:
    """Drop the Whoop snapshot cache, the OAuth connections table, and the
    per-session Whoop columns. batch_alter_table so it works on SQLite."""
    op.drop_table("whoop_snapshots")
    op.drop_table("oauth_connections")
    with op.batch_alter_table("workout_sessions") as batch:
        for col in WORKOUT_COLS:
            batch.drop_column(col)
    with op.batch_alter_table("run_sessions") as batch:
        for col in RUN_COLS:
            batch.drop_column(col)


def downgrade() -> None:
    with op.batch_alter_table("run_sessions") as batch:
        for col in RUN_COLS:
            batch.add_column(sa.Column(col, sa.Float(), nullable=True))
    with op.batch_alter_table("workout_sessions") as batch:
        for col in WORKOUT_COLS:
            batch.add_column(sa.Column(col, sa.Float(), nullable=True))
    op.create_table(
        "oauth_connections",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("user_id", sa.Integer(), sa.ForeignKey("users.id"), nullable=False),
        sa.Column("provider", sa.String(30), nullable=False),
        sa.Column("access_token", sa.Text(), nullable=False),
        sa.Column("refresh_token", sa.Text(), nullable=True),
        sa.Column("expires_at", sa.DateTime(), nullable=True),
        sa.Column("scope", sa.String(255), nullable=True),
        sa.Column("provider_user_id", sa.String(100), nullable=True),
        sa.Column("connected_at", sa.DateTime(), nullable=False),
        sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(), nullable=False, server_default=sa.func.now()),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("user_id", "provider", name="uq_oauth_user_provider"),
    )
    op.create_index("ix_oauth_connections_user_id", "oauth_connections", ["user_id"])
    op.create_table(
        "whoop_snapshots",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("user_id", sa.Integer(), sa.ForeignKey("users.id"), nullable=False),
        sa.Column("snapshot_date", sa.Date(), nullable=False),
        sa.Column("recovery_score", sa.Float(), nullable=True),
        sa.Column("hrv", sa.Float(), nullable=True),
        sa.Column("resting_hr", sa.Float(), nullable=True),
        sa.Column("sleep_score", sa.Float(), nullable=True),
        sa.Column("strain_score", sa.Float(), nullable=True),
        sa.Column("full_data", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(), nullable=False, server_default=sa.func.now()),
        sa.PrimaryKeyConstraint("id"),
    )
