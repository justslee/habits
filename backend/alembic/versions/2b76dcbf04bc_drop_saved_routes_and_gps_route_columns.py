"""drop saved_routes and gps/route columns

Revision ID: 2b76dcbf04bc
Revises: 2af86854f91d
Create Date: 2026-07-26 17:45:01.486158

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '2b76dcbf04bc'
down_revision: Union[str, Sequence[str], None] = '2af86854f91d'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Drop route-discovery table and GPS/route columns on run_sessions."""
    bind = op.get_bind()
    insp = sa.inspect(bind)

    # Drop the saved_routes table (route discovery / library removed)
    if "saved_routes" in insp.get_table_names():
        op.drop_table("saved_routes")

    # Drop GPS/route columns from run_sessions (batch mode for SQLite compatibility)
    existing_cols = {c["name"] for c in insp.get_columns("run_sessions")}
    with op.batch_alter_table("run_sessions") as batch_op:
        if "gps_polyline" in existing_cols:
            batch_op.drop_column("gps_polyline")
        if "route_id" in existing_cols:
            batch_op.drop_column("route_id")


def downgrade() -> None:
    """Recreate the dropped columns and saved_routes table."""
    with op.batch_alter_table("run_sessions") as batch_op:
        batch_op.add_column(sa.Column("gps_polyline", sa.Text(), nullable=True))
        batch_op.add_column(sa.Column("route_id", sa.Integer(), nullable=True))

    op.create_table(
        "saved_routes",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("user_id", sa.Integer(), sa.ForeignKey("users.id"), nullable=False),
        sa.Column("name", sa.String(100), nullable=False),
        sa.Column("waypoints", sa.Text(), nullable=True),
        sa.Column("polyline", sa.Text(), nullable=True),
        sa.Column("distance_miles", sa.Float(), nullable=False),
        sa.Column("elevation_gain_ft", sa.Float(), nullable=True),
        sa.Column("route_type", sa.String(30), nullable=True),
        sa.Column("tags", sa.String(200), nullable=True),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column("times_run", sa.Integer(), server_default="0"),
        sa.Column("best_time_seconds", sa.Integer(), nullable=True),
        sa.Column("last_run_date", sa.Date(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(), nullable=False, server_default=sa.func.now()),
        sa.PrimaryKeyConstraint("id"),
    )
