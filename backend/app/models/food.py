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


class FoodSettings(Base, TimestampMixin):
    """Single-row knobs for the food feature. Caps live here and in the app, never only in a prompt."""

    __tablename__ = "food_settings"

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(
        ForeignKey("users.id"), nullable=False, unique=True
    )
    budget_per_cycle: Mapped[float] = mapped_column(Float, default=220.0)
    per_order_cap: Mapped[float] = mapped_column(Float, default=180.0)
    per_cycle_cap: Mapped[float] = mapped_column(Float, default=300.0)
    ordering_enabled: Mapped[bool] = mapped_column(
        Boolean, default=False
    )  # global kill switch
    supervised_cycles_remaining: Mapped[int] = mapped_column(Integer, default=3)
    approval_ttl_minutes: Mapped[int] = mapped_column(Integer, default=15)
    last_pantry_push: Mapped[datetime.date | None] = mapped_column(Date, nullable=True)
    last_cook_push: Mapped[datetime.date | None] = mapped_column(Date, nullable=True)
    total_tolerance: Mapped[float] = mapped_column(
        Float, default=3.0
    )  # $ drift allowed between approval and placement


class MerchantAccount(Base, TimestampMixin):
    """A store the bag builder can allocate to. Minimums and fees are estimates the cart builder overwrites."""

    __tablename__ = "merchant_accounts"
    __table_args__ = (
        UniqueConstraint("user_id", "store", name="uq_merchant_user_store"),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(
        ForeignKey("users.id"), nullable=False, index=True
    )
    store: Mapped[str] = mapped_column(String(20), nullable=False)  # hmart | wf | weg
    name: Mapped[str] = mapped_column(String(80), nullable=False)
    site_url: Mapped[str | None] = mapped_column(String(200), nullable=True)
    minimum: Mapped[float] = mapped_column(Float, default=0.0)
    delivery_fee: Mapped[float] = mapped_column(Float, default=0.0)
    enabled: Mapped[bool] = mapped_column(Boolean, default=True)
    supervised: Mapped[bool] = mapped_column(
        Boolean, default=True
    )  # executor stops on Place Order
    orders_this_cycle: Mapped[int] = mapped_column(Integer, default=0)
    preferred_products: Mapped[dict | None] = mapped_column(
        JSON, nullable=True
    )  # ingredient name → product memory


class ShoppingBag(Base, TimestampMixin):
    """One store's share of a cycle's shopping list."""

    __tablename__ = "shopping_bags"

    id: Mapped[int] = mapped_column(primary_key=True)
    cycle_id: Mapped[int] = mapped_column(
        ForeignKey("meal_cycles.id"), nullable=False, index=True
    )
    store: Mapped[str] = mapped_column(String(20), nullable=False)
    items: Mapped[list] = mapped_column(JSON, default=list)
    goods_total: Mapped[float] = mapped_column(Float, default=0.0)
    minimum: Mapped[float] = mapped_column(Float, default=0.0)
    delivery_fee: Mapped[float] = mapped_column(Float, default=0.0)
    short: Mapped[bool] = mapped_column(Boolean, default=False)
    shortfall: Mapped[float] = mapped_column(Float, default=0.0)
    projected_waste: Mapped[float] = mapped_column(Float, default=0.0)
    status: Mapped[str] = mapped_column(
        String(20), default="proposed"
    )  # proposed | approved | carted | ordered
    bag_hash: Mapped[str | None] = mapped_column(String(64), nullable=True)

    cycle: Mapped[MealCycle] = relationship()


class CartTask(Base, TimestampMixin):
    """One store cart for one bag, driven by the executor. Status machine:
    queued → building → needs_review → approved → placing → (awaiting_human →) placed | failed | rejected."""

    __tablename__ = "cart_tasks"

    id: Mapped[int] = mapped_column(primary_key=True)
    cycle_id: Mapped[int] = mapped_column(
        ForeignKey("meal_cycles.id"), nullable=False, index=True
    )
    bag_id: Mapped[int] = mapped_column(
        ForeignKey("shopping_bags.id"), nullable=False, unique=True
    )
    store: Mapped[str] = mapped_column(String(20), nullable=False)
    status: Mapped[str] = mapped_column(String(20), default="queued", index=True)
    supervised: Mapped[bool] = mapped_column(Boolean, default=True)
    cart_lines: Mapped[list | None] = mapped_column(
        JSON, nullable=True
    )  # as read back from the store page
    cart_total: Mapped[float | None] = mapped_column(Float, nullable=True)
    screenshot_path: Mapped[str | None] = mapped_column(String(300), nullable=True)
    error: Mapped[str | None] = mapped_column(Text, nullable=True)
    attempts: Mapped[int] = mapped_column(Integer, default=0)
    idempotency_key: Mapped[str] = mapped_column(
        String(64), unique=True, nullable=False
    )
    events: Mapped[list] = mapped_column(
        JSON, default=list
    )  # audit trail [{ts, event, detail}]

    bag: Mapped[ShoppingBag] = relationship()


class OrderApproval(Base, TimestampMixin):
    """A signed, single-use, expiring approval bound to one cart task and its total."""

    __tablename__ = "order_approvals"

    id: Mapped[int] = mapped_column(primary_key=True)
    cart_task_id: Mapped[int] = mapped_column(
        ForeignKey("cart_tasks.id"), nullable=False, index=True
    )
    token: Mapped[str] = mapped_column(String(64), unique=True, nullable=False)
    approved_total: Mapped[float] = mapped_column(Float, nullable=False)
    bag_hash: Mapped[str | None] = mapped_column(String(64), nullable=True)
    biometric: Mapped[bool] = mapped_column(Boolean, default=False)
    expires_at: Mapped[datetime.datetime] = mapped_column(nullable=False)
    used_at: Mapped[datetime.datetime | None] = mapped_column(nullable=True)
    revoked: Mapped[bool] = mapped_column(Boolean, default=False)


class Order(Base, TimestampMixin):
    """A placed order. Doubles as the spend ledger row."""

    __tablename__ = "orders"

    id: Mapped[int] = mapped_column(primary_key=True)
    cart_task_id: Mapped[int] = mapped_column(
        ForeignKey("cart_tasks.id"), nullable=False, unique=True
    )
    cycle_id: Mapped[int] = mapped_column(
        ForeignKey("meal_cycles.id"), nullable=False, index=True
    )
    store: Mapped[str] = mapped_column(String(20), nullable=False)
    merchant_order_id: Mapped[str | None] = mapped_column(String(80), nullable=True)
    goods_total: Mapped[float] = mapped_column(Float, default=0.0)
    fees: Mapped[float] = mapped_column(Float, default=0.0)
    tip: Mapped[float] = mapped_column(Float, default=0.0)
    total: Mapped[float] = mapped_column(Float, default=0.0)
    line_items: Mapped[list | None] = mapped_column(JSON, nullable=True)
    receipt_path: Mapped[str | None] = mapped_column(String(300), nullable=True)
    delivery_window: Mapped[str | None] = mapped_column(String(80), nullable=True)
    placed_at: Mapped[datetime.datetime] = mapped_column(nullable=False)
    placed_by: Mapped[str] = mapped_column(String(20), default="human")  # human | agent


class CalendarFeed(Base, TimestampMixin):
    """A Google Calendar secret iCal address (read-only, no OAuth)."""

    __tablename__ = "calendar_feeds"

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(
        ForeignKey("users.id"), nullable=False, index=True
    )
    url: Mapped[str] = mapped_column(String(600), nullable=False)
    label: Mapped[str] = mapped_column(String(80), default="Google Calendar")
    enabled: Mapped[bool] = mapped_column(Boolean, default=True)
    last_synced_at: Mapped[datetime.datetime | None] = mapped_column(nullable=True)
    last_error: Mapped[str | None] = mapped_column(String(300), nullable=True)


class TravelSpan(Base, TimestampMixin):
    """Days the owner is away, derived from calendar events. Ignored spans don't affect cycles."""

    __tablename__ = "travel_spans"
    __table_args__ = (UniqueConstraint("feed_id", "uid", name="uq_travel_feed_uid"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(
        ForeignKey("users.id"), nullable=False, index=True
    )
    feed_id: Mapped[int | None] = mapped_column(
        ForeignKey("calendar_feeds.id"), nullable=True
    )
    uid: Mapped[str] = mapped_column(String(200), nullable=False)
    start_date: Mapped[datetime.date] = mapped_column(Date, nullable=False)
    end_date: Mapped[datetime.date] = mapped_column(Date, nullable=False)
    summary: Mapped[str | None] = mapped_column(String(160), nullable=True)
    reason: Mapped[str | None] = mapped_column(String(60), nullable=True)
    confirmed: Mapped[bool] = mapped_column(Boolean, default=False)
    ignored: Mapped[bool] = mapped_column(Boolean, default=False)
