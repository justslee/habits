"""add cart_tasks, order_approvals, orders

Revision ID: b7c8d9e0f1a2
Revises: f4a5b6c7d8e9
Create Date: 2026-09-09 02:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'b7c8d9e0f1a2'
down_revision: Union[str, Sequence[str], None] = 'f4a5b6c7d8e9'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def _ts():
    return [
        sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(), nullable=False, server_default=sa.func.now()),
    ]


def upgrade() -> None:
    op.create_table(
        "cart_tasks",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("cycle_id", sa.Integer(), sa.ForeignKey("meal_cycles.id"), nullable=False),
        sa.Column("bag_id", sa.Integer(), sa.ForeignKey("shopping_bags.id"), nullable=False, unique=True),
        sa.Column("store", sa.String(20), nullable=False),
        sa.Column("status", sa.String(20), nullable=False, server_default="queued"),
        sa.Column("supervised", sa.Boolean(), nullable=False, server_default=sa.true()),
        sa.Column("cart_lines", sa.JSON()),
        sa.Column("cart_total", sa.Float()),
        sa.Column("screenshot_path", sa.String(300)),
        sa.Column("error", sa.Text()),
        sa.Column("attempts", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("idempotency_key", sa.String(64), nullable=False, unique=True),
        sa.Column("events", sa.JSON(), nullable=False),
        *_ts(),
    )
    op.create_index("ix_cart_tasks_cycle_id", "cart_tasks", ["cycle_id"])
    op.create_index("ix_cart_tasks_status", "cart_tasks", ["status"])
    op.create_table(
        "order_approvals",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("cart_task_id", sa.Integer(), sa.ForeignKey("cart_tasks.id"), nullable=False),
        sa.Column("token", sa.String(64), nullable=False, unique=True),
        sa.Column("approved_total", sa.Float(), nullable=False),
        sa.Column("bag_hash", sa.String(64)),
        sa.Column("biometric", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column("expires_at", sa.DateTime(), nullable=False),
        sa.Column("used_at", sa.DateTime()),
        sa.Column("revoked", sa.Boolean(), nullable=False, server_default=sa.false()),
        *_ts(),
    )
    op.create_index("ix_order_approvals_cart_task_id", "order_approvals", ["cart_task_id"])
    op.create_table(
        "orders",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("cart_task_id", sa.Integer(), sa.ForeignKey("cart_tasks.id"), nullable=False, unique=True),
        sa.Column("cycle_id", sa.Integer(), sa.ForeignKey("meal_cycles.id"), nullable=False),
        sa.Column("store", sa.String(20), nullable=False),
        sa.Column("merchant_order_id", sa.String(80)),
        sa.Column("goods_total", sa.Float(), nullable=False, server_default="0"),
        sa.Column("fees", sa.Float(), nullable=False, server_default="0"),
        sa.Column("tip", sa.Float(), nullable=False, server_default="0"),
        sa.Column("total", sa.Float(), nullable=False, server_default="0"),
        sa.Column("line_items", sa.JSON()),
        sa.Column("receipt_path", sa.String(300)),
        sa.Column("delivery_window", sa.String(80)),
        sa.Column("placed_at", sa.DateTime(), nullable=False),
        sa.Column("placed_by", sa.String(20), nullable=False, server_default="human"),
        *_ts(),
    )
    op.create_index("ix_orders_cycle_id", "orders", ["cycle_id"])


def downgrade() -> None:
    op.drop_table("orders")
    op.drop_table("order_approvals")
    op.drop_table("cart_tasks")
