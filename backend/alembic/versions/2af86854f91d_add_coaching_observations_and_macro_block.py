"""Add coaching_observations table and macro_block columns to exercise_profiles.

Revision ID: 2af86854f91d
Revises: 3ab56880f583
Create Date: 2026-04-14

Part 1A/2A of the agentic coach upgrade:
- coaching_observations: persistent AI coach notes fed back into future prompts
- macro_block / macro_block_week on exercise_profiles: drives periodization phase
"""
from alembic import op
import sqlalchemy as sa

# revision identifiers
revision = "2af86854f91d"
down_revision = "3ab56880f583"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # --- coaching_observations table ---
    op.create_table(
        "coaching_observations",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("user_id", sa.Integer(), sa.ForeignKey("users.id"), nullable=False),
        sa.Column("category", sa.String(20), nullable=False, server_default="general"),
        sa.Column("observation", sa.Text(), nullable=False),
        sa.Column("source", sa.String(100), nullable=False),
        sa.Column("confidence", sa.Float(), server_default="0.8"),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default="1"),
        sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(), nullable=False, server_default=sa.func.now()),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_coaching_observations_user_id", "coaching_observations", ["user_id"])

    # --- macro periodization columns on exercise_profiles ---
    with op.batch_alter_table("exercise_profiles") as batch_op:
        batch_op.add_column(
            sa.Column("macro_block", sa.String(20), server_default="hypertrophy", nullable=True)
        )
        batch_op.add_column(
            sa.Column("macro_block_week", sa.Integer(), server_default="1", nullable=True)
        )


def downgrade() -> None:
    with op.batch_alter_table("exercise_profiles") as batch_op:
        batch_op.drop_column("macro_block_week")
        batch_op.drop_column("macro_block")

    op.drop_index("ix_coaching_observations_user_id", table_name="coaching_observations")
    op.drop_table("coaching_observations")
