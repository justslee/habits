"""Milestone API endpoints."""

from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from app.db.database import get_db
from app.models.milestone import Milestone
from app.models.user import User
from app.schemas.milestone import MilestoneCreate, MilestoneResponse

router = APIRouter(prefix="/api/v1/milestones", tags=["milestones"])


def _get_default_user(db: Session) -> User:
    """Get the default user (single-user app)."""
    user = db.query(User).first()
    if not user:
        raise HTTPException(status_code=500, detail="No user found. Run seed first.")
    return user


@router.post("", response_model=MilestoneResponse, status_code=201)
def create_milestone(payload: MilestoneCreate, db: Session = Depends(get_db)):
    """Create a new milestone."""
    user = _get_default_user(db)

    milestone = Milestone(
        user_id=user.id,
        title=payload.title,
        description=payload.description,
        achieved_date=payload.achieved_date,
        pillar_id=payload.pillar_id,
        related_entry_id=payload.related_entry_id,
    )
    db.add(milestone)
    db.commit()
    db.refresh(milestone)
    return milestone


@router.get("", response_model=List[MilestoneResponse])
def list_milestones(
    pillar_id: Optional[int] = Query(None, description="Filter by pillar"),
    db: Session = Depends(get_db),
):
    """List all milestones, optionally filtered by pillar. Ordered chronologically."""
    query = db.query(Milestone).order_by(Milestone.achieved_date.asc())

    if pillar_id is not None:
        query = query.filter(Milestone.pillar_id == pillar_id)

    return query.all()
