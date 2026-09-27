"""The payment gate, end to end in dry-run mode: caps, kill switch, single-use expiring
approvals, total re-verification, supervised hand-off, idempotency, ledger."""

import datetime

import pytest
from httpx import ASGITransport, AsyncClient

from app.main import app
from app.models.food import CartTask, MerchantAccount, Order, OrderApproval
from app.services import cart_service, store_adapters


def _client():
    return AsyncClient(transport=ASGITransport(app=app), base_url="http://test")


async def _bagged_cycle(client, slugs=("dak-galbi", "galbi-tang")):
    cycle = (
        await client.post(
            "/api/v1/food/cycles",
            json={"start_date": "2026-09-20", "travel_days": [], "eat_out_days": 2},
        )
    ).json()
    recipes = {r["slug"]: r for r in (await client.get("/api/v1/food/recipes")).json()}
    for slug in slugs:
        await client.post(
            f"/api/v1/food/cycles/{cycle['id']}/swipe",
            json={"recipe_id": recipes[slug]["id"], "decision": "keep", "spare": True},
        )
    await client.post(f"/api/v1/food/cycles/{cycle['id']}/plan")
    await client.post(f"/api/v1/food/cycles/{cycle['id']}/bags")
    await client.post(f"/api/v1/food/cycles/{cycle['id']}/bags/approve")
    return cycle


@pytest.mark.asyncio
async def test_carts_build_in_dry_run_and_stop_in_needs_review(db_session):
    async with _client() as client:
        cycle = await _bagged_cycle(client)
        carts = (await client.get(f"/api/v1/food/cycles/{cycle['id']}/carts")).json()
        assert carts, "one cart per approved bag"
        for c in carts:
            assert c["status"] == "needs_review"
            assert c["cart_total"] and c["cart_total"] > 0
            assert c["cart_lines"]
            assert c["supervised"] is True
            assert [e["event"] for e in c["events"]][:3] == [
                "queued",
                "building",
                "needs_review",
            ]


@pytest.mark.asyncio
async def test_gate_refuses_without_kill_switch_biometric_or_within_caps(db_session):
    async with _client() as client:
        cycle = await _bagged_cycle(client)
        cart = (await client.get(f"/api/v1/food/cycles/{cycle['id']}/carts")).json()[0]
        # kill switch off
        r = await client.post(
            f"/api/v1/food/carts/{cart['id']}/approve", json={"biometric": True}
        )
        assert r.status_code == 403 and "kill switch" in r.json()["detail"]
        await client.patch("/api/v1/food/settings", json={"ordering_enabled": True})
        # no biometric
        r = await client.post(
            f"/api/v1/food/carts/{cart['id']}/approve", json={"biometric": False}
        )
        assert r.status_code == 403 and "Face ID" in r.json()["detail"]
        # per-order cap
        await client.patch("/api/v1/food/settings", json={"per_order_cap": 1})
        r = await client.post(
            f"/api/v1/food/carts/{cart['id']}/approve", json={"biometric": True}
        )
        assert r.status_code == 403 and "per-order cap" in r.json()["detail"]
        await client.patch("/api/v1/food/settings", json={"per_order_cap": 180})
        r = await client.post(
            f"/api/v1/food/carts/{cart['id']}/approve", json={"biometric": True}
        )
        assert r.status_code == 200, r.text
        assert r.json()["token"] and r.json()["cart"]["status"] == "approved"


@pytest.mark.asyncio
async def test_approval_is_single_use_bound_and_expiring(db_session):
    async with _client() as client:
        cycle = await _bagged_cycle(client)
        cart = (await client.get(f"/api/v1/food/cycles/{cycle['id']}/carts")).json()[0]
        await client.patch("/api/v1/food/settings", json={"ordering_enabled": True})
        token = (
            await client.post(
                f"/api/v1/food/carts/{cart['id']}/approve", json={"biometric": True}
            )
        ).json()["token"]
        # wrong token
        r = await client.post(
            f"/api/v1/food/carts/{cart['id']}/place", json={"token": "nope"}
        )
        assert r.status_code == 403 and "does not match" in r.json()["detail"]
        # expired token
        a = db_session.query(OrderApproval).filter(OrderApproval.token == token).first()
        a.expires_at = datetime.datetime.now(datetime.UTC).replace(
            tzinfo=None
        ) - datetime.timedelta(minutes=1)
        db_session.commit()
        r = await client.post(
            f"/api/v1/food/carts/{cart['id']}/place", json={"token": token}
        )
        assert r.status_code == 403 and "expired" in r.json()["detail"]
        # re-approve: old token revoked, new one works, supervised → awaiting_human
        db_session.expire_all()
        t = db_session.get(CartTask, cart["id"])
        t.status = "needs_review"
        db_session.commit()
        token2 = (
            await client.post(
                f"/api/v1/food/carts/{cart['id']}/approve", json={"biometric": True}
            )
        ).json()["token"]
        db_session.expire_all()
        assert (
            db_session.query(OrderApproval)
            .filter(OrderApproval.token == token)
            .first()
            .revoked
            is True
        )
        placed = (
            await client.post(
                f"/api/v1/food/carts/{cart['id']}/place", json={"token": token2}
            )
        ).json()
        assert placed["status"] == "awaiting_human"
        # token consumed: a second place is refused
        r = await client.post(
            f"/api/v1/food/carts/{cart['id']}/place", json={"token": token2}
        )
        assert r.status_code == 403


