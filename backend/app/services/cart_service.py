"""Cart tasks, the payment gate, and the spend ledger (docs/PLAN-FOOD.md §6, §7b).

The gate, in code (never only in a prompt):
  1. no card data anywhere — merchants hold the payment method
  2. a dedicated browser profile, driven by a store adapter (see store_adapters.py)
  3. cart, then STOP in needs_review with the lines and total read back from the page
  4. approval = single-use token bound to (task, bag hash, total), expiring in N minutes
  5. re-read the total right before Place Order; drift beyond tolerance aborts
  6. hard caps: per order, per cycle, one placed order per store per cycle, global kill switch
  7. supervised mode: park on Place Order and ask the human to press it
  8. idempotency: one order slot per task; a retry checks for an existing order first
  9. audit: every transition is an event with a timestamp
"""

from __future__ import annotations

import datetime
import os
import secrets
from dataclasses import dataclass

from sqlalchemy.orm import Session

from app.models.food import (
    CartTask,
    CycleMeal,
    FoodSettings,
    MealCycle,
    MerchantAccount,
    Order,
    OrderApproval,
    RecipeIngredient,
    ShoppingBag,
)
from app.services.bag_builder import ensure_food_settings, ensure_merchants


class GateError(Exception):
    """A payment-gate refusal. Message is safe to show the owner."""


@dataclass
class CartResult:
    lines: list[dict]
    total: float
    screenshot_path: str | None = None


@dataclass
class PlacedResult:
    merchant_order_id: str
    total: float
    receipt_path: str | None = None
    delivery_window: str | None = None


def _now() -> datetime.datetime:
    return datetime.datetime.now(datetime.UTC).replace(tzinfo=None)


def _event(task: CartTask, event: str, detail: str | None = None) -> None:
    task.events = list(task.events or []) + [
        {"ts": _now().isoformat(timespec="seconds"), "event": event, "detail": detail}
    ]


# ---------------------------------------------------------------------------
# Task lifecycle
# ---------------------------------------------------------------------------


def executor_mode() -> str:
    """dry_run (default: simulate carts from bag prices) | playwright (real browser adapters)."""
    return os.getenv("FOOD_EXECUTOR", "dry_run")


def create_tasks_for_cycle(
    db: Session, user_id: int, cycle: MealCycle
) -> list[CartTask]:
    settings = ensure_food_settings(db, user_id)
    merchants = ensure_merchants(db, user_id)
    bags = (
        db.query(ShoppingBag)
        .filter(ShoppingBag.cycle_id == cycle.id, ShoppingBag.status == "approved")
        .all()
    )
    tasks: list[CartTask] = []
    for bag in bags:
        existing = db.query(CartTask).filter(CartTask.bag_id == bag.id).first()
        if existing:
            tasks.append(existing)
            continue
        m = merchants.get(bag.store)
        supervised = bool(
            (m.supervised if m else True) or settings.supervised_cycles_remaining > 0
        )
        task = CartTask(
            cycle_id=cycle.id,
            bag_id=bag.id,
            store=bag.store,
            status="queued",
            supervised=supervised,
            idempotency_key=secrets.token_hex(16),
            events=[],
        )
        _event(
            task,
            "queued",
            f"bag {bag.id} · {len(bag.items or [])} items · supervised={supervised}",
        )
        db.add(task)
        tasks.append(task)
    db.commit()
    return tasks


def run_task(db: Session, task: CartTask, adapter) -> CartTask:
    """Build the cart with the adapter and stop in needs_review."""
    if task.status not in ("queued", "failed", "rejected"):
        return task
    task.status = "building"
    task.attempts = (task.attempts or 0) + 1
    _event(task, "building", f"attempt {task.attempts} via {adapter.name}")
    db.commit()
    try:
        result: CartResult = adapter.build_cart(task.bag)
        task.cart_lines = result.lines
        task.cart_total = round(result.total, 2)
        task.screenshot_path = result.screenshot_path
        task.status = "needs_review"
        task.error = None
        _event(
            task,
            "needs_review",
            f"{len(result.lines)} lines · total {task.cart_total:.2f}",
        )
    except Exception as e:  # noqa: BLE001 — a failed build is a state, not a crash
        task.status = "failed"
        task.error = str(e)[:500]
        _event(task, "failed", task.error)
    db.commit()
    return task


# ---------------------------------------------------------------------------
# Gate
# ---------------------------------------------------------------------------


def _check_caps(
    db: Session,
    settings: FoodSettings,
    merchant: MerchantAccount | None,
    task: CartTask,
    total: float,
) -> None:
    if not settings.ordering_enabled:
        raise GateError(
            "Ordering is switched off (kill switch). Turn it on in Food settings first."
        )
    if total > settings.per_order_cap:
        raise GateError(
            f"Cart total ${total:.2f} is above the per-order cap of ${settings.per_order_cap:.2f}."
        )
    placed_this_cycle = sum(
        o.total for o in db.query(Order).filter(Order.cycle_id == task.cycle_id).all()
    )
    if placed_this_cycle + total > settings.per_cycle_cap:
        raise GateError(
            f"This order would take the cycle to ${placed_this_cycle + total:.2f}, above the per-cycle cap of ${settings.per_cycle_cap:.2f}."
        )
    if merchant and merchant.orders_this_cycle >= 1:
        raise GateError(
            f"An order was already placed at {merchant.name} this cycle. One per store per cycle."
        )
    if db.query(Order).filter(Order.cart_task_id == task.id).first():
        raise GateError("This cart was already ordered.")


