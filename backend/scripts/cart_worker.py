"""Cart worker — runs queued cart tasks with the real browser adapters.

    FOOD_EXECUTOR=playwright python scripts/cart_worker.py [--once] [--task ID]

The API builds carts inline in dry-run mode. In playwright mode it only queues them;
this worker (run on the Mac, in a terminal you can watch during supervised cycles)
picks up `queued` tasks, drives the Habits Chrome profile, and leaves each task in
`needs_review`. It never approves or places anything: that is the gate in
cart_service, triggered from the phone.

First-time setup:
    pip install playwright && playwright install chrome
    FOOD_EXECUTOR=playwright python scripts/cart_worker.py --login hmart   # opens the profile so you can sign in
"""

from __future__ import annotations

import os
import sys
import time

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from app.db.database import SessionLocal  # noqa: E402
from app.models.food import CartTask  # noqa: E402
from app.services import cart_service, store_adapters  # noqa: E402


def login(store: str) -> None:
    adapter = store_adapters.PlaywrightAdapter(store)
    page = adapter._open()
    page.goto(store_adapters.STORE_CONFIG[store]["home"])
    print(f"Sign in to {store} in the window that opened. Press Enter here when done.")
    input()
    adapter.close()


def run_once(task_id: int | None = None) -> int:
    db = SessionLocal()
    try:
        q = db.query(CartTask).filter(CartTask.status == "queued")
        if task_id:
            q = db.query(CartTask).filter(CartTask.id == task_id)
        tasks = q.all()
        for t in tasks:
            adapter = store_adapters.adapter_for(t.store)
            print(f"[{t.id}] {t.store}: building via {adapter.name}")
            cart_service.run_task(db, t, adapter)
            print(f"[{t.id}] → {t.status} total={t.cart_total} err={t.error}")
            if hasattr(adapter, "close"):
                adapter.close()
        return len(tasks)
    finally:
        db.close()


if __name__ == "__main__":
    args = sys.argv[1:]
    if "--login" in args:
        login(args[args.index("--login") + 1])
        sys.exit(0)
    tid = int(args[args.index("--task") + 1]) if "--task" in args else None
    if "--once" in args or tid:
        run_once(tid)
        sys.exit(0)
    print("cart worker: polling every 30s (Ctrl-C to stop)")
    while True:
        n = run_once()
        time.sleep(30 if not n else 5)
