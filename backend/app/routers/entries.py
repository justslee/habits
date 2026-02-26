"""Daily entry API endpoints."""

from datetime import date
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session, joinedload

from app.db.database import get_db
from app.models.daily_entry import DailyEntry
from app.models.user import User
from app.schemas.entry import EntryCreate, EntryResponse, EntryUpdate

router = APIRouter(prefix="/api/v1/entries", tags=["entries"])


def _get_default_user(db: Session) -> User:
    """Get the default user (single-user app)."""
    user = db.query(User).first()
    if not user:
        raise HTTPException(status_code=500, detail="No user found. Run seed first.")
    return user


@router.post("", response_model=EntryResponse, status_code=201)
def create_entry(payload: EntryCreate, db: Session = Depends(get_db)):
    """Create a new daily check-in entry."""
    user = _get_default_user(db)

    entry = DailyEntry(
        user_id=user.id,
        entry_date=payload.entry_date or date.today(),
        description=payload.description,
        time_invested_minutes=payload.time_invested_minutes,
        difficulty_rating=payload.difficulty_rating,
        energy_level=payload.energy_level,
        key_takeaway=payload.key_takeaway,
    )
    entry.pillar_tag_list = payload.pillar_tags

    db.add(entry)
    db.commit()
    db.refresh(entry)
    return EntryResponse.from_entry(entry)


@router.get("", response_model=List[EntryResponse])
def list_entries(
    start_date: Optional[date] = Query(None),
    end_date: Optional[date] = Query(None),
    db: Session = Depends(get_db),
):
    """List entries with optional date range filtering."""
    query = (
        db.query(DailyEntry)
        .options(joinedload(DailyEntry.evaluation))
        .order_by(DailyEntry.entry_date.desc(), DailyEntry.created_at.desc())
    )

    if start_date:
        query = query.filter(DailyEntry.entry_date >= start_date)
    if end_date:
        query = query.filter(DailyEntry.entry_date <= end_date)

    entries = query.all()
    return [EntryResponse.from_entry(e) for e in entries]


@router.get("/{entry_id}", response_model=EntryResponse)
def get_entry(entry_id: int, db: Session = Depends(get_db)):
    """Get a single entry with its evaluation."""
    entry = (
        db.query(DailyEntry)
        .options(joinedload(DailyEntry.evaluation))
        .filter(DailyEntry.id == entry_id)
        .first()
    )
    if not entry:
        raise HTTPException(status_code=404, detail="Entry not found")
    return EntryResponse.from_entry(entry)


@router.patch("/{entry_id}", response_model=EntryResponse)
def update_entry_tags(entry_id: int, payload: EntryUpdate, db: Session = Depends(get_db)):
    """Update pillar tags on an existing entry."""
    entry = (
        db.query(DailyEntry)
        .options(joinedload(DailyEntry.evaluation))
        .filter(DailyEntry.id == entry_id)
        .first()
    )
    if not entry:
        raise HTTPException(status_code=404, detail="Entry not found")

    entry.pillar_tag_list = payload.pillar_tags
    db.commit()
    db.refresh(entry)
    return EntryResponse.from_entry(entry)
