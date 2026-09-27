"""hmart_delivery

H Mart now means H Mart Manhattan's own delivery site: hmartdelivery.com, $25 minimum,
$5 delivery fee. Only rows still on the old defaults change, so an edited merchant stays.

Revision ID: d6e7f8a9b0c1
Revises: c5d6e7f8a9b0
Create Date: 2026-09-27 15:00:00.000000

"""

from typing import Sequence, Union

from alembic import op


revision: str = "d6e7f8a9b0c1"
down_revision: Union[str, Sequence[str], None] = "c5d6e7f8a9b0"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.execute(
        "UPDATE merchant_accounts SET site_url = 'https://hmartdelivery.com', "
        "minimum = 25.0, delivery_fee = 5.0 "
        "WHERE store = 'hmart' AND site_url IN ('https://www.hmart.com', 'https://www.hmart.com/')"
    )


def downgrade() -> None:
    op.execute(
        "UPDATE merchant_accounts SET site_url = 'https://www.hmart.com', "
        "minimum = 49.0, delivery_fee = 5.99 "
        "WHERE store = 'hmart' AND site_url = 'https://hmartdelivery.com'"
    )
