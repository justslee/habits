"""Device registration endpoint tests."""

import pytest
from httpx import ASGITransport, AsyncClient

from app.main import app
from app.models.device import PushDevice

TOKEN = "ExponentPushToken[abcdefghijklmnopqrstuv]"


@pytest.mark.asyncio
async def test_register_device_is_idempotent(db_session):
    async with AsyncClient(
        transport=ASGITransport(app=app), base_url="http://test"
    ) as client:
        first = await client.post(
            "/api/v1/devices",
            json={
                "expo_push_token": TOKEN,
                "platform": "ios",
                "app_version": "1.0.0",
                "build_number": "16",
            },
        )
        assert first.status_code == 200, first.text
        second = await client.post(
            "/api/v1/devices",
            json={
                "expo_push_token": TOKEN,
                "platform": "ios",
                "app_version": "1.0.1",
                "build_number": "17",
            },
        )
        assert second.status_code == 200
        assert second.json()["id"] == first.json()["id"]
        assert second.json()["build_number"] == "17"

        listed = await client.get("/api/v1/devices")
        assert listed.status_code == 200
        assert len(listed.json()) == 1

    assert db_session.query(PushDevice).count() == 1


@pytest.mark.asyncio
async def test_register_device_rejects_short_token(db_session):
    async with AsyncClient(
        transport=ASGITransport(app=app), base_url="http://test"
    ) as client:
        resp = await client.post("/api/v1/devices", json={"expo_push_token": "short"})
    assert resp.status_code == 422


@pytest.mark.asyncio
async def test_delete_device(db_session):
    async with AsyncClient(
        transport=ASGITransport(app=app), base_url="http://test"
    ) as client:
        created = await client.post("/api/v1/devices", json={"expo_push_token": TOKEN})
        device_id = created.json()["id"]
        deleted = await client.delete(f"/api/v1/devices/{device_id}")
        assert deleted.status_code == 200
        assert (await client.get("/api/v1/devices")).json() == []
        assert (await client.delete(f"/api/v1/devices/{device_id}")).status_code == 404
