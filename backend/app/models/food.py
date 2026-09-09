"""Food models — recipes, ingredients, pantry, two-week meal cycles, swipes, learned preferences.

See docs/PLAN-FOOD.md. Bags, carts, orders and the spend ledger arrive in later phases.
"""

import datetime

from sqlalchemy import (
    JSON,
    Boolean,
    Date,
    Float,
    ForeignKey,
    Integer,
    String,
    Text,
    UniqueConstraint,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base, TimestampMixin


class Ingredient(Base, TimestampMixin):
    """A canonical purchasable ingredient (\"chicken thighs\"), with store and shelf-life knowledge."""

    __tablename__ = "ingredients"

    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(120), unique=True, nullable=False)
    category: Mapped[str | None] = mapped_column(
        String(40), nullable=True
    )  # protein, produce, staple, dairy, ...
    default_unit: Mapped[str | None] = mapped_column(String(20), nullable=True)
    preferred_store: Mapped[str | None] = mapped_column(
        String(20), nullable=True
    )  # hmart | wf | weg
    quality_tier: Mapped[str] = mapped_column(
        String(10), default="standard"
    )  # high | standard
    shelf_life_days: Mapped[int | None] = mapped_column(Integer, nullable=True)
    shelf_stable: Mapped[bool] = mapped_column(Boolean, default=False)
    # {"hmart": {"label": "2 lb", "price": 27.98}, ...}
    package_sizes: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    aliases: Mapped[list | None] = mapped_column(JSON, nullable=True)

    def __repr__(self) -> str:
        return f"<Ingredient({self.name})>"


class Recipe(Base, TimestampMixin):
    """A normalised recipe. `status`: candidate (new) → proven (cooked and liked) → retired (by the owner only)."""

    __tablename__ = "recipes"

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(
        ForeignKey("users.id"), nullable=False, index=True
    )
    slug: Mapped[str] = mapped_column(String(80), unique=True, nullable=False)
    title: Mapped[str] = mapped_column(String(160), nullable=False)
    source_url: Mapped[str | None] = mapped_column(String(500), nullable=True)
    source_site: Mapped[str | None] = mapped_column(
        String(80), nullable=True
    )  # maangchi, justonecookbook, own, ...
    rating: Mapped[float | None] = mapped_column(Float, nullable=True)
    review_count: Mapped[int | None] = mapped_column(Integer, nullable=True)
    cuisine: Mapped[str | None] = mapped_column(
        String(40), nullable=True
    )  # korean, japanese, ...
    protein_source: Mapped[str | None] = mapped_column(
        String(40), nullable=True
    )  # chicken, beef, pork, fish, tofu, egg
    prep_minutes: Mapped[int] = mapped_column(Integer, default=0)
    cook_minutes: Mapped[int] = mapped_column(Integer, default=0)
    servings: Mapped[int] = mapped_column(Integer, default=4)
    protein_g_per_serving: Mapped[float | None] = mapped_column(Float, nullable=True)
    prep_days: Mapped[int] = mapped_column(
        Integer, default=2
    )  # how many days a batch keeps
    reheat: Mapped[str] = mapped_column(
        String(20), default="pan"
    )  # oven | pan | cold | microwave
    batch_ok: Mapped[bool] = mapped_column(Boolean, default=True)
    status: Mapped[str] = mapped_column(String(20), default="candidate", index=True)
    affinity: Mapped[float] = mapped_column(
        Float, default=0.1
    )  # learned, clamped to [-1, 1]
    user_rating: Mapped[int | None] = mapped_column(Integer, nullable=True)
    times_cooked: Mapped[int] = mapped_column(Integer, default=0)
    last_cooked: Mapped[datetime.date | None] = mapped_column(Date, nullable=True)
    steps: Mapped[list | None] = mapped_column(JSON, nullable=True)
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    image_url: Mapped[str | None] = mapped_column(String(500), nullable=True)
    hue: Mapped[int | None] = mapped_column(
        Integer, nullable=True
    )  # card colour when there is no photo

    ingredients: Mapped[list["RecipeIngredient"]] = relationship(
        back_populates="recipe",
        cascade="all, delete-orphan",
        order_by="RecipeIngredient.id",
    )

    @property
    def total_minutes(self) -> int:
        return (self.prep_minutes or 0) + (self.cook_minutes or 0)

    def __repr__(self) -> str:
        return f"<Recipe({self.slug}, {self.status})>"


class RecipeIngredient(Base):
    __tablename__ = "recipe_ingredients"

    id: Mapped[int] = mapped_column(primary_key=True)
    recipe_id: Mapped[int] = mapped_column(
        ForeignKey("recipes.id"), nullable=False, index=True
    )
    ingredient_id: Mapped[int] = mapped_column(
        ForeignKey("ingredients.id"), nullable=False
    )
    quantity: Mapped[float | None] = mapped_column(Float, nullable=True)
    unit: Mapped[str | None] = mapped_column(String(20), nullable=True)
    essential: Mapped[bool] = mapped_column(Boolean, default=True)
    essential_reason: Mapped[str | None] = mapped_column(String(200), nullable=True)
    note: Mapped[str | None] = mapped_column(String(120), nullable=True)

    recipe: Mapped[Recipe] = relationship(back_populates="ingredients")
    ingredient: Mapped[Ingredient] = relationship()