@pytest.mark.asyncio
async def test_total_drift_aborts_and_reopens_review(db_session):
    async with _client() as client:
        cycle = await _bagged_cycle(client)
        cart = (await client.get(f"/api/v1/food/cycles/{cycle['id']}/carts")).json()[0]
        await client.patch("/api/v1/food/settings", json={"ordering_enabled": True})
        token = (
            await client.post(
                f"/api/v1/food/carts/{cart['id']}/approve", json={"biometric": True}
            )
        ).json()["token"]
        t = db_session.get(CartTask, cart["id"])
        with pytest.raises(cart_service.GateError, match="moved"):
            cart_service.place_task(
                db_session, 1, t, token, store_adapters.DryRunAdapter(drift=25.0)
            )
        db_session.refresh(t)
        assert t.status == "needs_review"
        assert t.events[-1]["event"] == "total_drift"


@pytest.mark.asyncio
async def test_supervised_confirm_records_order_once_and_feeds_the_ledger(db_session):
    async with _client() as client:
        cycle = await _bagged_cycle(client)
        carts = (await client.get(f"/api/v1/food/cycles/{cycle['id']}/carts")).json()
        cart = carts[0]
        await client.patch("/api/v1/food/settings", json={"ordering_enabled": True})
        token = (
            await client.post(
                f"/api/v1/food/carts/{cart['id']}/approve", json={"biometric": True}
            )
        ).json()["token"]
        await client.post(
            f"/api/v1/food/carts/{cart['id']}/place", json={"token": token}
        )
        done = (
            await client.post(
                f"/api/v1/food/carts/{cart['id']}/confirm-placed",
                json={"merchant_order_id": "HM-1234"},
            )
        ).json()
        assert (
            done["status"] == "placed"
            and done["order"]["merchant_order_id"] == "HM-1234"
            and done["order"]["placed_by"] == "human"
        )
        # idempotent
        assert (
            await client.post(
                f"/api/v1/food/carts/{cart['id']}/confirm-placed", json={}
            )
        ).status_code == 403
        assert db_session.query(Order).count() == 1
        m = (
            db_session.query(MerchantAccount)
            .filter(MerchantAccount.store == cart["store"])
            .first()
        )
        assert m.orders_this_cycle == 1
        # one order per store per cycle: rebuilding the same store's cart cannot be approved again
        t = db_session.get(CartTask, cart["id"])
        t.status = "needs_review"
        db_session.commit()
        r = await client.post(
            f"/api/v1/food/carts/{cart['id']}/approve", json={"biometric": True}
        )
        assert r.status_code == 403 and "already" in r.json()["detail"]
        # ledger
        spend = (await client.get("/api/v1/food/spend")).json()
        assert spend["current"]["orders"] == 1
        assert spend["current"]["total"] == pytest.approx(done["order"]["total"])
        assert spend["current"]["per_meal"] and all(
            pm["cost"] > 0 for pm in spend["current"]["per_meal"]
        )
        assert spend["budget_per_cycle"] == 220.0
        orders = (await client.get("/api/v1/food/orders")).json()
        assert len(orders) == 1 and orders[0]["store"] == cart["store"]


@pytest.mark.asyncio
async def test_reject_reopens_bag_and_revokes_approvals(db_session):
    async with _client() as client:
        cycle = await _bagged_cycle(client)
        cart = (await client.get(f"/api/v1/food/cycles/{cycle['id']}/carts")).json()[0]
        await client.patch("/api/v1/food/settings", json={"ordering_enabled": True})
        token = (
            await client.post(
                f"/api/v1/food/carts/{cart['id']}/approve", json={"biometric": True}
            )
        ).json()["token"]
        rej = (
            await client.post(
                f"/api/v1/food/carts/{cart['id']}/reject", json={"reason": "wrong rice"}
            )
        ).json()
        assert (
            rej["status"] == "rejected" and rej["events"][-1]["detail"] == "wrong rice"
        )
        assert (
            db_session.query(OrderApproval)
            .filter(OrderApproval.token == token)
            .first()
            .revoked
            is True
        )
        r = await client.post(
            f"/api/v1/food/carts/{cart['id']}/place", json={"token": token}
        )
        assert r.status_code == 403


