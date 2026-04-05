"""add vdot fields to running profile

Revision ID: 3ab56880f583
Revises: 3e7cc2dd0ce2
Create Date: 2026-03-11 22:51:12.013070

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = '3ab56880f583'
down_revision: Union[str, Sequence[str], None] = '3e7cc2dd0ce2'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column('running_profiles', sa.Column('vdot', sa.Float(), nullable=True))
    op.add_column('running_profiles', sa.Column('vdot_race_distance', sa.String(length=20), nullable=True))
    op.add_column('running_profiles', sa.Column('vdot_race_time', sa.Integer(), nullable=True))
    op.add_column('running_profiles', sa.Column('vdot_updated_at', sa.DateTime(), nullable=True))


def downgrade() -> None:
    op.drop_column('running_profiles', 'vdot_updated_at')
    op.drop_column('running_profiles', 'vdot_race_time')
    op.drop_column('running_profiles', 'vdot_race_distance')
    op.drop_column('running_profiles', 'vdot')
