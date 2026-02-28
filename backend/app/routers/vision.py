"""Vision Statement API endpoints (P5-7, D-020).

Upsert pattern — one vision per user.
"""

import json
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.db.database import get_db
from app.models.user import User
from app.models.vision import Vision

router = APIRouter(prefix="/api/v1/vision", tags=["vision"])


class VisionPayload(BaseModel):
    vision_text: Optional[str] = None
    pillar_targets: Optional[dict[str, str]] = None  # {pillar_id: target text}
    time_horizon: Optional[list[dict]] = None  # [{title, target_date}, ...]
    anti_goals: Optional[list[str]] = None


class VisionResponse(BaseModel):
    id: int
    vision_text: Optional[str]
    pillar_targets: Optional[dict[str, str]]
    time_horizon: Optional[list[dict]]
    anti_goals: Optional[list[str]]

    @classmethod
    def from_model(cls, v: Vision) -> "VisionResponse":
        return cls(
            id=v.id,
            vision_text=v.vision_text,
            pillar_targets=json.loads(v.pillar_targets) if v.pillar_targets else None,
            time_horizon=json.loads(v.time_horizon) if v.time_horizon else None,
            anti_goals=json.loads(v.anti_goals) if v.anti_goals else None,
        )


@router.get("", response_model=Optional[VisionResponse])
def get_vision(db: Session = Depends(get_db)):
    """Get the current user's vision statement."""
    user = db.query(User).first()
    if not user:
        return None

    vision = db.query(Vision).filter(Vision.user_id == user.id).first()
    if not vision:
        return None

    return VisionResponse.from_model(vision)


@router.post("", response_model=VisionResponse)
def upsert_vision(payload: VisionPayload, db: Session = Depends(get_db)):
    """Create or update the user's vision statement (upsert)."""
    user = db.query(User).first()
    if not user:
        raise HTTPException(status_code=404, detail="No user found")

    vision = db.query(Vision).filter(Vision.user_id == user.id).first()

    if not vision:
        vision = Vision(user_id=user.id)
        db.add(vision)

    # Update fields that are provided
    if payload.vision_text is not None:
        vision.vision_text = payload.vision_text
    if payload.pillar_targets is not None:
        vision.pillar_targets = json.dumps(payload.pillar_targets)
    if payload.time_horizon is not None:
        vision.time_horizon = json.dumps(payload.time_horizon)
    if payload.anti_goals is not None:
        vision.anti_goals = json.dumps(payload.anti_goals)

    db.commit()
    db.refresh(vision)
    return VisionResponse.from_model(vision)
