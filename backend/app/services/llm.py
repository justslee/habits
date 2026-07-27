"""OpenAI LLM client — Responses API with JSON + free-text outputs.

Switched from the Anthropic SDK to OpenAI's Responses API (owner directive:
use the ChatGPT key stored in AWS + gpt-5.6-sol). Mirrors scorecard's raw-httpx
Bearer pattern (projects/scorecard app/caddie/strategy.py) — no SDK dependency,
`httpx` only.

Two model tiers:
  * REASONING (gpt-5.6-sol) — evaluation, coaching, workout/run generation, reviews.
  * FAST      (gpt-5.5, no extended thinking) — high-volume short calls (tag suggest, etc.).

The public surface (`structured_output`, `generate_text`, and the model-name
constants) is unchanged so existing call sites keep working: the Anthropic-era
names `SONNET`/`HAIKU` are retained as aliases onto the two tiers.

The API key comes from `OPENAI_API_KEY` (delivered via AWS Secrets Manager in
prod, plain env locally).
"""

import asyncio
import json
import logging
import os
from typing import Any, Optional

import httpx

logger = logging.getLogger(__name__)

OPENAI_RESPONSES_URL = "https://api.openai.com/v1/responses"

# --- Model tiers -----------------------------------------------------------
REASONING = os.getenv("HABITS_REASONING_MODEL", "gpt-5.6-sol")
FAST = os.getenv("HABITS_FAST_MODEL", "gpt-5.5")

# Back-compat aliases for existing call sites (were Anthropic model ids).
# HAIKU was the cheap/fast tier; SONNET was the quality tier.
HAIKU = FAST
SONNET = REASONING

_DEFAULT_TIMEOUT = 120.0


def _api_key() -> str:
    key = os.getenv("OPENAI_API_KEY")
    if not key:
        raise RuntimeError("Missing OPENAI_API_KEY env var")
    return key


def _reasoning_effort(model: str) -> str:
    """Reasoning effort per tier. The FAST tier runs with no extended thinking."""
    if model == FAST:
        return os.getenv("HABITS_FAST_REASONING_EFFORT", "none")
    return os.getenv("HABITS_REASONING_EFFORT", "low")


def _extract_output_text(body: dict[str, Any]) -> str:
    """Concatenate output_text across message items (reasoning items are skipped)."""
    parts: list[str] = []
    for item in body.get("output", []) or []:
        if item.get("type") != "message":
            continue
        for c in item.get("content", []) or []:
            if c.get("type") == "output_text":
                parts.append(c.get("text") or "")
    return "".join(parts).strip()


def _log_usage(body: dict[str, Any], model: str, call_type: str) -> None:
    usage = body.get("usage") or {}
    logger.info(
        "LLM [%s] %s — input: %s, output: %s tokens",
        model,
        call_type,
        usage.get("input_tokens"),
        usage.get("output_tokens"),
    )


async def _post(payload: dict[str, Any], *, max_retries: int, timeout: float) -> dict[str, Any]:
    """POST to the Responses API with retry/backoff on 429 / 5xx / transport errors."""
    headers = {"Authorization": f"Bearer {_api_key()}", "Content-Type": "application/json"}
    last_error: Optional[Exception] = None
    for attempt in range(max_retries + 1):
        try:
            async with httpx.AsyncClient(timeout=timeout) as client:
                resp = await client.post(OPENAI_RESPONSES_URL, headers=headers, json=payload)
            if resp.status_code == 429 or resp.status_code >= 500:
                last_error = RuntimeError(f"OpenAI {resp.status_code}: {resp.text[:300]}")
                if attempt < max_retries:
                    wait = 2 ** (attempt + 1)
                    logger.warning("OpenAI %d (attempt %d), retrying in %ds", resp.status_code, attempt + 1, wait)
                    await asyncio.sleep(wait)
                    continue
                raise last_error
            resp.raise_for_status()
            return resp.json()
        except (httpx.TimeoutException, httpx.TransportError) as e:
            last_error = e
            if attempt < max_retries:
                wait = 2 ** (attempt + 1)
                logger.warning("OpenAI transport error (attempt %d), retrying in %ds: %s", attempt + 1, wait, e)
                await asyncio.sleep(wait)
                continue
            raise
    raise RuntimeError(f"OpenAI request failed after {max_retries + 1} attempts: {last_error}")


async def structured_output(
    *,
    system: str,
    user_prompt: str,
    tool_name: str,
    tool_description: str,
    output_schema: dict[str, Any],
    model: str = REASONING,
    temperature: float = 0.3,
    max_tokens: int = 4096,
    max_retries: int = 2,
) -> dict[str, Any]:
    """Call the model and get structured JSON output conforming to `output_schema`.

    Uses the Responses API in JSON mode with the schema embedded in the
    instructions — JSON validity is guaranteed by the API; schema adherence is
    driven by the prompt (same contract the callers already relied on).

    `temperature` is accepted for signature compatibility but not sent —
    GPT-5-family reasoning models on the Responses API don't take it.
    """
    schema_hint = json.dumps(output_schema, indent=2)
    instructions = (
        f"{system}\n\n"
        f"# Output contract ({tool_description})\n"
        "Respond with a SINGLE JSON object and nothing else — no prose, no markdown "
        "fences. It must conform to this JSON schema:\n"
        f"{schema_hint}"
    )
    # The Responses API rejects `text.format: json_object` unless the word "json"
    # appears in `input` itself — having it only in `instructions` returns a 400
    # ("Response input messages must contain the word 'json' in some form").
    payload = {
        "model": model,
        "instructions": instructions,
        "input": f"{user_prompt}\n\nRespond with a single valid JSON object.",
        "max_output_tokens": max_tokens,
        "reasoning": {"effort": _reasoning_effort(model)},
        "text": {"format": {"type": "json_object"}},
    }

    last_error: Optional[Exception] = None
    for attempt in range(max_retries + 1):
        body = await _post(payload, max_retries=max_retries, timeout=_DEFAULT_TIMEOUT)
        _log_usage(body, model, tool_name)
        text = _extract_output_text(body)
        try:
            return json.loads(text)
        except (json.JSONDecodeError, TypeError) as e:
            last_error = e
            logger.warning("structured_output non-JSON reply (attempt %d): %.200s", attempt + 1, text)
            if attempt < max_retries:
                await asyncio.sleep(1)
                continue
    raise RuntimeError(f"structured_output could not parse JSON after {max_retries + 1} attempts: {last_error}")


async def generate_text(
    *,
    system: str,
    user_prompt: str,
    model: str = REASONING,
    temperature: float = 0.3,
    max_tokens: int = 4096,
    max_retries: int = 2,
) -> str:
    """Call the model and get a free-text response (e.g. coaching feedback).

    `temperature` is accepted for signature compatibility but not sent —
    GPT-5-family reasoning models on the Responses API don't take it.
    """
    payload = {
        "model": model,
        "instructions": system,
        "input": user_prompt,
        "max_output_tokens": max_tokens,
        "reasoning": {"effort": _reasoning_effort(model)},
    }
    body = await _post(payload, max_retries=max_retries, timeout=_DEFAULT_TIMEOUT)
    _log_usage(body, model, "text")
    return _extract_output_text(body)
