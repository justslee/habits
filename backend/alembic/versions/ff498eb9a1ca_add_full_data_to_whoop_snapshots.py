"""add full_data to whoop_snapshots

Revision ID: ff498eb9a1ca
Revises: de1cb802bc46
Create Date: 2026-02-28 11:36:29.522364

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'ff498eb9a1ca'
down_revision: Union[str, Sequence[str], None] = 'de1cb802bc46'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column('whoop_snapshots', sa.Column('full_data', sa.Text(), nullable=True))


def downgrade() -> None:
    op.drop_column('whoop_snapshots', 'full_data')
