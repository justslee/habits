"""Notion Knowledge Base integration for concept seeding (P5-2 enhancement).

Fetches the user's Knowledge Base entries from Notion to understand what topics
they've already studied, their confidence levels, and gaps to fill.

Uses the Notion internal API via the Notion MCP pattern — but server-side we
hit the Notion API directly with an integration token.
"""

from __future__ import annotations

import logging
import os
from dataclasses import dataclass, field
from typing import Any

import httpx

logger = logging.getLogger(__name__)

NOTION_API_BASE = "https://api.notion.com/v1"
NOTION_VERSION = "2022-06-28"

# Set NOTION_TOKEN in environment — this is a Notion internal integration token
# Create one at https://www.notion.so/my-integrations
NOTION_TOKEN = os.getenv("NOTION_TOKEN")

# The Knowledge Base database ID (from your Notion workspace)
KNOWLEDGE_BASE_DB_ID = os.getenv(
    "NOTION_KB_DATABASE_ID",
    "2f21c525-92e0-803d-8edd-d7627a5e2c0f",  # default from your workspace
)

# Domain → Pillar mapping (maps Notion KB domains to app pillar IDs)
DOMAIN_TO_PILLAR: dict[str, list[int]] = {
    "Quantitative Finance": [1],
    "Trading Math": [1],
    "Market Microstructure": [1],
    "Risk Management": [1],
    "Low-Latency Systems": [1],
    "Finance": [1, 2],
    "Japanese Monetary Policy": [2],
    "Semiconductor Supply Chain": [2],
    "AI Agent Development": [4],
    "Data Engineering": [4],
    "Advanced Python": [4],
}


@dataclass
class KBEntry:
    """A single Knowledge Base entry from Notion."""
    title: str
    domain: str | None = None
    confidence: str | None = None  # Low, Medium, High, Completed
    explanation: str | None = None
    questions: str | None = None
    times_reviewed: int = 0
    last_reviewed: str | None = None
    next_review: str | None = None


@dataclass
class KBSummary:
    """Aggregated summary of Knowledge Base entries for a pillar."""
    pillar_id: int
    pillar_name: str
    total_entries: int = 0
    entries: list[KBEntry] = field(default_factory=list)
    domains_covered: set[str] = field(default_factory=set)

    # Grouped by confidence
    completed: list[str] = field(default_factory=list)
    high_confidence: list[str] = field(default_factory=list)
    medium_confidence: list[str] = field(default_factory=list)
    low_confidence: list[str] = field(default_factory=list)
    no_confidence: list[str] = field(default_factory=list)

    def to_context_block(self) -> str:
        """Convert to a text block suitable for LLM context injection."""
        parts = [f"## Notion Knowledge Base — Topics Already Studied ({self.pillar_name})"]
        parts.append(f"Total entries reviewed: {self.total_entries}")
        parts.append(f"Domains covered: {', '.join(self.domains_covered) if self.domains_covered else 'None'}")

        if self.completed:
            parts.append(f"\n### Mastered / Completed ({len(self.completed)} topics):")
            for t in self.completed:
                parts.append(f"  ✓ {t}")

        if self.high_confidence:
            parts.append(f"\n### High Confidence ({len(self.high_confidence)} topics):")
            for t in self.high_confidence:
                parts.append(f"  ● {t}")

        if self.medium_confidence:
            parts.append(f"\n### Medium Confidence — needs reinforcement ({len(self.medium_confidence)} topics):")
            for t in self.medium_confidence:
                parts.append(f"  ◐ {t}")

        if self.low_confidence:
            parts.append(f"\n### Low Confidence — needs deep review ({len(self.low_confidence)} topics):")
            for t in self.low_confidence:
                parts.append(f"  ○ {t}")

        if self.no_confidence:
            parts.append(f"\n### Not Yet Assessed ({len(self.no_confidence)} topics):")
            for t in self.no_confidence:
                parts.append(f"  ? {t}")

        # Include detailed explanations for context
        entries_with_explanations = [e for e in self.entries if e.explanation]
        if entries_with_explanations:
            parts.append("\n### Detailed Notes (from user's own study):")
            for e in entries_with_explanations[:20]:  # Cap at 20 to avoid token bloat
                parts.append(f"\n**{e.title}** [{e.confidence or 'unrated'}]:")
                # Truncate long explanations
                expl = e.explanation[:500] + "..." if len(e.explanation) > 500 else e.explanation
                parts.append(f"  {expl}")

        parts.append(
            "\n**IMPORTANT**: Use this Knowledge Base to calibrate the concept tree. "
            "Topics the user has already mastered (High/Completed) should be marked at "
            "lower tiers or noted as 'already familiar'. Topics with Low confidence "
            "should be prioritized. Identify GAPS — important topics NOT in the KB that "
            "the user hasn't studied yet."
        )

        return "\n".join(parts)


def _extract_rich_text(prop: dict[str, Any]) -> str | None:
    """Extract plain text from a Notion rich_text property."""
    if not prop:
        return None
    rich_text = prop.get("rich_text", [])
    if not rich_text:
        return None
    return "".join(block.get("plain_text", "") for block in rich_text)


