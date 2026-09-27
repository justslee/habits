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


# --- agent executor: the shopper fills carts, the owner checks out in the store's app -----


async def _shopper_cycle(client, monkeypatch):
    monkeypatch.setenv("FOOD_EXECUTOR", "agent")
    cycle = await _bagged_cycle(client)
    carts = (await client.get(f"/api/v1/food/cycles/{cycle['id']}/carts")).json()
    return cycle, carts[0]


def _request(db_session, task_id):
    """The phone's "Build this cart"."""
    task = db_session.get(CartTask, task_id)
    cart_service.run_task(db_session, task, store_adapters.ShopperAdapter())
    return task


def _fill(
    db_session, task_id, total=42.5, cart_url="https://www.hmart.com/checkout/cart/"
):
    _request(db_session, task_id)
    task = cart_service.next_shopper_task(db_session)
    assert task.id == task_id and task.status == "building"
    cart_service.report_cart(
        db_session,
        task,
        [{"name": "eggs", "product": "Large Eggs 12ct", "qty": 1, "line_total": total}],
        total,
        None,
        cart_url,
    )
    return task


@pytest.mark.asyncio
async def test_agent_mode_fills_only_the_carts_the_owner_asked_for(
    db_session, monkeypatch
):
    async with _client() as client:
        cycle = await _bagged_cycle(
            client, slugs=("dak-galbi", "galbi-tang", "salmon-teriyaki", "oyakodon")
        )
        monkeypatch.setenv("FOOD_EXECUTOR", "agent")
        carts = (await client.get(f"/api/v1/food/cycles/{cycle['id']}/carts")).json()
        assert len(carts) >= 2, "needs more than one store to prove the point"
        assert all(c["status"] == "queued" and not c["requested"] for c in carts)
        assert cart_service.next_shopper_task(db_session) is None

        chosen = carts[-1]
        r = await client.post(f"/api/v1/food/carts/{chosen['id']}/run")
        assert r.json()["requested"] is True
        task = cart_service.next_shopper_task(db_session)
        assert task.id == chosen["id"] and task.status == "building"
        assert cart_service.next_shopper_task(db_session).id == chosen["id"]  # resumes
        others = [db_session.get(CartTask, c["id"]) for c in carts[:-1]]
        assert all(t.status == "queued" and t.requested_at is None for t in others)


@pytest.mark.asyncio
async def test_agent_mode_queues_carts_and_the_shopper_fills_them(
    db_session, monkeypatch
):
    async with _client() as client:
        _, cart = await _shopper_cycle(client, monkeypatch)
        assert cart["status"] == "queued" and cart["checkout_via"] == "store_app"
        # the phone's "Build this cart" leaves it for the shopper instead of building inline
        r = await client.post(f"/api/v1/food/carts/{cart['id']}/run")
        assert r.json()["status"] == "queued"

        task = _fill(
            db_session,
            cart["id"],
            cart_url="https://www.doordash.com/store/wegmans-123/",
        )
        assert task.status == "needs_review" and task.cart_total == 42.5
        out = (await client.get(f"/api/v1/food/cycles/{task.cycle_id}/carts")).json()
        mine = next(c for c in out if c["id"] == cart["id"])
        assert mine["cart_url"] == "https://www.doordash.com/store/wegmans-123/"
        # a report for a cart that isn't being built is refused
        with pytest.raises(cart_service.GateError, match="not being built"):
            cart_service.report_cart(
                db_session, task, [{"name": "x", "line_total": 1}], 1, None, None
            )


@pytest.mark.asyncio
async def test_agent_mode_cart_url_must_be_the_store_page(db_session, monkeypatch):
    async with _client() as client:
        _, cart = await _shopper_cycle(client, monkeypatch)
        _request(db_session, cart["id"])
        task = cart_service.next_shopper_task(db_session)
        with pytest.raises(cart_service.GateError, match="https"):
            cart_service.report_cart(
                db_session,
                task,
                [{"name": "eggs", "line_total": 4}],
                4,
                None,
                "javascript:alert(1)",
            )
        assert task.status == "building"


@pytest.mark.asyncio
async def test_agent_mode_failed_build_requeues_from_the_phone(db_session, monkeypatch):
    async with _client() as client:
        _, cart = await _shopper_cycle(client, monkeypatch)
        _request(db_session, cart["id"])
        task = cart_service.next_shopper_task(db_session)
        cart_service.report_failure(db_session, task, "hmart: signed out")
        assert task.status == "failed" and task.error == "hmart: signed out"
        r = await client.post(f"/api/v1/food/carts/{cart['id']}/run")
        assert r.json()["status"] == "queued"


@pytest.mark.asyncio
async def test_agent_mode_never_places_orders(db_session, monkeypatch):
    async with _client() as client:
        _, cart = await _shopper_cycle(client, monkeypatch)
        _fill(db_session, cart["id"])
        await client.patch("/api/v1/food/settings", json={"ordering_enabled": True})
        r = await client.post(
            f"/api/v1/food/carts/{cart['id']}/approve", json={"biometric": True}
        )
        assert r.status_code == 403 and "store's app" in r.json()["detail"]
        r = await client.post(
            f"/api/v1/food/carts/{cart['id']}/place", json={"token": "x"}
        )
        assert r.status_code == 403 and "store's app" in r.json()["detail"]
        assert db_session.query(OrderApproval).count() == 0
        assert db_session.query(Order).count() == 0