class PantryItem(Base, TimestampMixin):
    """What the owner reports having: gone / some / plenty."""

    __tablename__ = "pantry_items"
    __table_args__ = (
        UniqueConstraint("user_id", "ingredient_id", name="uq_pantry_user_ingredient"),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(
        ForeignKey("users.id"), nullable=False, index=True
    )
    ingredient_id: Mapped[int] = mapped_column(
        ForeignKey("ingredients.id"), nullable=False
    )
    state: Mapped[str] = mapped_column(
        String(10), default="some"
    )  # gone | some | plenty
    last_confirmed: Mapped[datetime.date | None] = mapped_column(Date, nullable=True)
    projected_expiry: Mapped[datetime.date | None] = mapped_column(Date, nullable=True)

    ingredient: Mapped[Ingredient] = relationship()


class MealCycle(Base, TimestampMixin):
    """A two-week planning window."""

    __tablename__ = "meal_cycles"

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(
        ForeignKey("users.id"), nullable=False, index=True
    )
    start_date: Mapped[datetime.date] = mapped_column(Date, nullable=False)
    end_date: Mapped[datetime.date] = mapped_column(Date, nullable=False)
    shop_date: Mapped[datetime.date | None] = mapped_column(Date, nullable=True)
    # planning → deck → planned → bagged → ordering → active → done
    status: Mapped[str] = mapped_column(String(20), default="deck", index=True)
    travel_days: Mapped[list | None] = mapped_column(
        JSON, nullable=True
    )  # ["2026-09-25", ...]
    eat_out_days: Mapped[int] = mapped_column(Integer, default=2)
    deck: Mapped[list | None] = mapped_column(
        JSON, nullable=True
    )  # ordered recipe ids at creation
    ingredient_cap: Mapped[int] = mapped_column(Integer, default=24)
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)

    meals: Mapped[list["CycleMeal"]] = relationship(
        back_populates="cycle",
        cascade="all, delete-orphan",
        order_by="CycleMeal.cook_date",
    )
    swipes: Mapped[list["Swipe"]] = relationship(
        back_populates="cycle", cascade="all, delete-orphan", order_by="Swipe.position"
    )


class CycleMeal(Base, TimestampMixin):
    __tablename__ = "cycle_meals"

    id: Mapped[int] = mapped_column(primary_key=True)
    cycle_id: Mapped[int] = mapped_column(
        ForeignKey("meal_cycles.id"), nullable=False, index=True
    )
    recipe_id: Mapped[int] = mapped_column(ForeignKey("recipes.id"), nullable=False)
    cook_date: Mapped[datetime.date | None] = mapped_column(Date, nullable=True)
    days_covered: Mapped[list | None] = mapped_column(
        JSON, nullable=True
    )  # ["2026-09-20", "2026-09-21"]
    servings: Mapped[int] = mapped_column(Integer, default=4)
    status: Mapped[str] = mapped_column(
        String(20), default="planned"
    )  # planned | cooked | skipped
    rating: Mapped[int | None] = mapped_column(
        Integer, nullable=True
    )  # 1 = again, -1 = never, 0 = meh
    position: Mapped[int] = mapped_column(Integer, default=0)

    cycle: Mapped[MealCycle] = relationship(back_populates="meals")
    recipe: Mapped[Recipe] = relationship()


class Swipe(Base, TimestampMixin):
    __tablename__ = "swipes"
    __table_args__ = (
        UniqueConstraint("cycle_id", "recipe_id", name="uq_swipe_cycle_recipe"),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    cycle_id: Mapped[int] = mapped_column(
        ForeignKey("meal_cycles.id"), nullable=False, index=True
    )
    recipe_id: Mapped[int] = mapped_column(ForeignKey("recipes.id"), nullable=False)
    decision: Mapped[str] = mapped_column(String(10), nullable=False)  # keep | skip
    position: Mapped[int] = mapped_column(Integer, default=0)
    dwell_ms: Mapped[int | None] = mapped_column(Integer, nullable=True)

    cycle: Mapped[MealCycle] = relationship(back_populates="swipes")
    recipe: Mapped[Recipe] = relationship()


class PreferenceWeight(Base, TimestampMixin):
    """Learned taste weights per feature key (\"reheat:pan\"), clamped to [-1, 1]."""

    __tablename__ = "preference_weights"
    __table_args__ = (
        UniqueConstraint("user_id", "feature", name="uq_pref_user_feature"),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(
        ForeignKey("users.id"), nullable=False, index=True
    )
    feature: Mapped[str] = mapped_column(String(60), nullable=False)
    weight: Mapped[float] = mapped_column(Float, default=0.0)
    samples: Mapped[int] = mapped_column(Integer, default=0)
