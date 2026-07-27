"""Contract tests for the OpenAI Responses API client.

These exist because a real outage slipped through the whole suite: every other
test mocks `structured_output`, so nothing validated the payload we actually send.
The Responses API rejects `text.format: json_object` unless the word "json"
appears in `input` itself, and we only had it in `instructions` — so every
structured call 400'd in production while 200+ tests stayed green.

No network: httpx.AsyncClient.post is patched and the captured payload asserted.
"""

import json
from unittest.mock import AsyncMock, patch

import pytest

from app.services import llm


def _fake_response(body: dict, status: int = 200):
    """Minimal stand-in for an httpx.Response."""
    class R:
        status_code = status
        text = json.dumps(body)

        def json(self):
            return body

        def raise_for_status(self):
            if status >= 400:
                raise AssertionError(f"unexpected raise_for_status at {status}")

    return R()


def _ok_json_body(payload: dict) -> dict:
    """A Responses-API-shaped success carrying `payload` as the output text."""
    return {
        "output": [
            {"type": "reasoning"},  # reasoning items carry no text — must be skipped
            {"type": "message", "content": [{"type": "output_text", "text": json.dumps(payload)}]},
        ],
        "usage": {"input_tokens": 10, "output_tokens": 5},
    }


SCHEMA = {
    "type": "object",
    "properties": {"pillar_id": {"type": "integer"}},
    "required": ["pillar_id"],
}


@pytest.mark.asyncio
async def test_structured_output_input_mentions_json(monkeypatch):
    """Regression: the Responses API 400s unless `input` itself contains "json"."""
    monkeypatch.setenv("OPENAI_API_KEY", "test-key")
    captured = {}

    async def fake_post(self, url, headers=None, json=None, **kw):  # noqa: A002
        captured.update(json or {})
        return _fake_response(_ok_json_body({"pillar_id": 3}))

    with patch("httpx.AsyncClient.post", new=fake_post):
        out = await llm.structured_output(
            system="You classify tasks.",
            user_prompt="Task: study vol surfaces",
            tool_name="submit_classification",
            tool_description="Submit the classification.",
            output_schema=SCHEMA,
        )

    assert out == {"pillar_id": 3}
    # The actual contract that broke production:
    assert "json" in captured["input"].lower(), (
        "Responses API requires the word 'json' in `input` when using "
        "text.format=json_object; putting it only in `instructions` returns 400"
    )
    assert captured["text"]["format"]["type"] == "json_object"
    # The caller's prompt must still be intact.
    assert "study vol surfaces" in captured["input"]


@pytest.mark.asyncio
async def test_structured_output_sends_no_temperature(monkeypatch):
    """GPT-5 reasoning models reject `temperature`; we accept it but must not send it."""
    monkeypatch.setenv("OPENAI_API_KEY", "test-key")
    captured = {}

    async def fake_post(self, url, headers=None, json=None, **kw):  # noqa: A002
        captured.update(json or {})
        return _fake_response(_ok_json_body({"pillar_id": 1}))

    with patch("httpx.AsyncClient.post", new=fake_post):
        await llm.structured_output(
            system="s", user_prompt="p", tool_name="t",
            tool_description="d", output_schema=SCHEMA, temperature=0.9,
        )

    assert "temperature" not in captured
    assert captured["model"] == llm.REASONING
    assert "effort" in captured["reasoning"]


@pytest.mark.asyncio
async def test_generate_text_extracts_message_and_skips_reasoning(monkeypatch):
    """Free-text path sends no text.format and ignores reasoning items."""
    monkeypatch.setenv("OPENAI_API_KEY", "test-key")
    captured = {}
    body = {
        "output": [
            {"type": "reasoning"},
            {"type": "message", "content": [{"type": "output_text", "text": "Nice work."}]},
        ],
        "usage": {},
    }

    async def fake_post(self, url, headers=None, json=None, **kw):  # noqa: A002
        captured.update(json or {})
        return _fake_response(body)

    with patch("httpx.AsyncClient.post", new=fake_post):
        text = await llm.generate_text(system="coach", user_prompt="how did I do?")

    assert text == "Nice work."
    assert "text" not in captured  # no json formatting on the free-text path


@pytest.mark.asyncio
async def test_fast_tier_uses_fast_model(monkeypatch):
    """High-volume calls must go to the cheap tier, not the reasoning tier."""
    monkeypatch.setenv("OPENAI_API_KEY", "test-key")
    captured = {}

    async def fake_post(self, url, headers=None, json=None, **kw):  # noqa: A002
        captured.update(json or {})
        return _fake_response(_ok_json_body({"pillar_id": 0}))

    with patch("httpx.AsyncClient.post", new=fake_post):
        await llm.structured_output(
            system="s", user_prompt="p", tool_name="t",
            tool_description="d", output_schema=SCHEMA, model=llm.FAST,
        )

    assert captured["model"] == llm.FAST
    assert llm.FAST != llm.REASONING


@pytest.mark.asyncio
async def test_missing_api_key_raises(monkeypatch):
    monkeypatch.delenv("OPENAI_API_KEY", raising=False)
    with pytest.raises(RuntimeError, match="OPENAI_API_KEY"):
        await llm.generate_text(system="s", user_prompt="p")
