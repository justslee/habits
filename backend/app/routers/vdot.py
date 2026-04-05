"""VDOT calculator endpoints."""

from typing import Literal

from fastapi import APIRouter
from pydantic import BaseModel, Field

from app.services.vdot import (
    DISTANCES,
    calculate_training_paces,
    estimate_vdot,
    format_time,
    predict_race_time,
)

router = APIRouter(prefix="/api/v1/vdot", tags=["vdot"])


class VDOTRequest(BaseModel):
    distance: Literal["mile", "5k", "10k", "half", "marathon"]
    time_seconds: int = Field(gt=0)


class PaceRange(BaseModel):
    low: str
    high: str
    low_seconds: int
    high_seconds: int


class RacePrediction(BaseModel):
    distance: str
    time_seconds: int
    time_formatted: str
    pace_per_mile: str


class VDOTResponse(BaseModel):
    vdot: float
    training_paces: dict[str, PaceRange]
    race_predictions: list[RacePrediction]


@router.post("/calculate", response_model=VDOTResponse)
async def calculate_vdot(req: VDOTRequest) -> VDOTResponse:
    """Calculate VDOT, training paces, and race predictions from a race result."""
    distance_meters = DISTANCES[req.distance]
    vdot = estimate_vdot(distance_meters, req.time_seconds)
    vdot_rounded = round(vdot, 1)

    paces = calculate_training_paces(vdot)

    predictions = []
    for label, dist_m in DISTANCES.items():
        time_sec = predict_race_time(vdot, dist_m)
        from app.services.vdot import format_pace, METERS_PER_MILE
        pace_sec = time_sec / (dist_m / METERS_PER_MILE)
        predictions.append(RacePrediction(
            distance=label,
            time_seconds=time_sec,
            time_formatted=format_time(time_sec),
            pace_per_mile=format_pace(pace_sec),
        ))

    return VDOTResponse(
        vdot=vdot_rounded,
        training_paces=paces,
        race_predictions=predictions,
    )
