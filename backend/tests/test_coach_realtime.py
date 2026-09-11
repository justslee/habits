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


@pytest.mark.asyncio
async def test_coach_chat_uses_program_context(db_session, monkeypatch):
    seen = {}

    async def fake_generate_text(*, system, user_prompt, **kw):
        seen["system"] = system
        seen["prompt"] = user_prompt
        return "Trap bar at the bottom of the range, two reps left."

    monkeypatch.setattr("app.routers.coach.generate_text", fake_generate_text)
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
