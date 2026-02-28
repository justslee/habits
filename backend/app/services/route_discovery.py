"""Route Discovery Service — GraphHopper-powered loop route generation."""

import asyncio
import logging
import os
import time
from typing import Any, Dict, List, Optional, Tuple

import httpx

from app.services.evaluation import call_clawdbot

logger = logging.getLogger(__name__)

GRAPHHOPPER_URL = os.getenv("GRAPHHOPPER_URL", "http://localhost:8989")
MILES_TO_METERS = 1609.344
METERS_TO_MILES = 0.000621371
METERS_TO_FEET = 3.28084

# In-memory cache: (lat_bucket, lng_bucket, dist_bucket) -> (timestamp, routes)
_cache: Dict[Tuple[float, float, float], Tuple[float, List[dict]]] = {}
_CACHE_TTL = 3600  # 1 hour


def _cache_key(lat: float, lng: float, distance_miles: float) -> Tuple[float, float, float]:
    """Round coords to ~0.5mi grid for cache reuse."""
    return (round(lat, 2), round(lng, 2), round(distance_miles))


def _get_cached(lat: float, lng: float, distance_miles: float) -> Optional[List[dict]]:
    key = _cache_key(lat, lng, distance_miles)
    entry = _cache.get(key)
    if entry and time.time() - entry[0] < _CACHE_TTL:
        return entry[1]
    return None


def _set_cached(lat: float, lng: float, distance_miles: float, routes: List[dict]) -> None:
    key = _cache_key(lat, lng, distance_miles)
    _cache[key] = (time.time(), routes)


async def _call_graphhopper(
    lat: float, lng: float, distance_meters: float, seed: int
) -> Optional[Dict[str, Any]]:
    """Call GraphHopper round_trip API for a single route."""
    params = {
        "profile": "foot",
        "algorithm": "round_trip",
        "point": f"{lat},{lng}",
        "round_trip.distance": int(distance_meters),
        "round_trip.seed": seed,
        "details": "street_name",
        "type": "json",
    }

    try:
        async with httpx.AsyncClient(timeout=30.0) as client:
            resp = await client.get(f"{GRAPHHOPPER_URL}/route", params=params)
            resp.raise_for_status()
            data = resp.json()
            if data.get("paths"):
                return data["paths"][0]
    except httpx.HTTPError as e:
        logger.warning("GraphHopper request failed (seed=%d): %s", seed, e)
    return None


def _decode_polyline(encoded: str, is_3d: bool = True) -> List[dict]:
    """Decode Google-style encoded polyline (with elevation if is_3d)."""
    points = []
    index = 0
    lat = 0
    lng = 0
    alt = 0
    length = len(encoded)

    while index < length:
        # Latitude
        shift = 0
        result = 0
        while True:
            b = ord(encoded[index]) - 63
            index += 1
            result |= (b & 0x1F) << shift
            shift += 5
            if b < 0x20:
                break
        lat += (~(result >> 1) if result & 1 else result >> 1)

        # Longitude
        shift = 0
        result = 0
        while True:
            b = ord(encoded[index]) - 63
            index += 1
            result |= (b & 0x1F) << shift
            shift += 5
            if b < 0x20:
                break
        lng += (~(result >> 1) if result & 1 else result >> 1)

        point = {"lat": lat / 1e5, "lng": lng / 1e5}

        if is_3d and index < length:
            shift = 0
            result = 0
            while True:
                b = ord(encoded[index]) - 63
                index += 1
                result |= (b & 0x1F) << shift
                shift += 5
                if b < 0x20:
                    break
            alt += (~(result >> 1) if result & 1 else result >> 1)
            point["alt"] = alt / 100.0

        points.append(point)

    return points


def _extract_street_names(path_data: dict) -> List[str]:
    """Extract top street names from GraphHopper details."""
    details = path_data.get("details", {})
    street_data = details.get("street_name", [])
    if not street_data:
        return []

    # street_data is [[from_idx, to_idx, name], ...]
    name_lengths: Dict[str, int] = {}
    for segment in street_data:
        if len(segment) >= 3 and segment[2]:
            name = segment[2]
            span = segment[1] - segment[0]
            name_lengths[name] = name_lengths.get(name, 0) + span

    # Sort by prominence (how much of the route they cover)
    sorted_names = sorted(name_lengths.items(), key=lambda x: -x[1])
    return [name for name, _ in sorted_names[:5]]


