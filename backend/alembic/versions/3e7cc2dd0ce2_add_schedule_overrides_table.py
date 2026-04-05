"""add_schedule_overrides_table

Revision ID: 3e7cc2dd0ce2
Revises: 562cb2549ebf
Create Date: 2026-03-05 14:39:49.458404

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '3e7cc2dd0ce2'
down_revision: Union[str, Sequence[str], None] = '562cb2549ebf'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    op.create_table('schedule_overrides',
    sa.Column('id', sa.Integer(), nullable=False),
    sa.Column('user_id', sa.Integer(), nullable=False),
    sa.Column('override_date', sa.Date(), nullable=False),
    sa.Column('day_type', sa.String(length=20), nullable=False),
    sa.Column('reason', sa.Text(), nullable=True),
    sa.Column('created_at', sa.DateTime(), nullable=False),
    sa.Column('updated_at', sa.DateTime(), nullable=False),
    sa.ForeignKeyConstraint(['user_id'], ['users.id'], ),
    sa.PrimaryKeyConstraint('id'),
    sa.UniqueConstraint('user_id', 'override_date', name='uq_user_override_date')
    )


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_table('schedule_overrides')