# --- agent executor: the shopper session builds carts out of band -------------------


async def _shopper_cycle(client, monkeypatch):
    monkeypatch.setenv("FOOD_EXECUTOR", "agent")
    cycle = await _bagged_cycle(client)
    carts = (await client.get(f"/api/v1/food/cycles/{cycle['id']}/carts")).json()
    return cycle, carts[0]


def _build(db_session, task_id, total=42.5):
    task = cart_service.next_shopper_task(db_session)
    assert task.id == task_id and task.status == "building"
    cart_service.report_cart(
        db_session,
        task,
        [{"name": "eggs", "product": "Large Eggs 12ct", "qty": 1, "line_total": total}],
        total,
        None,
    )
    return task


@pytest.mark.asyncio
async def test_agent_mode_queues_carts_and_the_shopper_fills_them(
    db_session, monkeypatch
):
    async with _client() as client:
        _, cart = await _shopper_cycle(client, monkeypatch)
        assert cart["status"] == "queued"
        # the phone's "Build this cart" leaves it for the shopper instead of building inline
        r = await client.post(f"/api/v1/food/carts/{cart['id']}/run")
        assert r.json()["status"] == "queued"

        task = _build(db_session, cart["id"])
        assert task.status == "needs_review" and task.cart_total == 42.5
        # a report for a cart that isn't being built is refused
        with pytest.raises(cart_service.GateError, match="not being built"):
            cart_service.report_cart(
                db_session, task, [{"name": "x", "line_total": 1}], 1, None
            )


@pytest.mark.asyncio
async def test_agent_mode_failed_build_requeues_from_the_phone(db_session, monkeypatch):
    async with _client() as client:
        _, cart = await _shopper_cycle(client, monkeypatch)
        task = cart_service.next_shopper_task(db_session)
        cart_service.report_failure(db_session, task, "hmart: signed out")
        assert task.status == "failed" and task.error == "hmart: signed out"
        r = await client.post(f"/api/v1/food/carts/{cart['id']}/run")
        assert r.json()["status"] == "queued"


@pytest.mark.asyncio
async def test_agent_mode_place_hands_off_then_parks_for_the_human(
    db_session, monkeypatch
):
    async with _client() as client:
        _, cart = await _shopper_cycle(client, monkeypatch)
        _build(db_session, cart["id"])
        await client.patch("/api/v1/food/settings", json={"ordering_enabled": True})
        token = (
            await client.post(
                f"/api/v1/food/carts/{cart['id']}/approve", json={"biometric": True}
            )
        ).json()["token"]
        placed = (
            await client.post(
                f"/api/v1/food/carts/{cart['id']}/place", json={"token": token}
            )
        ).json()
        assert placed["status"] == "placing"
        # the token is spent at hand-off
        r = await client.post(
            f"/api/v1/food/carts/{cart['id']}/place", json={"token": token}
        )
        assert r.status_code == 403

        db_session.expire_all()
        task = cart_service.next_shopper_task(db_session)
        assert task.id == cart["id"] and task.status == "placing"
        cart_service.report_checkout(db_session, 1, task, 42.5)
        assert task.status == "awaiting_human"
        nxt = cart_service.next_shopper_task(db_session)
        assert nxt is None or nxt.id != cart["id"]

        done = (
            await client.post(
                f"/api/v1/food/carts/{cart['id']}/confirm-placed", json={}
            )
        ).json()
        assert done["status"] == "placed" and done["order"]["placed_by"] == "human"


@pytest.mark.asyncio
async def test_agent_mode_checkout_drift_and_stale_approval_reopen_review(
    db_session, monkeypatch
):
    async with _client() as client:
        _, cart = await _shopper_cycle(client, monkeypatch)
        _build(db_session, cart["id"])
        await client.patch("/api/v1/food/settings", json={"ordering_enabled": True})

        async def approve_and_place():
            token = (
                await client.post(
                    f"/api/v1/food/carts/{cart['id']}/approve", json={"biometric": True}
                )
            ).json()["token"]
            await client.post(
                f"/api/v1/food/carts/{cart['id']}/place", json={"token": token}
            )
            db_session.expire_all()
            return db_session.get(CartTask, cart["id"])

        task = await approve_and_place()
        with pytest.raises(cart_service.GateError, match="moved"):
            cart_service.report_checkout(db_session, 1, task, 60.0)
        assert task.status == "needs_review" and task.cart_total == 60.0

        task = await approve_and_place()
        a = db_session.query(OrderApproval).order_by(OrderApproval.id.desc()).first()
        a.used_at = a.used_at - datetime.timedelta(hours=2)
        db_session.commit()
        with pytest.raises(cart_service.GateError, match="stale"):
            cart_service.report_checkout(db_session, 1, task, 60.0)
        assert task.status == "needs_review"
        assert task.events[-1]["event"] == "gate_refused"