@pytest.mark.asyncio
async def test_agent_mode_owner_confirms_a_store_app_order(db_session, monkeypatch):
    async with _client() as client:
        cycle, cart = await _shopper_cycle(client, monkeypatch)
        # nothing to confirm before the shopper has filled the cart
        r = await client.post(
            f"/api/v1/food/carts/{cart['id']}/confirm-placed", json={}
        )
        assert r.status_code == 403

        _fill(db_session, cart["id"], total=42.5)
        done = (
            await client.post(
                f"/api/v1/food/carts/{cart['id']}/confirm-placed",
                json={"total": 57.3, "merchant_order_id": "DD-9"},
            )
        ).json()
        assert done["status"] == "placed"
        assert done["order"]["total"] == 57.3 and done["order"]["placed_by"] == "human"
        # once only
        r = await client.post(
            f"/api/v1/food/carts/{cart['id']}/confirm-placed", json={}
        )
        assert r.status_code == 403
        assert db_session.query(Order).count() == 1
        # the placed cart stays in the cycle's list, so the receipt can show it
        listed = (await client.get(f"/api/v1/food/cycles/{cycle['id']}/carts")).json()
        assert any(c["id"] == cart["id"] and c["status"] == "placed" for c in listed)


# --- Shopify stores (H Mart Manhattan): the owner gets a link that rebuilds the cart -----

CART_JS = {
    "items": [
        {
            "variant_id": 43867569389793,
            "quantity": 2,
            "title": "CJ Gochujang 1.1lb",
            "product_title": "CJ Gochujang",
            "final_line_price": 1298,
        },
        {
            "variant_id": 43865231196385,
            "quantity": 1,
            "title": "Beef Short Rib 2lb",
            "product_title": "Beef Short Rib",
            "final_line_price": 2798,
        },
    ],
    "total_price": 4096,
}


def test_shopify_cart_turns_cart_js_into_lines_total_and_a_permalink():
    lines, total, url = store_adapters.shopify_cart(
        "hmart", CART_JS, ["perilla leaves"]
    )
    assert total == 40.96
    assert url == "https://hmartdelivery.com/cart/43867569389793:2,43865231196385:1"
    assert lines[0] == {
        "name": "CJ Gochujang",
        "product": "CJ Gochujang 1.1lb",
        "qty": 2,
        "unit_price": 6.49,
        "line_total": 12.98,
        "variant_id": 43867569389793,
    }
    assert lines[-1] == {"name": "(skipped) perilla leaves", "qty": 0, "line_total": 0}


def test_shopify_cart_refuses_what_it_cannot_link():
    with pytest.raises(ValueError, match="isn't a Shopify store"):
        store_adapters.shopify_cart("wf", CART_JS)
    with pytest.raises(ValueError, match="empty"):
        store_adapters.shopify_cart("hmart", {"items": [], "total_price": 0})
    with pytest.raises(ValueError, match="variant_id"):
        store_adapters.shopify_cart(
            "hmart",
            {"items": [{"quantity": 1, "final_line_price": 100}], "total_price": 100},
        )
    with pytest.raises(ValueError, match="Bad cart item"):
        store_adapters.shopify_cart(
            "hmart",
            {
                "items": [{"variant_id": 5, "quantity": 0, "final_line_price": 0}],
                "total_price": 0,
            },
        )


@pytest.mark.asyncio
async def test_hmart_cart_hands_the_owner_the_permalink(db_session, monkeypatch):
    async with _client() as client:
        cycle, _ = await _shopper_cycle(client, monkeypatch)
        carts = (await client.get(f"/api/v1/food/cycles/{cycle['id']}/carts")).json()
        hmart = next((c for c in carts if c["store"] == "hmart"), None)
        if hmart is None:
            pytest.skip("this seed plan puts nothing at H Mart")
        _request(db_session, hmart["id"])
        task = cart_service.next_shopper_task(db_session)
        assert task.id == hmart["id"]
        lines, total, url = store_adapters.shopify_cart("hmart", CART_JS)
        cart_service.report_cart(db_session, task, lines, total, None, url)
        out = (await client.get(f"/api/v1/food/cycles/{cycle['id']}/carts")).json()
        mine = next(c for c in out if c["id"] == hmart["id"])
        assert mine["cart_url"].startswith(
            "https://hmartdelivery.com/cart/43867569389793:2"
        )
        assert mine["cart_total"] == 40.96


@pytest.mark.asyncio
async def test_hmart_defaults_to_the_manhattan_delivery_site(db_session):
    async with _client() as client:
        merchants = (await client.get("/api/v1/food/merchants")).json()
        hmart = next(m for m in merchants if m["store"] == "hmart")
        assert hmart["site_url"] == "https://hmartdelivery.com"
        assert hmart["minimum"] == 25.0 and hmart["delivery_fee"] == 5.0