def approve_task(
    db: Session, user_id: int, task: CartTask, *, biometric: bool
) -> OrderApproval:
    if task.status != "needs_review":
        raise GateError(f"Cart is {task.status}, not awaiting review.")
    if task.cart_total is None:
        raise GateError("Cart has no total to approve.")
    if not biometric:
        raise GateError("Approval requires Face ID on the phone.")
    settings = ensure_food_settings(db, user_id)
    merchant = ensure_merchants(db, user_id).get(task.store)
    _check_caps(db, settings, merchant, task, task.cart_total)
    # revoke any earlier live approvals for this task
    for a in (
        db.query(OrderApproval)
        .filter(OrderApproval.cart_task_id == task.id, OrderApproval.used_at.is_(None))
        .all()
    ):
        a.revoked = True
    approval = OrderApproval(
        cart_task_id=task.id,
        token=secrets.token_urlsafe(32),
        approved_total=task.cart_total,
        bag_hash=task.bag.bag_hash,
        biometric=True,
        expires_at=_now() + datetime.timedelta(minutes=settings.approval_ttl_minutes),
    )
    db.add(approval)
    task.status = "approved"
    _event(
        task,
        "approved",
        f"total {task.cart_total:.2f} · expires {approval.expires_at.isoformat(timespec='minutes')}Z · single use",
    )
    db.commit()
    db.refresh(approval)
    return approval


def _consume_approval(db: Session, task: CartTask, token: str) -> OrderApproval:
    a = (
        db.query(OrderApproval)
        .filter(OrderApproval.token == token, OrderApproval.cart_task_id == task.id)
        .first()
    )
    if a is None:
        raise GateError("Approval token does not match this cart.")
    if a.revoked:
        raise GateError("Approval was revoked.")
    if a.used_at is not None:
        raise GateError("Approval was already used.")
    if _now() > a.expires_at:
        raise GateError("Approval expired. Approve again.")
    if a.bag_hash and task.bag.bag_hash and a.bag_hash != task.bag.bag_hash:
        raise GateError("The bag changed since approval. Approve again.")
    return a


def place_task(
    db: Session, user_id: int, task: CartTask, token: str, adapter
) -> CartTask:
    """Place the order (or, supervised, park on Place Order and hand over to the human)."""
    if task.status not in ("approved", "placing"):
        raise GateError(f"Cart is {task.status}; approve it first.")
    settings = ensure_food_settings(db, user_id)
    merchant = ensure_merchants(db, user_id).get(task.store)
    approval = _consume_approval(db, task, token)

    task.status = "placing"
    _event(task, "placing", "re-reading the cart total")
    db.commit()

    live_total = round(float(adapter.read_total(task.bag)), 2)
    if abs(live_total - approval.approved_total) > settings.total_tolerance:
        task.status = "needs_review"
        task.cart_total = live_total
        approval.revoked = True
        _event(
            task,
            "total_drift",
            f"approved {approval.approved_total:.2f} vs live {live_total:.2f} · re-approve",
        )
        db.commit()
        raise GateError(
            f"Cart total moved from ${approval.approved_total:.2f} to ${live_total:.2f}. Approve again."
        )

    _check_caps(db, settings, merchant, task, live_total)

    if task.supervised:
        adapter.prepare_place_order(task.bag)
        task.status = "awaiting_human"
        approval.used_at = _now()
        _event(
            task,
            "awaiting_human",
            "parked on Place Order — press it on the Mac, then confirm in the app",
        )
        db.commit()
        return task

    placed: PlacedResult = adapter.place_order(task.bag)
    approval.used_at = _now()
    _record_order(db, task, placed, placed_by="agent", merchant=merchant)
    return task


def confirm_human_placed(
    db: Session, user_id: int, task: CartTask, merchant_order_id: str | None
) -> CartTask:
    if task.status != "awaiting_human":
        raise GateError(f"Cart is {task.status}, not awaiting your confirmation.")
    merchant = ensure_merchants(db, user_id).get(task.store)
    placed = PlacedResult(
        merchant_order_id=merchant_order_id or f"{task.store.upper()}-{task.id}",
        total=float(task.cart_total or 0),
    )
    _record_order(db, task, placed, placed_by="human", merchant=merchant)
    return task


