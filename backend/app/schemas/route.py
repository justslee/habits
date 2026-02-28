"""Pydantic schemas for route endpoints."""

import json
from typing import Any, List, Optional

from pydantic import BaseModel, field_validator


class SavedRouteCreate(BaseModel):
    name: str
    waypoints: Optional[str] = None  # JSON array of {lat, lng}
    polyline: Optional[str] = None   # JSON array of {lat, lng, alt}
    distance_miles: float
    elevation_gain_ft: Optional[float] = None
    route_type: Optional[str] = None  # loop, out_and_back, point_to_point
    tags: Optional[str] = None        # comma-separated
    description: Optional[str] = None


class SavedRouteResponse(BaseModel):
    id: int
    name: str
    waypoints: Optional[str]
    polyline: Optional[str]
    distance_miles: float
    elevation_gain_ft: Optional[float]
    route_type: Optional[str]
    tags: Optional[str]
    description: Optional[str]
    times_run: int
    best_time_seconds: Optional[int]
    last_run_date: Optional[str]

    model_config = {"from_attributes": True}


class SavedRouteListItem(BaseModel):
    id: int
    name: str
    distance_miles: float
    elevation_gain_ft: Optional[float]
    route_type: Optional[str]
    tags: Optional[str]
    times_run: int
    best_time_seconds: Optional[int]
    last_run_date: Optional[str]

    model_config = {"from_attributes": True}


# --- Route Discovery ---

class RouteDiscoverRequest(BaseModel):
    latitude: float
    longitude: float
    distance_miles: float = 3.0

    @field_validator("distance_miles")
    @classmethod
    def validate_distance(cls, v: float) -> float:
        if v < 0.5 or v > 30:
            raise ValueError("distance_miles must be between 0.5 and 30")
        return v


class DiscoveredRoute(BaseModel):
    name: str
    description: str
    polyline: List[dict]  # [{lat, lng, alt}, ...]
    distance_miles: float
    elevation_gain_ft: float
    difficulty: str  # easy, moderate, hilly
    street_names: List[str]
    estimated_time_minutes: int


class RouteDiscoverResponse(BaseModel):
    routes: List[DiscoveredRoute]
    cached: bool = False