def _extract_title(prop: dict[str, Any]) -> str:
    """Extract plain text from a Notion title property."""
    if not prop:
        return "Untitled"
    title_arr = prop.get("title", [])
    if not title_arr:
        return "Untitled"
    return "".join(block.get("plain_text", "") for block in title_arr)


def _extract_select(prop: dict[str, Any]) -> str | None:
    """Extract value from a Notion select property."""
    if not prop:
        return None
    select = prop.get("select")
    if not select:
        return None
    return select.get("name")


def _extract_number(prop: dict[str, Any]) -> int:
    """Extract value from a Notion number property."""
    if not prop:
        return 0
    return int(prop.get("number") or 0)


def _extract_date(prop: dict[str, Any]) -> str | None:
    """Extract start date from a Notion date property."""
    if not prop:
        return None
    date = prop.get("date")
    if not date:
        return None
    return date.get("start")


def _parse_page_to_entry(page: dict[str, Any]) -> KBEntry:
    """Parse a Notion page object into a KBEntry."""
    props = page.get("properties", {})
    return KBEntry(
        title=_extract_title(props.get("Title", {})),
        domain=_extract_select(props.get("Domain", {})),
        confidence=_extract_select(props.get("Confidence", {})),
        explanation=_extract_rich_text(props.get("Explanation", {})),
        questions=_extract_rich_text(props.get("Questions", {})),
        times_reviewed=_extract_number(props.get("Times Reviewed", {})),
        last_reviewed=_extract_date(props.get("Last Reviewed", {})),
        next_review=_extract_date(props.get("Next Review", {})),
    )


async def fetch_kb_entries(
    database_id: str | None = None,
    domain_filter: str | None = None,
) -> list[KBEntry]:
    """Fetch all Knowledge Base entries from Notion.

    Args:
        database_id: Override the default KB database ID.
        domain_filter: Optional domain name to filter by.

    Returns:
        List of KBEntry objects.
    """
    token = NOTION_TOKEN
    if not token:
        logger.warning("NOTION_TOKEN not set — skipping Notion KB fetch")
        return []

    db_id = database_id or KNOWLEDGE_BASE_DB_ID
    url = f"{NOTION_API_BASE}/databases/{db_id}/query"

    headers = {
        "Authorization": f"Bearer {token}",
        "Notion-Version": NOTION_VERSION,
        "Content-Type": "application/json",
    }

    # Build filter
    body: dict[str, Any] = {"page_size": 100}
    if domain_filter:
        body["filter"] = {
            "property": "Domain",
            "select": {"equals": domain_filter},
        }

    entries: list[KBEntry] = []

    async with httpx.AsyncClient(timeout=30.0) as client:
        has_more = True
        start_cursor = None

        while has_more:
            if start_cursor:
                body["start_cursor"] = start_cursor

            try:
                response = await client.post(url, json=body, headers=headers)
                response.raise_for_status()
                data = response.json()
            except httpx.HTTPStatusError as e:
                logger.error(f"Notion API error: {e.response.status_code} — {e.response.text}")
                break
            except Exception as e:
                logger.error(f"Notion fetch failed: {e}")
                break

            for page in data.get("results", []):
                entries.append(_parse_page_to_entry(page))

            has_more = data.get("has_more", False)
            start_cursor = data.get("next_cursor")

    logger.info(f"Fetched {len(entries)} KB entries from Notion (domain={domain_filter})")
    return entries


async def get_kb_summary_for_pillar(
    pillar_id: int,
    pillar_name: str,
) -> KBSummary:
    """Get a summarized view of KB entries relevant to a pillar.

    Fetches entries across all domains that map to this pillar,
    then aggregates by confidence level.

    Args:
        pillar_id: The pillar ID (1-5).
        pillar_name: The pillar display name.

    Returns:
        KBSummary with categorized entries.
    """
    summary = KBSummary(pillar_id=pillar_id, pillar_name=pillar_name)

    # Find which domains map to this pillar
    relevant_domains = [
        domain for domain, pids in DOMAIN_TO_PILLAR.items()
        if pillar_id in pids
    ]

    if not relevant_domains:
        # Fetch all entries and let the LLM figure out relevance
        logger.info(f"No domain mapping for pillar {pillar_id}, fetching all KB entries")
        all_entries = await fetch_kb_entries()
        summary.entries = all_entries
        summary.total_entries = len(all_entries)
    else:
        # Fetch entries for each relevant domain
        all_entries: list[KBEntry] = []
        for domain in relevant_domains:
            domain_entries = await fetch_kb_entries(domain_filter=domain)
            all_entries.extend(domain_entries)
            summary.domains_covered.add(domain)

        summary.entries = all_entries
        summary.total_entries = len(all_entries)

    # Categorize by confidence
    for entry in summary.entries:
        title = entry.title
        conf = entry.confidence

        if conf == "Completed":
            summary.completed.append(title)
        elif conf == "High":
            summary.high_confidence.append(title)
        elif conf == "Medium":
            summary.medium_confidence.append(title)
        elif conf == "Low":
            summary.low_confidence.append(title)
        else:
            summary.no_confidence.append(title)

    logger.info(
        f"KB summary for {pillar_name}: {summary.total_entries} entries "
        f"({len(summary.completed)} mastered, {len(summary.high_confidence)} high, "
        f"{len(summary.medium_confidence)} medium, {len(summary.low_confidence)} low)"
    )

    return summary
