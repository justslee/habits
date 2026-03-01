"""add concept_touches table

Revision ID: 64a44ed78e5d
Revises: ff498eb9a1ca
Create Date: 2026-03-01 17:57:48.395214

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = '64a44ed78e5d'
down_revision: Union[str, Sequence[str], None] = 'ff498eb9a1ca'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table('concept_touches',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('concept_id', sa.Integer(), nullable=False),
        sa.Column('entry_id', sa.Integer(), nullable=False),
        sa.Column('evaluation_id', sa.Integer(), nullable=True),
        sa.Column('touch_date', sa.Date(), nullable=False),
        sa.Column('depth_score', sa.Integer(), nullable=True),
        sa.Column('created_at', sa.DateTime(), nullable=False),
        sa.Column('updated_at', sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(['concept_id'], ['pillar_concepts.id']),
        sa.ForeignKeyConstraint(['entry_id'], ['daily_entries.id']),
        sa.ForeignKeyConstraint(['evaluation_id'], ['evaluations.id']),
        sa.PrimaryKeyConstraint('id'),
    )


def downgrade() -> None:
    op.drop_table('concept_touches')
