"""Route Discovery Service — LLM-generated running route suggestions.

Uses Clawdbot to generate running route suggestions based on the user's
current location, desired distance, and terrain preferences.
"""

import json
import logging
from typing import Any

from app.services.evaluation import call_clawdbot, parse_llm_response

logger = logging.getLogger(__name__)

ROUTE_ADVISOR_PROMPT = """You are a knowledgeable running route advisor. Given a user's location and preferences,
suggest 3-5 running routes they could take.

## Guidelines
- Be specific: use real street names, park names, and landmarks for the area if you know them.
- If you don't know the exact area well, create plausible route suggestions based on the neighborhood type.
- Each route should have a distinct character (scenic, fast/flat, hilly challenge, nature trail, etc.)
- Include approximate waypoints as lat/lng pairs that trace the route path.
- Estimate distance and elevation gain realistically.
- Route types: loop (preferred), out_and_back, point_to_point

## Response Format
You MUST respond with valid JSON only. No markdown, no explanation outside the JSON.
{
  "routes": [
    {
      "name": "Route name (descriptive, memorable)",
      "description": "2-3 sentence description of the route, what you'll see, surface type",
      "distance_miles": <float>,
      "estimated_minutes": <int>,
      "elevation_gain_ft": <int>,
      "difficulty": "easy|moderate|challenging",
      "terrain": "road|trail|mixed|track",
      "route_type": "loop|out_and_back|point_to_point",
      "tags": ["flat", "scenic", "shaded", "waterfront", etc.],
      "waypoints": [
        {"lat": <float>, "lng": <float>, "label": "Start"},
        {"lat": <float>, "lng": <float>, "label": "Landmark or turn"},
        ...
        {"lat": <float>, "lng": <float>, "label": "Finish"}
      ]
    }
  ],
  "area_name": "Neighborhood or area name",
  "tips": "1-2 sentences of local running tips (safety, best times, water fountains, etc.)"
}"""


def _build_discovery_prompt(
    latitude: float,
    longitude: float,
    target_miles: float | None,
    preferences: list[str] | None,
) -> str:
    """Build the user prompt for route discovery."""
    parts = [
        f"I'm looking for running routes near coordinates ({latitude:.4f}, {longitude:.4f})."
    ]

    if target_miles:
        parts.append(f"Target distance: approximately {target_miles:.1f} miles.")
    else:
        parts.append("Suggest routes of varying distances (2-6 miles).")

    if preferences:
        parts.append(f"Preferences: {', '.join(preferences)}.")

    parts.append("Suggest 3-5 good running routes for this area.")
    return " ".join(parts)


async def discover_routes(
    latitude: float,
    longitude: float,
    target_miles: float | None = None,
    preferences: list[str] | None = None,
) -> dict[str, Any]:
    """Generate running route suggestions via LLM.

    Returns a dict with 'routes', 'area_name', and 'tips'.
    """
    user_prompt = _build_discovery_prompt(latitude, longitude, target_miles, preferences)

    try:
        raw_response = await call_clawdbot(ROUTE_ADVISOR_PROMPT, user_prompt)
        content = raw_response["choices"][0]["message"]["content"]

        # Strip markdown code fences if present
        content = content.strip()
        if content.startswith("```"):
            content = content.split("\n", 1)[1] if "\n" in content else content[3:]
            if content.endswith("```"):
                content = content[:-3]
            content = content.strip()

        result = json.loads(content)

        # Validate structure
        if "routes" not in result:
            raise ValueError("Response missing 'routes' key")

        for route in result["routes"]:
            # Ensure required fields exist
            route.setdefault("difficulty", "moderate")
            route.setdefault("terrain", "road")
            route.setdefault("route_type", "loop")
            route.setdefault("tags", [])
            route.setdefault("waypoints", [])

        return result

    except Exception as e:
        logger.error(f"Route discovery failed: {e}")
        # Return a helpful fallback
        return {
            "routes": [],
            "area_name": "Unknown area",
            "tips": "Route discovery is temporarily unavailable. Try again shortly.",
            "error": str(e),
        }