def _record_order(
    db: Session,
    task: CartTask,
    placed: PlacedResult,
    *,
    placed_by: str,
    merchant: MerchantAccount | None,
) -> Order:
    if db.query(Order).filter(Order.cart_task_id == task.id).first():
        raise GateError("This cart was already ordered.")  # idempotency
    fees = task.bag.delivery_fee or 0.0
    order = Order(
        cart_task_id=task.id,
        cycle_id=task.cycle_id,
        store=task.store,
        merchant_order_id=placed.merchant_order_id,
        goods_total=round(placed.total - fees, 2),
        fees=fees,
        tip=0.0,
        total=round(placed.total, 2),
        line_items=task.cart_lines,
        receipt_path=placed.receipt_path,
        delivery_window=placed.delivery_window,
        placed_at=_now(),
        placed_by=placed_by,
    )
    db.add(order)
    task.status = "placed"
    task.bag.status = "ordered"
    if merchant:
        merchant.orders_this_cycle = (merchant.orders_this_cycle or 0) + 1
    _event(
        task,
        "placed",
        f"order {placed.merchant_order_id} · {placed.total:.2f} · by {placed_by}",
    )
    db.commit()
    return order


def reject_task(db: Session, task: CartTask, reason: str | None) -> CartTask:
    if task.status in ("placed",):
        raise GateError("Order already placed.")
    for a in (
        db.query(OrderApproval)
        .filter(OrderApproval.cart_task_id == task.id, OrderApproval.used_at.is_(None))
        .all()
    ):
        a.revoked = True
    task.status = "rejected"
    task.bag.status = "approved"
    _event(task, "rejected", reason)
    db.commit()
    return task


def reset_cycle_counters(db: Session, user_id: int) -> None:
    for m in ensure_merchants(db, user_id).values():
        m.orders_this_cycle = 0
    s = ensure_food_settings(db, user_id)
    if s.supervised_cycles_remaining > 0:
        s.supervised_cycles_remaining -= 1
    db.commit()


# ---------------------------------------------------------------------------
# Spend ledger
# ---------------------------------------------------------------------------


def spend_summary(
    db: Session, user_id: int, current: MealCycle | None, cycles: int = 6
) -> dict:
    settings = ensure_food_settings(db, user_id)
    recent = (
        db.query(MealCycle)
        .filter(MealCycle.user_id == user_id)
        .order_by(MealCycle.start_date.desc())
        .limit(cycles)
        .all()
    )
    recent = list(reversed(recent))
    history = []
    for c in recent:
        orders = db.query(Order).filter(Order.cycle_id == c.id).all()
        by_store = {}
        for o in orders:
            by_store[o.store] = round(by_store.get(o.store, 0.0) + o.goods_total, 2)
        history.append(
            {
                "cycle_id": c.id,
                "label": c.start_date.strftime("%b %-d"),
                "by_store": by_store,
                "goods": round(sum(o.goods_total for o in orders), 2),
                "fees": round(sum(o.fees + o.tip for o in orders), 2),
                "total": round(sum(o.total for o in orders), 2),
            }
        )

    cur = None
    if current is not None:
        orders = db.query(Order).filter(Order.cycle_id == current.id).all()
        goods = round(sum(o.goods_total for o in orders), 2)
        fees = round(sum(o.fees + o.tip for o in orders), 2)
        total = round(goods + fees, 2)
        meals = [m for m in current.meals if m.status != "skipped"]
        eating_days = max(1, sum(len(m.days_covered or []) for m in meals))
        # allocate goods to meals by essential-ingredient share
        per_meal = _cost_per_meal(db, current, goods)
        protein_total = sum(
            (m.recipe.protein_g_per_serving or 0) * len(m.days_covered or []) * 2
            for m in meals
        )
        cur = {
            "cycle_id": current.id,
            "goods": goods,
            "fees": fees,
            "total": total,
            "per_eating_day": round(total / eating_days, 2),
            "per_serving": round(goods / max(1, eating_days * 2), 2),
            "protein_g_per_dollar": round(protein_total / goods, 1) if goods else None,
            "budget_per_cycle": settings.budget_per_cycle,
            "vs_budget": round(settings.budget_per_cycle - total, 2),
            "per_meal": per_meal,
            "orders": len(orders),
        }
    avg = round(sum(h["total"] for h in history) / len(history), 2) if history else 0.0
    return {
        "current": cur,
        "history": history,
        "average_total": avg,
        "budget_per_cycle": settings.budget_per_cycle,
    }


def _cost_per_meal(db: Session, cycle: MealCycle, goods: float) -> list[dict]:
    meals = [m for m in cycle.meals if m.status != "skipped"]
    if not meals or not goods:
        return []
    weights = {}
    for m in meals:
        n = (
            db.query(RecipeIngredient)
            .filter(
                RecipeIngredient.recipe_id == m.recipe_id,
                RecipeIngredient.essential.is_(True),
            )
            .count()
        )
        weights[m.id] = max(1, n)
    tot = sum(weights.values())
    out = []
    for m in meals:
        cost = goods * weights[m.id] / tot
        servings = max(1, len(m.days_covered or []) * 2)
        out.append(
            {
                "meal_id": m.id,
                "title": m.recipe.title,
                "cost": round(cost, 2),
                "per_serving": round(cost / servings, 2),
                "protein_g_per_dollar": round(
                    ((m.recipe.protein_g_per_serving or 0) * servings) / cost, 1
                )
                if cost
                else None,
            }
        )
    return out


def _unused(_: CycleMeal) -> None:  # keeps the import meaningful for type checkers
    return None
