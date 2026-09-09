"""add food tables (recipes, ingredients, pantry, meal cycles, swipes, preference weights)

Revision ID: e3f4a5b6c7d8
Revises: d7e2f8a1b3c4
Create Date: 2026-09-09 00:10:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'e3f4a5b6c7d8'
down_revision: Union[str, Sequence[str], None] = 'd7e2f8a1b3c4'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def _ts():
    return [
        sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(), nullable=False, server_default=sa.func.now()),
    ]


def upgrade() -> None:
    op.create_table(
        "ingredients",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("name", sa.String(120), nullable=False, unique=True),
        sa.Column("category", sa.String(40)),
        sa.Column("default_unit", sa.String(20)),
        sa.Column("preferred_store", sa.String(20)),
        sa.Column("quality_tier", sa.String(10), nullable=False, server_default="standard"),
        sa.Column("shelf_life_days", sa.Integer()),
        sa.Column("shelf_stable", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column("package_sizes", sa.JSON()),
        sa.Column("aliases", sa.JSON()),
        *_ts(),
    )
    op.create_table(
        "recipes",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("user_id", sa.Integer(), sa.ForeignKey("users.id"), nullable=False),
        sa.Column("slug", sa.String(80), nullable=False, unique=True),
        sa.Column("title", sa.String(160), nullable=False),
        sa.Column("source_url", sa.String(500)),
        sa.Column("source_site", sa.String(80)),
        sa.Column("rating", sa.Float()),
        sa.Column("review_count", sa.Integer()),
        sa.Column("cuisine", sa.String(40)),
        sa.Column("protein_source", sa.String(40)),
        sa.Column("prep_minutes", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("cook_minutes", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("servings", sa.Integer(), nullable=False, server_default="4"),
        sa.Column("protein_g_per_serving", sa.Float()),
        sa.Column("prep_days", sa.Integer(), nullable=False, server_default="2"),
        sa.Column("reheat", sa.String(20), nullable=False, server_default="pan"),
        sa.Column("batch_ok", sa.Boolean(), nullable=False, server_default=sa.true()),
        sa.Column("status", sa.String(20), nullable=False, server_default="candidate"),
        sa.Column("affinity", sa.Float(), nullable=False, server_default="0.1"),
        sa.Column("user_rating", sa.Integer()),
        sa.Column("times_cooked", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("last_cooked", sa.Date()),
        sa.Column("steps", sa.JSON()),
        sa.Column("notes", sa.Text()),
        sa.Column("image_url", sa.String(500)),
        sa.Column("hue", sa.Integer()),
        *_ts(),
    )
    op.create_index("ix_recipes_user_id", "recipes", ["user_id"])
    op.create_index("ix_recipes_status", "recipes", ["status"])
    op.create_table(
        "recipe_ingredients",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("recipe_id", sa.Integer(), sa.ForeignKey("recipes.id"), nullable=False),
        sa.Column("ingredient_id", sa.Integer(), sa.ForeignKey("ingredients.id"), nullable=False),
        sa.Column("quantity", sa.Float()),
        sa.Column("unit", sa.String(20)),
        sa.Column("essential", sa.Boolean(), nullable=False, server_default=sa.true()),
        sa.Column("essential_reason", sa.String(200)),
        sa.Column("note", sa.String(120)),
    )
    op.create_index("ix_recipe_ingredients_recipe_id", "recipe_ingredients", ["recipe_id"])
    op.create_table(
        "pantry_items",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("user_id", sa.Integer(), sa.ForeignKey("users.id"), nullable=False),
        sa.Column("ingredient_id", sa.Integer(), sa.ForeignKey("ingredients.id"), nullable=False),
        sa.Column("state", sa.String(10), nullable=False, server_default="some"),
        sa.Column("last_confirmed", sa.Date()),
        sa.Column("projected_expiry", sa.Date()),
        *_ts(),
        sa.UniqueConstraint("user_id", "ingredient_id", name="uq_pantry_user_ingredient"),
    )
    op.create_index("ix_pantry_items_user_id", "pantry_items", ["user_id"])
    op.create_table(
        "meal_cycles",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("user_id", sa.Integer(), sa.ForeignKey("users.id"), nullable=False),
        sa.Column("start_date", sa.Date(), nullable=False),
        sa.Column("end_date", sa.Date(), nullable=False),
        sa.Column("shop_date", sa.Date()),
        sa.Column("status", sa.String(20), nullable=False, server_default="deck"),
        sa.Column("travel_days", sa.JSON()),
        sa.Column("eat_out_days", sa.Integer(), nullable=False, server_default="2"),
        sa.Column("deck", sa.JSON()),
        sa.Column("ingredient_cap", sa.Integer(), nullable=False, server_default="24"),
        sa.Column("notes", sa.Text()),
        *_ts(),
    )
    op.create_index("ix_meal_cycles_user_id", "meal_cycles", ["user_id"])
    op.create_index("ix_meal_cycles_status", "meal_cycles", ["status"])
    op.create_table(
        "cycle_meals",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("cycle_id", sa.Integer(), sa.ForeignKey("meal_cycles.id"), nullable=False),
        sa.Column("recipe_id", sa.Integer(), sa.ForeignKey("recipes.id"), nullable=False),
        sa.Column("cook_date", sa.Date()),
        sa.Column("days_covered", sa.JSON()),
        sa.Column("servings", sa.Integer(), nullable=False, server_default="4"),
        sa.Column("status", sa.String(20), nullable=False, server_default="planned"),
        sa.Column("rating", sa.Integer()),
        sa.Column("position", sa.Integer(), nullable=False, server_default="0"),
        *_ts(),
    )
    op.create_index("ix_cycle_meals_cycle_id", "cycle_meals", ["cycle_id"])
    op.create_table(
        "swipes",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("cycle_id", sa.Integer(), sa.ForeignKey("meal_cycles.id"), nullable=False),
        sa.Column("recipe_id", sa.Integer(), sa.ForeignKey("recipes.id"), nullable=False),
        sa.Column("decision", sa.String(10), nullable=False),
        sa.Column("position", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("dwell_ms", sa.Integer()),
        *_ts(),
        sa.UniqueConstraint("cycle_id", "recipe_id", name="uq_swipe_cycle_recipe"),
    )
    op.create_index("ix_swipes_cycle_id", "swipes", ["cycle_id"])
    op.create_table(
        "preference_weights",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("user_id", sa.Integer(), sa.ForeignKey("users.id"), nullable=False),
        sa.Column("feature", sa.String(60), nullable=False),
        sa.Column("weight", sa.Float(), nullable=False, server_default="0"),
        sa.Column("samples", sa.Integer(), nullable=False, server_default="0"),
        *_ts(),
        sa.UniqueConstraint("user_id", "feature", name="uq_pref_user_feature"),
    )
    op.create_index("ix_preference_weights_user_id", "preference_weights", ["user_id"])


def downgrade() -> None:
    for t in ("preference_weights", "swipes", "cycle_meals", "meal_cycles", "pantry_items", "recipe_ingredients", "recipes", "ingredients"):
        op.drop_table(t)
