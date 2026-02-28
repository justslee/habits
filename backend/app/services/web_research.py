"""Web Research service for deep concept seeding (P5-2 enhancement).

Performs web searches to gather the latest information about a pillar's topic area,
then synthesizes results into a research brief that feeds the concept tree generator.

Supports multiple search providers:
- Brave Search API (default, free tier: 1000 queries/month)
- Tavily API (optimized for AI agents)
- Fallback: Clawdbot-based research (uses LLM's training data as research proxy)

The research pipeline:
1. Generate targeted search queries for the pillar
2. Execute searches and collect results
3. Synthesize results into a structured research brief
"""

from __future__ import annotations

import json
import logging
import os
from dataclasses import dataclass, field
from typing import Any

import httpx

from app.services.evaluation import call_clawdbot

logger = logging.getLogger(__name__)

# Search provider configuration
BRAVE_API_KEY = os.getenv("BRAVE_SEARCH_API_KEY")
TAVILY_API_KEY = os.getenv("TAVILY_API_KEY")

BRAVE_SEARCH_URL = "https://api.search.brave.com/res/v1/web/search"
TAVILY_SEARCH_URL = "https://api.tavily.com/search"


@dataclass
class SearchResult:
    """A single web search result."""
    title: str
    url: str
    snippet: str
    source: str = ""


@dataclass
class ResearchBrief:
    """Synthesized research output for concept tree seeding."""
    pillar_name: str
    queries_used: list[str] = field(default_factory=list)
    raw_results: list[SearchResult] = field(default_factory=list)
    synthesis: str = ""  # LLM-generated research synthesis
    key_topics: list[str] = field(default_factory=list)
    key_resources: list[str] = field(default_factory=list)
    frontier_developments: list[str] = field(default_factory=list)

    def to_context_block(self) -> str:
        """Convert to a text block suitable for LLM context injection."""
        parts = [f"## Web Research Brief — Latest Developments ({self.pillar_name})"]
        parts.append(f"Research queries: {len(self.queries_used)}")
        parts.append(f"Sources analyzed: {len(self.raw_results)}")

        if self.synthesis:
            parts.append(f"\n### Research Synthesis")
            parts.append(self.synthesis)

        if self.key_topics:
            parts.append(f"\n### Key Topics Identified ({len(self.key_topics)}):")
            for topic in self.key_topics:
                parts.append(f"  • {topic}")

        if self.key_resources:
            parts.append(f"\n### Recommended Resources:")
            for resource in self.key_resources:
                parts.append(f"  📚 {resource}")

        if self.frontier_developments:
            parts.append(f"\n### Frontier / Cutting-Edge Developments:")
            for dev in self.frontier_developments:
                parts.append(f"  🔬 {dev}")

        if self.raw_results:
            parts.append(f"\n### Source URLs:")
            for r in self.raw_results[:15]:
                parts.append(f"  - [{r.title}]({r.url})")

        parts.append(
            "\n**IMPORTANT**: Use this research to ensure the concept tree includes "
            "the LATEST developments, tools, frameworks, and papers. Concepts should "
            "reference real, current resources — not outdated ones."
        )

        return "\n".join(parts)


# --- Search Query Generation ---

QUERY_GEN_PROMPT = """You are a research assistant helping build a comprehensive learning roadmap.

Generate 5-8 targeted web search queries to research the current state of a field.
The queries should cover:
1. Core curriculum / textbook topics for the field
2. Latest developments and breakthroughs (2024-2026)
3. Best learning resources (books, courses, papers)
4. Practical tools and frameworks used by practitioners
5. Frontier research and open problems
6. Career-relevant skills and certifications

Respond with JSON only:
{
  "queries": ["query 1", "query 2", ...]
}"""


