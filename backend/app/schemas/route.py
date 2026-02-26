"""Pydantic schemas for route endpoints."""

from typing import List, Optional
from pydantic import BaseModel


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
