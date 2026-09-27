"""cart_url

For the shopper (FOOD_EXECUTOR=agent): when the owner asked for each cart, since a cycle's
other bags get tasks too but only requested carts are filled, and the store page holding
the filled cart, so the owner can open it in the store's own app and check out there.

Revision ID: c5d6e7f8a9b0
Revises: b4c5d6e7f8a9
Create Date: 2026-09-27 12:00:00.000000

"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "c5d6e7f8a9b0"
down_revision: Union[str, Sequence[str], None] = "b4c5d6e7f8a9"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    with op.batch_alter_table("cart_tasks") as batch:
        batch.add_column(sa.Column("cart_url", sa.String(500), nullable=True))
        batch.add_column(sa.Column("requested_at", sa.DateTime(), nullable=True))


def downgrade() -> None:
    with op.batch_alter_table("cart_tasks") as batch:
        batch.drop_column("requested_at")
        batch.drop_column("cart_url")