async def _generate_search_queries(
    pillar_name: str,
    depth_target: str | None = None,
    vision_target: str | None = None,
) -> list[str]:
    """Use LLM to generate targeted search queries for a pillar."""
    user_prompt = f"Generate search queries for deep research into: **{pillar_name}**"
    if depth_target:
        user_prompt += f"\nDepth target: {depth_target}"
    if vision_target:
        user_prompt += f"\nSpecific goal: {vision_target}"

    try:
        raw = await call_clawdbot(QUERY_GEN_PROMPT, user_prompt)
        content = raw["choices"][0]["message"]["content"]
        # Strip markdown fences
        content = content.strip()
        if content.startswith("```"):
            content = content.split("\n", 1)[1] if "\n" in content else content[3:]
            if content.endswith("```"):
                content = content[:-3]
            content = content.strip()

        parsed = json.loads(content)
        queries = parsed.get("queries", [])
        logger.info(f"Generated {len(queries)} search queries for {pillar_name}")
        return queries
    except Exception as e:
        logger.error(f"Query generation failed: {e}")
        # Fallback queries
        return [
            f"{pillar_name} comprehensive learning roadmap 2026",
            f"{pillar_name} best textbooks and courses",
            f"{pillar_name} latest research developments 2025 2026",
            f"{pillar_name} practical skills and tools",
            f"{pillar_name} frontier problems and open questions",
        ]


# --- Search Providers ---

async def _search_brave(query: str, count: int = 8) -> list[SearchResult]:
    """Execute a search using Brave Search API."""
    if not BRAVE_API_KEY:
        return []

    headers = {
        "Accept": "application/json",
        "Accept-Encoding": "gzip",
        "X-Subscription-Token": BRAVE_API_KEY,
    }
    params = {"q": query, "count": count}

    async with httpx.AsyncClient(timeout=15.0) as client:
        try:
            resp = await client.get(BRAVE_SEARCH_URL, headers=headers, params=params)
            resp.raise_for_status()
            data = resp.json()

            results = []
            for item in data.get("web", {}).get("results", []):
                results.append(SearchResult(
                    title=item.get("title", ""),
                    url=item.get("url", ""),
                    snippet=item.get("description", ""),
                    source="brave",
                ))
            return results
        except Exception as e:
            logger.error(f"Brave search failed for '{query}': {e}")
            return []


async def _search_tavily(query: str, max_results: int = 8) -> list[SearchResult]:
    """Execute a search using Tavily API."""
    if not TAVILY_API_KEY:
        return []

    payload = {
        "api_key": TAVILY_API_KEY,
        "query": query,
        "max_results": max_results,
        "search_depth": "advanced",
        "include_answer": True,
    }

    async with httpx.AsyncClient(timeout=20.0) as client:
        try:
            resp = await client.post(TAVILY_SEARCH_URL, json=payload)
            resp.raise_for_status()
            data = resp.json()

            results = []
            for item in data.get("results", []):
                results.append(SearchResult(
                    title=item.get("title", ""),
                    url=item.get("url", ""),
                    snippet=item.get("content", "")[:500],
                    source="tavily",
                ))
            return results
        except Exception as e:
            logger.error(f"Tavily search failed for '{query}': {e}")
            return []


async def _search(query: str) -> list[SearchResult]:
    """Execute a search using the best available provider."""
    if BRAVE_API_KEY:
        return await _search_brave(query)
    elif TAVILY_API_KEY:
        return await _search_tavily(query)
    else:
        logger.info("No search API key configured — using LLM-only research mode")
        return []


# --- Research Synthesis ---

SYNTHESIS_SYSTEM_PROMPT = """You are a research synthesizer. Given a collection of web search results
about a topic, produce a structured research brief that would help someone build a comprehensive
learning roadmap.

Your output must be valid JSON:
{
  "synthesis": "2-4 paragraph overview of the current state of the field, key areas, and what someone needs to learn",
  "key_topics": ["List of 20-40 specific technical topics/concepts that are essential to master"],
  "key_resources": ["List of 10-20 specific books, courses, papers, or tools with titles and authors"],
  "frontier_developments": ["List of 5-10 cutting-edge developments, new papers, or emerging techniques from 2024-2026"]
}

Be SPECIFIC. Use real names, real papers, real tools. No generic platitudes."""


async def _synthesize_results(
    pillar_name: str,
    results: list[SearchResult],
    depth_target: str | None = None,
) -> dict[str, Any]:
    """Use LLM to synthesize search results into a structured brief."""
    # Build context from search results
    context_parts = [f"Research topic: {pillar_name}"]
    if depth_target:
        context_parts.append(f"Depth target: {depth_target}")

    context_parts.append("\n--- Search Results ---\n")
    for i, r in enumerate(results[:30], 1):  # Cap at 30 results
        context_parts.append(f"[{i}] {r.title}")
        context_parts.append(f"    URL: {r.url}")
        context_parts.append(f"    {r.snippet}")
        context_parts.append("")

    user_prompt = "\n".join(context_parts)
    user_prompt += "\n\nSynthesize these search results into a comprehensive research brief."

    try:
        raw = await call_clawdbot(SYNTHESIS_SYSTEM_PROMPT, user_prompt)
        content = raw["choices"][0]["message"]["content"]
        # Strip markdown fences
        content = content.strip()
        if content.startswith("```"):
            content = content.split("\n", 1)[1] if "\n" in content else content[3:]
            if content.endswith("```"):
                content = content[:-3]
            content = content.strip()

        return json.loads(content)
    except Exception as e:
        logger.error(f"Research synthesis failed: {e}")
        return {
            "synthesis": "",
            "key_topics": [],
            "key_resources": [],
            "frontier_developments": [],
        }


