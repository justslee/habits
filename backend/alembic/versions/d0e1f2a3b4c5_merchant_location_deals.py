"""merchant location, channel, quality tier and deals

Revision ID: d0e1f2a3b4c5
Revises: c9d0e1f2a3b4
Create Date: 2026-09-09 04:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'd0e1f2a3b4c5'
down_revision: Union[str, Sequence[str], None] = 'c9d0e1f2a3b4'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    with op.batch_alter_table("merchant_accounts") as batch:
        batch.add_column(sa.Column("location", sa.String(160)))
        batch.add_column(sa.Column("channel", sa.String(20), nullable=False, server_default="site"))
        batch.add_column(sa.Column("quality_tier", sa.String(10), nullable=False, server_default="standard"))
        batch.add_column(sa.Column("deal_text", sa.String(160)))
        batch.add_column(sa.Column("deal_value", sa.Float(), nullable=False, server_default="0"))
        batch.add_column(sa.Column("deal_min", sa.Float(), nullable=False, server_default="0"))
        batch.add_column(sa.Column("deal_expires", sa.Date()))
        batch.add_column(sa.Column("deal_seen_at", sa.DateTime()))
    with op.batch_alter_table("food_settings") as batch:
        batch.add_column(sa.Column("last_discovery", sa.Date()))


def downgrade() -> None:
    with op.batch_alter_table("food_settings") as batch:
        batch.drop_column("last_discovery")
    with op.batch_alter_table("merchant_accounts") as batch:
        for c in ("deal_seen_at", "deal_expires", "deal_min", "deal_value", "deal_text", "quality_tier", "channel", "location"):
            batch.drop_column(c)
