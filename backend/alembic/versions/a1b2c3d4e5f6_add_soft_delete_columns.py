"""add soft delete columns

Revision ID: a1b2c3d4e5f6
Revises: 5f124a2bef49
Create Date: 2026-02-27 00:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'a1b2c3d4e5f6'
down_revision: Union[str, None] = '5f124a2bef49'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Add deleted_at column to 7 tables for soft delete (D-019, P5-5)."""
    tables = [
        "daily_entries",
        "evaluations",
        "workout_sessions",
        "exercise_logs",
        "run_sessions",
        "run_splits",
        "run_segment_logs",
    ]
    for table in tables:
        op.add_column(table, sa.Column("deleted_at", sa.DateTime(), nullable=True))


def downgrade() -> None:
    """Remove deleted_at columns."""
    tables = [
        "run_segment_logs",
        "run_splits",
        "run_sessions",
        "exercise_logs",
        "workout_sessions",
        "evaluations",
        "daily_entries",
    ]
    for table in tables:
        op.drop_column(table, "deleted_at")
