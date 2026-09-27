"""Shopper CLI — the only way the Claude Code shopper session touches cart state.

Runs on the Mac against the live database (use ops/mac/shopper.sh, which loads the env):

    shopper.sh wait                  block until a cart needs the browser, then exit
    shopper.sh next                  claim the next cart; prints the job as JSON
    shopper.sh cart ID < cart.json   report a filled cart:
                                     {"lines": [...], "total": 0.0, "screenshot": "/abs.png", "cart_url": "https://..."}
    shopper.sh fail ID "reason"      give up on this cart
    shopper.sh status                carts in flight

Nothing here places an order. The owner reviews the cart in the Habits app and checks out in
the store's own app (cart_service refuses to place anything in agent mode).
"""

from __future__ import annotations

import argparse
import asyncio
import json
import os
import sys
import time

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from app.db.database import SessionLocal  # noqa: E402
from app.models.food import CartTask, MealCycle  # noqa: E402
from app.services import cart_service, store_adapters  # noqa: E402
from app.services.bag_builder import ensure_merchants  # noqa: E402


def _out(obj) -> None:
    print(json.dumps(obj, indent=2, default=str))


def _user_id(db, task: CartTask) -> int:
    return db.get(MealCycle, task.cycle_id).user_id


def _push(db, task: CartTask, title: str, body: str) -> None:
    from app.services.push import send_push

    try:
        asyncio.run(
            send_push(
                db,
                _user_id(db, task),
                title=title,
                body=body,
                data={"screen": "Food", "cart_id": task.id},
            )
        )
    except Exception as e:  # noqa: BLE001 — a missed push never blocks the cart
        print(f"push failed: {e}", file=sys.stderr)


def _job(db, task: CartTask) -> dict:
    merchant = ensure_merchants(db, _user_id(db, task)).get(task.store)
    cfg = store_adapters.STORE_CONFIG.get(task.store, {})
    bag = task.bag
    job = {
        "id": task.id,
        "store": task.store,
        "store_name": merchant.name if merchant else task.store,
        "store_home": cfg.get("home") or (merchant.site_url if merchant else None),
        "store_cart": cfg.get("cart"),
        "store_location": merchant.location if merchant else None,
        "screenshot_dir": str(store_adapters.SCREENSHOT_DIR),
        "attempt": task.attempts,
        "last_error": task.error,
    }
    job["items"] = [
        {
            k: i.get(k)
            for k in (
                "name",
                "packs",
                "pack_label",
                "product_query",
                "unit_price",
                "line_total",
            )
        }
        for i in (bag.items or [])
    ]
    job["bag_estimate"] = round(
        sum(i.get("line_total") or 0 for i in bag.items or [])
        + (bag.delivery_fee or 0),
        2,
    )
    return job


def cmd_wait(args) -> int:
    deadline = time.time() + args.max_minutes * 60 if args.max_minutes else None
    while True:
        db = SessionLocal()
        try:
            n = cart_service.shopper_work(db).count()
        finally:
            db.close()
        if n:
            print(f"{n} cart(s) need the browser — run `shopper.sh next`")
            return 0
        if deadline and time.time() > deadline:
            print("nothing to do yet — re-arm `shopper.sh wait`")
            return 0
        time.sleep(args.interval)


def cmd_next(_args) -> int:
    db = SessionLocal()
    try:
        task = cart_service.next_shopper_task(db)
        _out(_job(db, task) if task else {"idle": True})
        return 0
    finally:
        db.close()


def _load(db, task_id: int) -> CartTask:
    task = db.get(CartTask, task_id)
    if task is None:
        raise SystemExit(f"no cart {task_id}")
    return task


def cmd_cart(args) -> int:
    payload = json.load(sys.stdin)
    db = SessionLocal()
    try:
        task = _load(db, args.id)
        try:
            cart_service.report_cart(
                db,
                task,
                payload.get("lines") or [],
                float(payload.get("total") or 0),
                payload.get("screenshot"),
                payload.get("cart_url"),
            )
        except cart_service.GateError as e:
            _out({"ok": False, "reason": str(e)})
            return 2
        _push(
            db,
            task,
            "Cart ready",
            f"{len(task.cart_lines)} items · ${task.cart_total:.2f} before fees. Review it, then check out in the store's app.",
        )
        _out({"ok": True, "status": task.status, "total": task.cart_total})
        return 0
    finally:
        db.close()


def cmd_fail(args) -> int:
    db = SessionLocal()
    try:
        task = _load(db, args.id)
        try:
            cart_service.report_failure(db, task, args.reason)
        except cart_service.GateError as e:
            _out({"ok": False, "reason": str(e)})
            return 2
        _push(db, task, "Cart needs you", args.reason[:140])
        _out({"ok": True, "status": task.status})
        return 0
    finally:
        db.close()


def cmd_status(_args) -> int:
    db = SessionLocal()
    try:
        tasks = (
            db.query(CartTask)
            .filter(CartTask.status.notin_(("placed", "rejected")))
            .order_by(CartTask.id)
            .all()
        )
        _out(
            [
                {
                    "id": t.id,
                    "store": t.store,
                    "status": t.status,
                    "total": t.cart_total,
                    "error": t.error,
                    "last_event": (t.events or [None])[-1],
                }
                for t in tasks
            ]
        )
        return 0
    finally:
        db.close()


def main() -> int:
    p = argparse.ArgumentParser(prog="shopper")
    sub = p.add_subparsers(dest="cmd", required=True)
    w = sub.add_parser("wait")
    w.add_argument("--interval", type=int, default=15)
    w.add_argument("--max-minutes", type=int, default=60)
    w.set_defaults(fn=cmd_wait)
    sub.add_parser("next").set_defaults(fn=cmd_next)
    c = sub.add_parser("cart")
    c.add_argument("id", type=int)
    c.set_defaults(fn=cmd_cart)
    f = sub.add_parser("fail")
    f.add_argument("id", type=int)
    f.add_argument("reason")
    f.set_defaults(fn=cmd_fail)
    sub.add_parser("status").set_defaults(fn=cmd_status)
    args = p.parse_args()
    return args.fn(args)


if __name__ == "__main__":
    sys.exit(main())