async def _llm_only_research(
    pillar_name: str,
    depth_target: str | None = None,
    vision_target: str | None = None,
) -> dict[str, Any]:
    """Fallback: Use LLM's training data as a research proxy when no search API is available."""
    user_prompt = f"Research topic: {pillar_name}"
    if depth_target:
        user_prompt += f"\nDepth target: {depth_target}"
    if vision_target:
        user_prompt += f"\nSpecific goal: {vision_target}"

    user_prompt += (
        "\n\nProvide a comprehensive research brief based on your training data. "
        "Include the MOST current information you know about (up to your knowledge cutoff). "
        "Focus on real textbooks, papers, courses, and tools."
    )

    try:
        raw = await call_clawdbot(SYNTHESIS_SYSTEM_PROMPT, user_prompt)
        content = raw["choices"][0]["message"]["content"]
        content = content.strip()
        if content.startswith("```"):
            content = content.split("\n", 1)[1] if "\n" in content else content[3:]
            if content.endswith("```"):
                content = content[:-3]
            content = content.strip()
        return json.loads(content)
    except Exception as e:
        logger.error(f"LLM-only research failed: {e}")
        return {
            "synthesis": "",
            "key_topics": [],
            "key_resources": [],
            "frontier_developments": [],
        }


# --- Main Research Pipeline ---

async def research_pillar(
    pillar_name: str,
    depth_target: str | None = None,
    vision_target: str | None = None,
) -> ResearchBrief:
    """Execute the full research pipeline for a pillar.

    1. Generate targeted search queries
    2. Execute searches across all queries
    3. Synthesize results into a structured research brief

    Falls back to LLM-only research if no search API is configured.

    Args:
        pillar_name: The pillar to research.
        depth_target: The pillar's depth target (e.g., "Research-level understanding").
        vision_target: Specific vision target for this pillar.

    Returns:
        ResearchBrief with synthesized research.
    """
    brief = ResearchBrief(pillar_name=pillar_name)

    has_search_api = bool(BRAVE_API_KEY or TAVILY_API_KEY)

    if has_search_api:
        # Stage 1: Generate queries
        queries = await _generate_search_queries(pillar_name, depth_target, vision_target)
        brief.queries_used = queries

        # Stage 2: Execute searches
        all_results: list[SearchResult] = []
        for query in queries:
            results = await _search(query)
            all_results.extend(results)
            logger.info(f"Search '{query}': {len(results)} results")

        # Deduplicate by URL
        seen_urls: set[str] = set()
        unique_results: list[SearchResult] = []
        for r in all_results:
            if r.url not in seen_urls:
                seen_urls.add(r.url)
                unique_results.append(r)

        brief.raw_results = unique_results
        logger.info(f"Total unique search results: {len(unique_results)}")

        # Stage 3: Synthesize
        if unique_results:
            synthesized = await _synthesize_results(pillar_name, unique_results, depth_target)
        else:
            synthesized = await _llm_only_research(pillar_name, depth_target, vision_target)
    else:
        # No search API — use LLM-only research
        logger.info("No search API configured — using LLM-only deep research mode")
        brief.queries_used = [f"LLM-only research: {pillar_name}"]
        synthesized = await _llm_only_research(pillar_name, depth_target, vision_target)

    # Populate brief from synthesis
    brief.synthesis = synthesized.get("synthesis", "")
    brief.key_topics = synthesized.get("key_topics", [])
    brief.key_resources = synthesized.get("key_resources", [])
    brief.frontier_developments = synthesized.get("frontier_developments", [])

    logger.info(
        f"Research brief for {pillar_name}: {len(brief.key_topics)} topics, "
        f"{len(brief.key_resources)} resources, {len(brief.frontier_developments)} frontier items"
    )

    return brief
