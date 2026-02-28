"""add pillar concepts table

Revision ID: c3d4e5f6a7b8
Revises: b2c3d4e5f6a7
Create Date: 2026-02-27 00:00:02.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'c3d4e5f6a7b8'
down_revision: Union[str, None] = 'b2c3d4e5f6a7'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Create pillar_concepts table (P5-2)."""
    op.create_table(
        'pillar_concepts',
        sa.Column('id', sa.Integer(), primary_key=True),
        sa.Column('pillar_id', sa.Integer(), sa.ForeignKey('pillars.id'), nullable=False),
        sa.Column('user_id', sa.Integer(), sa.ForeignKey('users.id'), nullable=False),
        sa.Column('name', sa.String(200), nullable=False),
        sa.Column('tier', sa.Integer(), nullable=False),
        sa.Column('description', sa.Text(), nullable=True),
        sa.Column('prerequisites', sa.Text(), nullable=True),
        sa.Column('status', sa.String(20), server_default='not_started'),
        sa.Column('notes', sa.Text(), nullable=True),
        sa.Column('key_resources', sa.Text(), nullable=True),
        sa.Column('sort_order', sa.Integer(), server_default='0'),
        sa.Column('created_at', sa.DateTime(), nullable=True),
        sa.Column('updated_at', sa.DateTime(), nullable=True),
    )
    op.create_index('ix_pillar_concepts_pillar_user', 'pillar_concepts', ['pillar_id', 'user_id'])


def downgrade() -> None:
    """Drop pillar_concepts table."""
    op.drop_index('ix_pillar_concepts_pillar_user', 'pillar_concepts')
    op.drop_table('pillar_concepts')
