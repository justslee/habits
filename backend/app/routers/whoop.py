"""Whoop data API — exposes full Whoop metrics to the frontend."""

from datetime import date

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.db.database import get_db
from app.models.user import User

router = APIRouter(prefix="/api/v1/whoop", tags=["whoop"])


def _get_user(db: Session) -> User:
    user = db.query(User).first()
    if not user:
        raise HTTPException(status_code=404, detail="No user found")
    return user


@router.get("/")
async def get_whoop_data(db: Session = Depends(get_db)):
    """Get comprehensive Whoop data: recovery, sleep, strain, workout, HR zones."""
    from app.services.whoop import fetch_whoop_data, cache_whoop_snapshot, WhoopUnavailableError
    user = _get_user(db)
    try:
        data = await fetch_whoop_data(user.id, db)
        # Cache snapshot for today
        try:
            cache_whoop_snapshot(user.id, data, db)
        except Exception:
            pass  # Don't fail the response if caching fails
        return data
    except WhoopUnavailableError as e:
        raise HTTPException(status_code=503, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/snapshot/{snapshot_date}")
def get_whoop_snapshot(snapshot_date: date, db: Session = Depends(get_db)):
    """Get cached Whoop data for a specific date."""
    from app.services.whoop import get_whoop_snapshot_by_date
    user = _get_user(db)
    data = get_whoop_snapshot_by_date(user.id, snapshot_date, db)
    if not data:
        raise HTTPException(status_code=404, detail="No Whoop data for this date")
    return data