def _classify_difficulty(ascend_m: float, distance_m: float) -> str:
    """Classify route difficulty based on elevation gain per mile."""
    if distance_m <= 0:
        return "easy"
    gain_ft_per_mile = (ascend_m * METERS_TO_FEET) / (distance_m * METERS_TO_MILES)
    if gain_ft_per_mile < 50:
        return "easy"
    if gain_ft_per_mile < 100:
        return "moderate"
    return "hilly"


async def _generate_route_name(
    street_names: List[str], distance_miles: float, difficulty: str, index: int
) -> Tuple[str, str]:
    """Use Clawdbot to generate a creative route name and description."""
    fallback_name = f"Loop Route {index + 1}"
    fallback_desc = f"A {distance_miles:.1f}-mile {difficulty} loop"

    if not street_names:
        return fallback_name, fallback_desc

    system = (
        "You name running routes. Given street names and stats, return a JSON object "
        "with 'name' (creative 2-4 word name, e.g. 'Riverside Loop', 'Harbor Heights') "
        "and 'description' (one sentence about the route character). "
        "No markdown, no code fences — just raw JSON."
    )
    user = (
        f"Streets: {', '.join(street_names)}\n"
        f"Distance: {distance_miles:.1f} miles\n"
        f"Difficulty: {difficulty}"
    )

    try:
        raw = await call_clawdbot(system, user)
        import json
        content = raw["choices"][0]["message"]["content"].strip()
        # Strip code fences if present
        if content.startswith("```"):
            content = content.split("\n", 1)[1] if "\n" in content else content[3:]
        if content.endswith("```"):
            content = content.rsplit("```", 1)[0]
        parsed = json.loads(content.strip())
        return parsed.get("name", fallback_name), parsed.get("description", fallback_desc)
    except Exception as e:
        logger.warning("Route naming failed: %s", e)
        return fallback_name, fallback_desc


async def discover_routes(
    lat: float, lng: float, distance_miles: float, num_routes: int = 3
) -> List[dict]:
    """Discover loop routes from a starting point using GraphHopper.

    Returns a list of route dicts with: name, description, polyline, distance_miles,
    elevation_gain_ft, difficulty, street_names, estimated_time_minutes.
    """
    # Check cache
    cached = _get_cached(lat, lng, distance_miles)
    if cached:
        return cached

    distance_meters = distance_miles * MILES_TO_METERS

    # Generate routes with different seeds in parallel
    seeds = list(range(num_routes))
    tasks = [_call_graphhopper(lat, lng, distance_meters, seed) for seed in seeds]
    results = await asyncio.gather(*tasks)

    routes = []
    for i, path_data in enumerate(results):
        if not path_data:
            continue

        # Decode polyline
        encoded = path_data.get("points", "")
        if isinstance(encoded, str):
            polyline = _decode_polyline(encoded, is_3d=False)
        elif isinstance(encoded, dict):
            # GeoJSON format
            coords = encoded.get("coordinates", [])
            polyline = [{"lat": c[1], "lng": c[0], "alt": c[2] if len(c) > 2 else 0} for c in coords]
        else:
            continue

        dist_m = path_data.get("distance", 0)
        ascend_m = path_data.get("ascend", 0)
        time_ms = path_data.get("time", 0)

        street_names = _extract_street_names(path_data)
        difficulty = _classify_difficulty(ascend_m, dist_m)

        routes.append({
            "polyline": polyline,
            "distance_miles": round(dist_m * METERS_TO_MILES, 2),
            "elevation_gain_ft": round(ascend_m * METERS_TO_FEET),
            "difficulty": difficulty,
            "street_names": street_names,
            "estimated_time_minutes": round(time_ms / 60000),
            "_index": i,
        })

    # Name routes in parallel
    name_tasks = [
        _generate_route_name(r["street_names"], r["distance_miles"], r["difficulty"], r["_index"])
        for r in routes
    ]
    names = await asyncio.gather(*name_tasks)

    for route, (name, desc) in zip(routes, names):
        route["name"] = name
        route["description"] = desc
        del route["_index"]

    # Cache results
    if routes:
        _set_cached(lat, lng, distance_miles, routes)

    return routes


async def check_graphhopper_health() -> bool:
    """Check if GraphHopper is reachable."""
    try:
        async with httpx.AsyncClient(timeout=5.0) as client:
            resp = await client.get(f"{GRAPHHOPPER_URL}/health")
            return resp.status_code == 200
    except Exception:
        return False
