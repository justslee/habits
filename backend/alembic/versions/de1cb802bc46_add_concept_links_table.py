"""add_concept_links_table

Revision ID: de1cb802bc46
Revises: c3d4e5f6a7b8
Create Date: 2026-02-27 14:54:32.307867

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'de1cb802bc46'
down_revision: Union[str, Sequence[str], None] = 'c3d4e5f6a7b8'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Add concept_links table for cross-pillar concept linking."""
    op.create_table('concept_links',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('concept_id_a', sa.Integer(), nullable=False),
        sa.Column('concept_id_b', sa.Integer(), nullable=False),
        sa.Column('link_type', sa.String(length=20), nullable=False),
        sa.Column('description', sa.Text(), nullable=True),
        sa.Column('created_at', sa.DateTime(), nullable=False),
        sa.Column('updated_at', sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(['concept_id_a'], ['pillar_concepts.id']),
        sa.ForeignKeyConstraint(['concept_id_b'], ['pillar_concepts.id']),
        sa.PrimaryKeyConstraint('id'),
    )


def downgrade() -> None:
    """Remove concept_links table."""
    op.drop_table('concept_links')
