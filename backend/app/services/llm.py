"""Claude LLM Client — Anthropic SDK with tool_use structured outputs.

Replaces the legacy call_clawdbot() OpenAI-compat wrapper with proper
Anthropic SDK patterns: tool_use for structured outputs, model selection,
retry logic, and token tracking.
"""

import asyncio
import logging
import os
from typing import Any, Optional

import anthropic

logger = logging.getLogger(__name__)

# Model tiers — use the right model for the task complexity
HAIKU = "claude-haiku-4-5-20251001"
SONNET = "claude-sonnet-4-20250514"
OPUS = "claude-opus-4-6"

# Module-level singleton — reuses connection pool across all calls.
_client: Optional[anthropic.AsyncAnthropic] = None


def get_client() -> anthropic.AsyncAnthropic:
    """Get or create the singleton Anthropic client."""
    global _client
    if _client is None:
        api_key = os.getenv("ANTHROPIC_API_KEY")
        if not api_key:
            raise RuntimeError("Missing ANTHROPIC_API_KEY env var")
        _client = anthropic.AsyncAnthropic(api_key=api_key)
    return _client


async def structured_output(
    *,
    system: str,
    user_prompt: str,
    tool_name: str,
    tool_description: str,
    output_schema: dict[str, Any],
    model: str = SONNET,
    temperature: float = 0.3,
    max_tokens: int = 4096,
    max_retries: int = 2,
) -> dict[str, Any]:
    """Call Claude and get structured output via tool_use.

    Uses the tool_use pattern with tool_choice to guarantee structured JSON
    output that conforms to the schema. No more JSON-in-prompt + fence stripping.

    Args:
        system: System prompt.
        user_prompt: User message content.
        tool_name: Name for the output tool (e.g. "submit_evaluation").
        tool_description: What the tool does (helps Claude understand the schema).
        output_schema: JSON Schema for the structured output.
        model: Which Claude model to use.
        temperature: Sampling temperature.
        max_tokens: Maximum response tokens.
        max_retries: Number of retries on transient errors.

    Returns:
        The structured output dict matching the schema.
    """
    client = get_client()

    tool = {
        "name": tool_name,
        "description": tool_description,
        "input_schema": output_schema,
    }

    last_error = None
    for attempt in range(max_retries + 1):
        try:
            response = await client.messages.create(
                model=model,
                max_tokens=max_tokens,
                temperature=temperature,
                system=system,
                messages=[{"role": "user", "content": user_prompt}],
                tools=[tool],
                tool_choice={"type": "tool", "name": tool_name},
            )

            # Extract the tool use block
            for block in response.content:
                if block.type == "tool_use":
                    _log_usage(response, model, tool_name)
                    return block.input

            raise ValueError("No tool_use block in response")

        except anthropic.RateLimitError as e:
            last_error = e
            if attempt < max_retries:
                wait = 2 ** (attempt + 1)
                logger.warning("Rate limited (attempt %d), retrying in %ds", attempt + 1, wait)
                await asyncio.sleep(wait)
            continue
        except anthropic.APIStatusError as e:
            if e.status_code >= 500 and attempt < max_retries:
                last_error = e
                wait = 2 ** (attempt + 1)
                logger.warning("API error %d (attempt %d), retrying in %ds", e.status_code, attempt + 1, wait)
                await asyncio.sleep(wait)
                continue
            raise

    raise RuntimeError(f"Failed after {max_retries + 1} attempts: {last_error}")


async def generate_text(
    *,
    system: str,
    user_prompt: str,
    model: str = SONNET,
    temperature: float = 0.3,
    max_tokens: int = 4096,
    max_retries: int = 2,
) -> str:
    """Call Claude and get a free-text response.

    Use this for responses where structured output isn't needed
    (e.g. post-run coaching feedback, conversational responses).

    Args:
        system: System prompt.
        user_prompt: User message content.
        model: Which Claude model to use.
        temperature: Sampling temperature.
        max_tokens: Maximum response tokens.
        max_retries: Number of retries on transient errors.

    Returns:
        The text response string.
    """
    client = get_client()

    last_error = None
    for attempt in range(max_retries + 1):
        try:
            response = await client.messages.create(
                model=model,
                max_tokens=max_tokens,
                temperature=temperature,
                system=system,
                messages=[{"role": "user", "content": user_prompt}],
            )

            _log_usage(response, model, "text")
            return response.content[0].text

        except anthropic.RateLimitError as e:
            last_error = e
            if attempt < max_retries:
                wait = 2 ** (attempt + 1)
                logger.warning("Rate limited (attempt %d), retrying in %ds", attempt + 1, wait)
                await asyncio.sleep(wait)
            continue
        except anthropic.APIStatusError as e:
            if e.status_code >= 500 and attempt < max_retries:
                last_error = e
                wait = 2 ** (attempt + 1)
                logger.warning("API error %d (attempt %d), retrying in %ds", e.status_code, attempt + 1, wait)
                await asyncio.sleep(wait)
                continue
            raise

    raise RuntimeError(f"Failed after {max_retries + 1} attempts: {last_error}")


def _log_usage(response: anthropic.types.Message, model: str, call_type: str) -> None:
    """Log token usage for monitoring."""
    usage = response.usage
    logger.info(
        "LLM [%s] %s — input: %d, output: %d tokens",
        model.split("-")[1] if "-" in model else model,
        call_type,
        usage.input_tokens,
        usage.output_tokens,
    )
