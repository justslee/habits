"""Live coach: context is built from the program; the token endpoint fails closed without a key."""

import pytest
from httpx import ASGITransport, AsyncClient

from app.main import app


@pytest.mark.asyncio
async def test_coach_context_and_token_without_key(db_session, monkeypatch):
    monkeypatch.delenv("OPENAI_API_KEY", raising=False)
    async with AsyncClient(
        transport=ASGITransport(app=app), base_url="http://test"
    ) as client:
        ctx = (await client.get("/api/v1/coach/context")).json()["context"]
        assert (
            "Golf Performance" in ctx
            and "NO medicine-ball" in ctx
            and "THIS WEEK" in ctx
        )
        r = await client.post("/api/v1/coach/realtime/session")
        assert r.status_code == 503
        # GPT-Live has no ephemeral secret, so the Mac exchanges the handshake itself and
        # must refuse just as firmly when it has no key to do it with.
        live = await client.post("/api/v1/coach/live/session", json={"sdp": "v=0"})
        assert live.status_code == 503


@pytest.mark.asyncio
async def test_live_session_requires_an_offer(db_session, monkeypatch):
    """An empty offer is rejected here rather than spending a round trip to OpenAI."""
    monkeypatch.setenv("OPENAI_API_KEY", "test-key")
    async with AsyncClient(
        transport=ASGITransport(app=app), base_url="http://test"
    ) as client:
        r = await client.post("/api/v1/coach/live/session", json={"sdp": "   "})
        assert r.status_code == 400
        assert (
            await client.post("/api/v1/coach/live/session", json={})
        ).status_code == 422


@pytest.mark.asyncio
async def test_coach_chat_uses_program_context(db_session, monkeypatch):
    seen = {}

    async def fake_structured_output(*, system, user_prompt, **kw):
        seen["system"] = system
        seen["prompt"] = user_prompt
        return {
            "reply": "Trap bar at the bottom of the range, two reps left.",
            "adjustment": None,
        }

    monkeypatch.setattr("app.routers.coach.structured_output", fake_structured_output)
    async with AsyncClient(
        transport=ASGITransport(app=app), base_url="http://test"
    ) as client:
        r = await client.post(
            "/api/v1/coach/chat",
            json={
                "message": "what load today?",
                "history": [
                    {"from": "me", "text": "hi"},
                    {"from": "coach", "text": "hey"},
                ],
            },
        )
        assert r.status_code == 200
        assert "Trap bar" in r.json()["reply"]
        assert "PROGRAM: Golf Performance" in seen["prompt"]
        assert "ATHLETE: hi" in seen["prompt"]
        assert "medicine-ball" in seen["system"]
        assert (
            await client.post("/api/v1/coach/chat", json={"message": "  "})
        ).status_code == 422
