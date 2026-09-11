"""training_adjustments

Revision ID: b4c5d6e7f8a9
Revises: a3b4c5d6e7f8
Create Date: 2026-09-10 23:30:00.000000

"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "b4c5d6e7f8a9"
down_revision: Union[str, Sequence[str], None] = "a3b4c5d6e7f8"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "training_adjustments",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("user_id", sa.Integer(), sa.ForeignKey("users.id"), nullable=False),
        sa.Column("date", sa.Date(), nullable=False),
        sa.Column("kind", sa.String(20), nullable=False),
        sa.Column("params", sa.Text()),
        sa.Column("reason", sa.Text()),
        sa.Column("summary", sa.Text()),
        sa.Column("reverted_at", sa.DateTime()),
        sa.Column("created_at", sa.DateTime()),
        sa.Column("updated_at", sa.DateTime()),
    )
    op.create_index(
        "ix_training_adjustments_user_date", "training_adjustments", ["user_id", "date"]
    )


def downgrade() -> None:
    op.drop_index(
        "ix_training_adjustments_user_date", table_name="training_adjustments"
    )
    op.drop_table("training_adjustments")
