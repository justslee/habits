"""add speaking sessions and evaluations

Revision ID: 562cb2549ebf
Revises: 64a44ed78e5d
Create Date: 2026-03-01 19:21:02.965750
"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa

revision: str = '562cb2549ebf'
down_revision: Union[str, Sequence[str], None] = '64a44ed78e5d'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table('speaking_sessions',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('user_id', sa.Integer(), nullable=False),
        sa.Column('topic', sa.String(length=500), nullable=False),
        sa.Column('audience', sa.String(length=50), nullable=False),
        sa.Column('target_seconds', sa.Integer(), nullable=False),
        sa.Column('actual_seconds', sa.Integer(), nullable=True),
        sa.Column('concept_id', sa.Integer(), nullable=True),
        sa.Column('audio_path', sa.String(length=500), nullable=True),
        sa.Column('transcript', sa.Text(), nullable=True),
        sa.Column('session_date', sa.Date(), nullable=False),
        sa.Column('created_at', sa.DateTime(), nullable=False),
        sa.Column('updated_at', sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(['concept_id'], ['pillar_concepts.id']),
        sa.ForeignKeyConstraint(['user_id'], ['users.id']),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_table('speaking_evaluations',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('session_id', sa.Integer(), nullable=False),
        sa.Column('clarity_score', sa.Integer(), nullable=False),
        sa.Column('accuracy_score', sa.Integer(), nullable=False),
        sa.Column('structure_score', sa.Integer(), nullable=False),
        sa.Column('conciseness_score', sa.Integer(), nullable=False),
        sa.Column('confidence_score', sa.Integer(), nullable=False),
        sa.Column('overall_score', sa.Integer(), nullable=False),
        sa.Column('filler_words', sa.Text(), nullable=True),
        sa.Column('filler_count', sa.Integer(), nullable=False),
        sa.Column('specific_feedback', sa.Text(), nullable=True),
        sa.Column('commentary', sa.Text(), nullable=False),
        sa.Column('raw_llm_response', sa.Text(), nullable=True),
        sa.Column('created_at', sa.DateTime(), nullable=False),
        sa.Column('updated_at', sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(['session_id'], ['speaking_sessions.id']),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('session_id'),
    )


def downgrade() -> None:
    op.drop_table('speaking_evaluations')
    op.drop_table('speaking_sessions')
