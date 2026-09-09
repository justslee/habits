"""add food_settings, merchant_accounts, shopping_bags

Revision ID: f4a5b6c7d8e9
Revises: e3f4a5b6c7d8
Create Date: 2026-09-09 01:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'f4a5b6c7d8e9'
down_revision: Union[str, Sequence[str], None] = 'e3f4a5b6c7d8'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def _ts():
    return [
        sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(), nullable=False, server_default=sa.func.now()),
    ]


def upgrade() -> None:
    op.create_table(
        "food_settings",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("user_id", sa.Integer(), sa.ForeignKey("users.id"), nullable=False, unique=True),
        sa.Column("budget_per_cycle", sa.Float(), nullable=False, server_default="220"),
        sa.Column("per_order_cap", sa.Float(), nullable=False, server_default="180"),
        sa.Column("per_cycle_cap", sa.Float(), nullable=False, server_default="300"),
        sa.Column("ordering_enabled", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column("supervised_cycles_remaining", sa.Integer(), nullable=False, server_default="3"),
        sa.Column("approval_ttl_minutes", sa.Integer(), nullable=False, server_default="15"),
        sa.Column("total_tolerance", sa.Float(), nullable=False, server_default="3"),
        *_ts(),
    )
    op.create_table(
        "merchant_accounts",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("user_id", sa.Integer(), sa.ForeignKey("users.id"), nullable=False),
        sa.Column("store", sa.String(20), nullable=False),
        sa.Column("name", sa.String(80), nullable=False),
        sa.Column("site_url", sa.String(200)),
        sa.Column("minimum", sa.Float(), nullable=False, server_default="0"),
        sa.Column("delivery_fee", sa.Float(), nullable=False, server_default="0"),
        sa.Column("enabled", sa.Boolean(), nullable=False, server_default=sa.true()),
        sa.Column("supervised", sa.Boolean(), nullable=False, server_default=sa.true()),
        sa.Column("orders_this_cycle", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("preferred_products", sa.JSON()),
        *_ts(),
        sa.UniqueConstraint("user_id", "store", name="uq_merchant_user_store"),
    )
    op.create_index("ix_merchant_accounts_user_id", "merchant_accounts", ["user_id"])
    op.create_table(
        "shopping_bags",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("cycle_id", sa.Integer(), sa.ForeignKey("meal_cycles.id"), nullable=False),
        sa.Column("store", sa.String(20), nullable=False),
        sa.Column("items", sa.JSON(), nullable=False),
        sa.Column("goods_total", sa.Float(), nullable=False, server_default="0"),
        sa.Column("minimum", sa.Float(), nullable=False, server_default="0"),
        sa.Column("delivery_fee", sa.Float(), nullable=False, server_default="0"),
        sa.Column("short", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column("shortfall", sa.Float(), nullable=False, server_default="0"),
        sa.Column("projected_waste", sa.Float(), nullable=False, server_default="0"),
        sa.Column("status", sa.String(20), nullable=False, server_default="proposed"),
        sa.Column("bag_hash", sa.String(64)),
        *_ts(),
    )
    op.create_index("ix_shopping_bags_cycle_id", "shopping_bags", ["cycle_id"])


def downgrade() -> None:
    op.drop_table("shopping_bags")
    op.drop_table("merchant_accounts")
    op.drop_table("food_settings")
