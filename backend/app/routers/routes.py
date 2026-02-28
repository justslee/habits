"""Route API endpoints — Phase 4 (P4-060) + Route Discovery."""

from __future__ import annotations

import json
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.db.database import get_db
from app.models.run import RunSession, SavedRoute
from app.models.user import User
from app.schemas.route import (
    DiscoveredRoute,
    RouteDiscoverRequest,
    RouteDiscoverResponse,
    SavedRouteCreate,
    SavedRouteListItem,
    SavedRouteResponse,
)

router = APIRouter(prefix="/api/v1/routes", tags=["routes"])


@router.post("/discover", response_model=RouteDiscoverResponse)
async def discover_routes(payload: RouteDiscoverRequest):
    """Discover loop routes from a starting point using GraphHopper."""
    from app.services.route_discovery import check_graphhopper_health, discover_routes as _discover

    if not await check_graphhopper_health():
        raise HTTPException(status_code=503, detail="Route engine offline")

    routes = await _discover(payload.latitude, payload.longitude, payload.distance_miles)

    return RouteDiscoverResponse(
        routes=[
            DiscoveredRoute(
                name=r["name"],
                description=r["description"],
                polyline=r["polyline"],
                distance_miles=r["distance_miles"],
                elevation_gain_ft=r["elevation_gain_ft"],
                difficulty=r["difficulty"],
                street_names=r["street_names"],
                estimated_time_minutes=r["estimated_time_minutes"],
            )
            for r in routes
        ],
        cached=False,
    )


@router.post("/discover/save", response_model=SavedRouteResponse)
def save_discovered_route(payload: SavedRouteCreate, db: Session = Depends(get_db)):
    """Save a discovered route to the user's library."""
    user = db.query(User).first()
    if not user:
        raise HTTPException(status_code=404, detail="No user found")

    route = SavedRoute(
        user_id=user.id,
        name=payload.name,
        waypoints=payload.waypoints,
        polyline=payload.polyline,
        distance_miles=payload.distance_miles,
        elevation_gain_ft=payload.elevation_gain_ft,
        route_type=payload.route_type or "loop",
        tags=payload.tags,
        description=payload.description,
    )
    db.add(route)
    db.commit()
    db.refresh(route)
    return _route_to_response(route)


@router.post("/", response_model=SavedRouteResponse)
def create_route(payload: SavedRouteCreate, db: Session = Depends(get_db)):
    """Save a new route."""
    user = db.query(User).first()
    if not user:
        raise HTTPException(status_code=404, detail="No user found")

    route = SavedRoute(
        user_id=user.id,
        name=payload.name,
        waypoints=payload.waypoints,
        polyline=payload.polyline,
        distance_miles=payload.distance_miles,
        elevation_gain_ft=payload.elevation_gain_ft,
        route_type=payload.route_type,
        tags=payload.tags,
        description=payload.description,
    )
    db.add(route)
    db.commit()
    db.refresh(route)
    return _route_to_response(route)


@router.get("/", response_model=list[SavedRouteListItem])
def list_routes(db: Session = Depends(get_db)):
    """List all saved routes."""
    user = db.query(User).first()
    if not user:
        return []
    routes = (
        db.query(SavedRoute)
        .filter(SavedRoute.user_id == user.id)
        .order_by(SavedRoute.times_run.desc(), SavedRoute.name)
        .all()
    )
    return [
        SavedRouteListItem(
            id=r.id, name=r.name, distance_miles=r.distance_miles,
            elevation_gain_ft=r.elevation_gain_ft, route_type=r.route_type,
            tags=r.tags, times_run=r.times_run, best_time_seconds=r.best_time_seconds,
            last_run_date=r.last_run_date.isoformat() if r.last_run_date else None,
        )
        for r in routes
    ]


@router.get("/{route_id}", response_model=SavedRouteResponse)
def get_route(route_id: int, db: Session = Depends(get_db)):
    """Get route detail with polyline."""
    route = db.query(SavedRoute).filter(SavedRoute.id == route_id).first()
    if not route:
        raise HTTPException(status_code=404, detail="Route not found")
    return _route_to_response(route)


@router.delete("/{route_id}")
def delete_route(route_id: int, db: Session = Depends(get_db)):
    """Delete a saved route."""
    route = db.query(SavedRoute).filter(SavedRoute.id == route_id).first()
    if not route:
        raise HTTPException(status_code=404, detail="Route not found")
    db.delete(route)
    db.commit()
    return {"ok": True}


@router.get("/{route_id}/runs")
def get_route_runs(route_id: int, limit: int = 20, db: Session = Depends(get_db)):
    """Get all runs on a specific route."""
    route = db.query(SavedRoute).filter(SavedRoute.id == route_id).first()
    if not route:
        raise HTTPException(status_code=404, detail="Route not found")

    runs = (
        db.query(RunSession)
        .filter(RunSession.route_id == route_id, RunSession.status == "completed")
        .order_by(RunSession.run_date.desc())
        .limit(limit)
        .all()
    )
    return [
        {
            "id": r.id, "run_date": r.run_date.isoformat(),
            "distance_miles": r.distance_miles, "duration_seconds": r.duration_seconds,
            "avg_pace_formatted": r.avg_pace_formatted, "rpe": r.rpe,
        }
        for r in runs
    ]


# --- Route Discovery ---

class RouteDiscoverRequest(BaseModel):
    latitude: float
    longitude: float
    target_miles: Optional[float] = None
    preferences: Optional[list[str]] = None


@router.post("/discover")
async def discover_routes_endpoint(payload: RouteDiscoverRequest):
    """Generate AI-suggested running routes based on current location."""
    from app.services.route_discovery import discover_routes

    result = await discover_routes(
        latitude=payload.latitude,
        longitude=payload.longitude,
        target_miles=payload.target_miles,
        preferences=payload.preferences,
    )
    return result


def _route_to_response(route: SavedRoute) -> SavedRouteResponse:
    return SavedRouteResponse(
        id=route.id, name=route.name, waypoints=route.waypoints,
        polyline=route.polyline, distance_miles=route.distance_miles,
        elevation_gain_ft=route.elevation_gain_ft, route_type=route.route_type,
        tags=route.tags, description=route.description,
        times_run=route.times_run, best_time_seconds=route.best_time_seconds,
        last_run_date=route.last_run_date.isoformat() if route.last_run_date else None,
    )
