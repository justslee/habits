"""Daily entry API endpoints."""

from datetime import date, datetime
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session, joinedload

from app.db.database import get_db
from app.models.daily_entry import DailyEntry
from app.models.streak import Streak
from app.models.user import User
from app.schemas.entry import EntryCreate, EntryResponse, EntryUpdate
from app.schemas.suggest_tags import SuggestTagsRequest, SuggestTagsResponse
from app.services.evaluation import evaluate_entry
from app.services.suggest_tags import suggest_tags

logger = __import__("logging").getLogger(__name__)

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
    db.flush()  # Get entry.id and pillar_tag_list before streak update

    # Update streaks for each tagged pillar
    for pillar_id in entry.pillar_tag_list:
        streak = (
            db.query(Streak)
            .filter(Streak.user_id == user.id, Streak.pillar_id == pillar_id)
            .first()
        )
        if not streak:
            streak = Streak(
                user_id=user.id,
                pillar_id=pillar_id,
                current_streak=0,
                longest_streak=0,
                days_since_break=0,
            )
            db.add(streak)
        streak.update_streak(entry.entry_date)

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
        .filter(DailyEntry.deleted_at.is_(None))
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
        .filter(DailyEntry.id == entry_id, DailyEntry.deleted_at.is_(None))
        .first()
    )
    if not entry:
        raise HTTPException(status_code=404, detail="Entry not found")
    return EntryResponse.from_entry(entry)


@router.patch("/{entry_id}", response_model=EntryResponse)
def update_entry_tags(
    entry_id: int, payload: EntryUpdate, db: Session = Depends(get_db)
):
    """Update pillar tags on an existing entry."""
    entry = (
        db.query(DailyEntry)
        .options(joinedload(DailyEntry.evaluation))
        .filter(DailyEntry.id == entry_id, DailyEntry.deleted_at.is_(None))
        .first()
    )
    if not entry:
        raise HTTPException(status_code=404, detail="Entry not found")

    entry.pillar_tag_list = payload.pillar_tags
    db.commit()
    db.refresh(entry)
    return EntryResponse.from_entry(entry)


@router.post("/suggest-tags", response_model=SuggestTagsResponse)
async def suggest_pillar_tags(
    payload: SuggestTagsRequest, db: Session = Depends(get_db)
):
    """Suggest pillar tags for entry text using LLM analysis."""
    suggestions = await suggest_tags(payload.description, db)
    return SuggestTagsResponse(suggestions=suggestions)


@router.post("/{entry_id}/evaluate", response_model=EntryResponse)
async def evaluate_entry_endpoint(entry_id: int, db: Session = Depends(get_db)):
    """Trigger AI evaluation for an entry."""
    entry = (
        db.query(DailyEntry)
        .options(joinedload(DailyEntry.evaluation))
        .filter(DailyEntry.id == entry_id, DailyEntry.deleted_at.is_(None))
        .first()
    )
    if not entry:
        raise HTTPException(status_code=404, detail="Entry not found")

    if entry.evaluation:
        raise HTTPException(status_code=409, detail="Entry already evaluated")

    # Side-effecting: persists the Evaluation row, which is then read back via `entry`.
    await evaluate_entry(entry, db)

    # Refresh to load relationship
    db.refresh(entry)
    return EntryResponse.from_entry(entry)


@router.delete("/{entry_id}", status_code=200)
def soft_delete_entry(entry_id: int, db: Session = Depends(get_db)):
    """Soft-delete a daily entry and its evaluation (D-019, P5-5)."""
    entry = (
        db.query(DailyEntry)
        .options(joinedload(DailyEntry.evaluation))
        .filter(DailyEntry.id == entry_id, DailyEntry.deleted_at.is_(None))
        .first()
    )
    if not entry:
        raise HTTPException(status_code=404, detail="Entry not found")

    now = datetime.utcnow()
    entry.deleted_at = now

    # Cascade to evaluation
    if entry.evaluation:
        entry.evaluation.deleted_at = now

    db.commit()
    return {"detail": "Entry deleted", "id": entry_id}


@router.post("/{entry_id}/restore", response_model=EntryResponse)
def restore_entry(entry_id: int, db: Session = Depends(get_db)):
    """Restore a soft-deleted entry and its evaluation."""
    entry = (
        db.query(DailyEntry)
        .options(joinedload(DailyEntry.evaluation))
        .filter(DailyEntry.id == entry_id, DailyEntry.deleted_at.isnot(None))
        .first()
    )
    if not entry:
        raise HTTPException(status_code=404, detail="Deleted entry not found")

    entry.deleted_at = None
    if entry.evaluation:
        entry.evaluation.deleted_at = None

    db.commit()
    db.refresh(entry)
    return EntryResponse.from_entry(entry)
