"""A browser's CORS preflight must be answered, not rejected by the API-key middleware."""

import pytest
from httpx import ASGITransport, AsyncClient

from app.main import app


@pytest.mark.asyncio
async def test_preflight_is_answered_without_a_key():
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        r = await client.options(
            "/api/v1/daily/summary",
            headers={
                "Origin": "http://localhost:8081",
                "Access-Control-Request-Method": "GET",
                "Access-Control-Request-Headers": "x-api-key",
            },
        )
        assert r.status_code == 200
        assert r.headers["access-control-allow-origin"] == "http://localhost:8081"
        assert "PATCH" in r.headers.get("access-control-allow-methods", "")
