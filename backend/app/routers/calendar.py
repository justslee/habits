"""App-wide calendar (Google Calendar via its secret iCal address, read-only).

  GET    /api/v1/calendar/feeds         connected calendars
  PUT    /api/v1/calendar/feeds         set/replace the feed and sync now
  DELETE /api/v1/calendar/feeds         disconnect (events and derived travel go too)
  POST   /api/v1/calendar/sync
  GET    /api/v1/calendar/events?start=&end=   events in a date range (inclusive)
  GET    /api/v1/calendar/today          today's agenda + whether today is a travel day

Food derives travel spans from these events (see /api/v1/food/travel); Daily shows the
agenda; other tabs can read the same rows.
"""

from __future__ import annotations

import datetime
from urllib.parse import urlparse

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from app.db.database import get_db
from app.models.food import CalendarEvent, CalendarFeed, TravelSpan
from app.models.user import User
from app.services import calendar_sync

router = APIRouter(prefix="/api/v1/calendar", tags=["calendar"])


def _user(db: Session) -> User:
    user = db.query(User).first()
    if not user:
        raise HTTPException(status_code=404, detail="No user found")
    return user


class FeedOut(BaseModel):
    id: int
    label: str
    url_host: str
    enabled: bool
    last_synced_at: datetime.datetime | None
    last_error: str | None
    events: int
    travel_spans: int


class FeedIn(BaseModel):
    url: str = Field(min_length=12, max_length=600)
    label: str = "Google Calendar"


def _feed_out(db: Session, f: CalendarFeed) -> FeedOut:
    return FeedOut(
        id=f.id,
        label=f.label,
        url_host=urlparse(f.url).netloc,
        enabled=f.enabled,
        last_synced_at=f.last_synced_at,
        last_error=f.last_error,
        events=db.query(CalendarEvent).filter(CalendarEvent.feed_id == f.id).count(),
        travel_spans=db.query(TravelSpan).filter(TravelSpan.feed_id == f.id).count(),
    )


@router.get("/feeds", response_model=list[FeedOut])
def list_feeds(db: Session = Depends(get_db)):
    user = _user(db)
    return [
        _feed_out(db, f)
        for f in db.query(CalendarFeed).filter(CalendarFeed.user_id == user.id).all()
    ]


@router.put("/feeds", response_model=FeedOut)
async def put_feed(payload: FeedIn, db: Session = Depends(get_db)):
    user = _user(db)
    if not payload.url.startswith("https://") or ".ics" not in payload.url:
        raise HTTPException(
            status_code=422,
            detail="Paste the 'Secret address in iCal format' from Google Calendar settings (an https URL ending in .ics).",
        )
    feed = db.query(CalendarFeed).filter(CalendarFeed.user_id == user.id).first()
    if feed is None:
        feed = CalendarFeed(user_id=user.id, url=payload.url, label=payload.label)
        db.add(feed)
    else:
        feed.url, feed.label, feed.enabled = payload.url, payload.label, True
    db.commit()
    try:
        await calendar_sync.sync_feed(db, feed)
    except Exception as e:  # noqa: BLE001
        raise HTTPException(
            status_code=422, detail=f"Could not read that calendar: {e}"
        )
    return _feed_out(db, feed)


@router.post("/sync", response_model=list[FeedOut])
async def sync_feeds(db: Session = Depends(get_db)):
    user = _user(db)
    feeds = db.query(CalendarFeed).filter(CalendarFeed.user_id == user.id).all()
    for f in feeds:
        try:
            await calendar_sync.sync_feed(db, f)
        except Exception:  # noqa: BLE001 — recorded on the feed
            pass
    return [_feed_out(db, f) for f in feeds]


@router.delete("/feeds")
def delete_feed(db: Session = Depends(get_db)):
    user = _user(db)
    for f in db.query(CalendarFeed).filter(CalendarFeed.user_id == user.id).all():
        db.query(CalendarEvent).filter(CalendarEvent.feed_id == f.id).delete()
        db.query(TravelSpan).filter(TravelSpan.feed_id == f.id).delete()
        db.delete(f)
    db.commit()
    return {"deleted": True}


class EventOut(BaseModel):
    id: int
    summary: str | None
    location: str | None
    start_date: datetime.date
    end_date: datetime.date
    all_day: bool
    start_at: datetime.datetime | None
    end_at: datetime.datetime | None
    kind: str
    recurring: bool


def _event_out(e: CalendarEvent) -> EventOut:
    return EventOut(
        id=e.id,
        summary=e.summary,
        location=e.location,
        start_date=e.start_date,
        end_date=e.end_date,
        all_day=e.all_day,
        start_at=e.start_at,
        end_at=e.end_at,
        kind=e.kind,
        recurring=e.recurring,
    )


@router.get("/events", response_model=list[EventOut])
def list_events(
    start: datetime.date = Query(...),
    end: datetime.date = Query(...),
    db: Session = Depends(get_db),
):
    user = _user(db)
    rows = (
        db.query(CalendarEvent)
        .filter(
            CalendarEvent.user_id == user.id,
            CalendarEvent.end_date >= start,
            CalendarEvent.start_date <= end,
        )
        .order_by(
            CalendarEvent.start_date,
            CalendarEvent.all_day.desc(),
            CalendarEvent.start_at,
        )
        .all()
    )
    return [_event_out(e) for e in rows]


@router.get("/today")
def today(db: Session = Depends(get_db)):
    user = _user(db)
    d = datetime.date.today()
    rows = (
        db.query(CalendarEvent)
        .filter(
            CalendarEvent.user_id == user.id,
            CalendarEvent.end_date >= d,
            CalendarEvent.start_date <= d,
        )
        .order_by(CalendarEvent.all_day.desc(), CalendarEvent.start_at)
        .all()
    )
    travel = (
        db.query(TravelSpan)
        .filter(
            TravelSpan.user_id == user.id,
            TravelSpan.ignored.is_(False),
            TravelSpan.start_date <= d,
            TravelSpan.end_date >= d,
        )
        .first()
    )
    connected = (
        db.query(CalendarFeed)
        .filter(CalendarFeed.user_id == user.id, CalendarFeed.enabled.is_(True))
        .count()
        > 0
    )
    return {
        "date": d.isoformat(),
        "connected": connected,
        "travelling": travel is not None,
        "travel": travel.summary if travel else None,
        "events": [_event_out(e) for e in rows],
    }
