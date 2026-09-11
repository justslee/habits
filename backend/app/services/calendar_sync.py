"""Google Calendar travel detection without OAuth.

Google Calendar publishes a secret iCal address per calendar (Settings → Integrate
calendar → "Secret address in iCal format"). We poll it, parse VEVENTs with a small
parser (no dependency), and classify events into travel spans with a keyword
heuristic first and the LLM second when a key is configured. Spans are stored so the
owner can confirm or ignore each one; cycles subtract confirmed spans automatically.
"""

from __future__ import annotations

import datetime
import logging
import os
import re
from zoneinfo import ZoneInfo

import httpx
from sqlalchemy.orm import Session

from app.models.food import CalendarEvent, CalendarFeed, TravelSpan

logger = logging.getLogger(__name__)

TRAVEL_WORDS = re.compile(
    r"\b(flight|flights|fly|flying|trip|travel|travelling|traveling|hotel|airbnb|vacation|holiday|"
    r"airport|depart|departure|arrive|arrival|conference|offsite|off-site|wedding|visit(ing)? [A-Z])\b|✈|→",
    re.I,
)
AIRPORT = re.compile(r"\b[A-Z]{3}\s*(?:→|->|-|to)\s*[A-Z]{3}\b")
MAX_SPAN_DAYS = 21


# ---------------------------------------------------------------------------
# ICS parsing
# ---------------------------------------------------------------------------


def _unfold(text: str) -> list[str]:
    lines: list[str] = []
    for raw in text.replace("\r\n", "\n").split("\n"):
        if raw.startswith((" ", "\t")) and lines:
            lines[-1] += raw[1:]
        else:
            lines.append(raw)
    return lines


LOCAL_TZ = ZoneInfo(os.getenv("TZ", "America/New_York"))
WORKOUT_WORDS = re.compile(
    r"\b(gym|lift|lifting|workout|run|running|basketball|hoops|yoga|swim|climb|tennis|physio)\b",
    re.I,
)


def _parse_dt(
    value: str, params: str
) -> tuple[datetime.date, bool, datetime.datetime | None]:
    """→ (date, all_day, local_datetime_or_None). Zulu times are converted to the local
    zone; TZID times are converted from their zone; floating times are taken as local."""
    v = value.strip()
    if "VALUE=DATE" in params or (len(v) == 8 and v.isdigit()):
        return datetime.date(int(v[:4]), int(v[4:6]), int(v[6:8])), True, None
    m = re.match(r"(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})?(Z)?", v)
    if not m:
        raise ValueError(f"bad datetime {value}")
    dt = datetime.datetime(
        int(m[1]), int(m[2]), int(m[3]), int(m[4]), int(m[5]), int(m[6] or 0)
    )
    if m[7] == "Z":
        dt = dt.replace(tzinfo=datetime.UTC).astimezone(LOCAL_TZ).replace(tzinfo=None)
    else:
        tz = re.search(r"TZID=([^;:]+)", params)
        if tz:
            try:
                dt = (
                    dt.replace(tzinfo=ZoneInfo(tz.group(1)))
                    .astimezone(LOCAL_TZ)
                    .replace(tzinfo=None)
                )
            except Exception:  # noqa: BLE001 — unknown zone: keep wall time
                pass
    return dt.date(), False, dt


def parse_ics(text: str) -> list[dict]:
    """Minimal VEVENT parser: uid, summary, location, start, end (exclusive for all-day), all_day."""
    events: list[dict] = []
    cur: dict | None = None
    for line in _unfold(text):
        if line == "BEGIN:VEVENT":
            cur = {}
            continue
        if line == "END:VEVENT":
            if cur and "start" in cur:
                if "end" not in cur:
                    cur["end"] = cur["start"] + (
                        datetime.timedelta(days=1)
                        if cur.get("all_day")
                        else datetime.timedelta(0)
                    )
                events.append(cur)
            cur = None
            continue
        if cur is None or ":" not in line:
            continue
        head, _, value = line.partition(":")
        name, _, params = head.partition(";")
        name = name.upper()
        try:
            if name == "DTSTART":
                cur["start"], cur["all_day"], cur["start_at"] = _parse_dt(value, params)
            elif name == "DTEND":
                cur["end"], _, cur["end_at"] = _parse_dt(value, params)
            elif name == "SUMMARY":
                cur["summary"] = value.replace("\\,", ",").strip()
            elif name == "LOCATION":
                cur["location"] = value.replace("\\,", ",").strip()
            elif name == "UID":
                cur["uid"] = value.strip()
            elif name == "RRULE":
                cur["recurring"] = True
        except ValueError:
            continue
    return events


# ---------------------------------------------------------------------------
# Classification
# ---------------------------------------------------------------------------


def event_kind(ev: dict) -> str:
    if looks_like_travel(ev)[0]:
        return "travel"
    text = f"{ev.get('summary', '')} {ev.get('location', '')}"
    if WORKOUT_WORDS.search(text):
        return "workout"
    if not ev.get("all_day") and ev.get("start_at"):
        return "meeting"
    return "other"


def looks_like_travel(ev: dict) -> tuple[bool, str]:
    text = f"{ev.get('summary', '')} {ev.get('location', '')}"
    if ev.get("recurring"):
        return False, "recurring"
    days = (ev["end"] - ev["start"]).days
    if AIRPORT.search(text):
        return True, "airport codes"
    if TRAVEL_WORDS.search(text):
        return True, "travel keyword"
    if ev.get("all_day") and days >= 2 and ev.get("location"):
        return True, "multi-day event elsewhere"
    return False, "no signal"


async def classify_with_llm(events: list[dict]) -> dict[str, bool] | None:
    """Optional second opinion for ambiguous events. Returns {uid: is_travel} or None if unavailable."""
    try:
        from app.services.llm import FAST, structured_output
    except Exception:  # noqa: BLE001
        return None
    if not events:
        return {}
    listing = "\n".join(
        f"- id={e.get('uid', i)} | {e['start']}→{e['end']} | {e.get('summary', '')} | {e.get('location', '')}"
        for i, e in enumerate(events)
    )
    try:
        out = await structured_output(
            system="You classify calendar events. Travel means the person will be away from home overnight and not cooking.",
            user_prompt=f"Which of these events are travel?\n{listing}",
            tool_name="classify_travel",
            tool_description="Return the ids of events that are travel.",
            output_schema={
                "type": "object",
                "properties": {
                    "travel_ids": {"type": "array", "items": {"type": "string"}}
                },
                "required": ["travel_ids"],
            },
            model=FAST,
            max_tokens=800,
        )
        ids = set(str(x) for x in out.get("travel_ids", []))
        return {
            str(e.get("uid", i)): str(e.get("uid", i)) in ids
            for i, e in enumerate(events)
        }
    except Exception as e:  # noqa: BLE001
        logger.info("travel LLM classification skipped: %s", e)
        return None


def spans_from_events(
    events: list[dict], llm_votes: dict[str, bool] | None = None
) -> list[dict]:
    spans: list[dict] = []
    for i, ev in enumerate(events):
        days = (ev["end"] - ev["start"]).days
        if days > MAX_SPAN_DAYS or days < 0:
            continue
        is_travel, why = looks_like_travel(ev)
        uid = str(ev.get("uid", i))
        if llm_votes is not None and uid in llm_votes:
            if llm_votes[uid] and not is_travel:
                is_travel, why = True, "model"
        if not is_travel:
            continue
        end_inclusive = (
            ev["end"] - datetime.timedelta(days=1) if ev.get("all_day") else ev["end"]
        )
        if end_inclusive < ev["start"]:
            end_inclusive = ev["start"]
        spans.append(
            {
                "uid": uid,
                "start": ev["start"],
                "end": end_inclusive,
                "summary": ev.get("summary", "")[:160],
                "reason": why,
            }
        )
    return spans


# ---------------------------------------------------------------------------
# Sync
# ---------------------------------------------------------------------------


async def fetch_ics(url: str) -> str:
    async with httpx.AsyncClient(timeout=20.0, follow_redirects=True) as client:
        r = await client.get(url)
        r.raise_for_status()
        return r.text


async def sync_feed(
    db: Session, feed: CalendarFeed, *, text: str | None = None, use_llm: bool = True
) -> int:
    """Fetch, parse, classify, upsert. Returns the number of travel spans on file for the feed."""
    try:
        raw = text if text is not None else await fetch_ics(feed.url)
    except Exception as e:  # noqa: BLE001
        feed.last_error = str(e)[:300]
        db.commit()
        raise
    today = datetime.date.today()
    horizon = today + datetime.timedelta(days=120)
    events = [
        e
        for e in parse_ics(raw)
        if e["end"] >= today - datetime.timedelta(days=7) and e["start"] <= horizon
    ]
    votes = (
        await classify_with_llm([e for e in events if not looks_like_travel(e)[0]])
        if use_llm
        else None
    )
    spans = spans_from_events(events, votes)

    # 1. every event in the horizon → calendar_events (app-wide)
    have = {
        e.uid: e
        for e in db.query(CalendarEvent).filter(CalendarEvent.feed_id == feed.id).all()
    }
    seen_ev: set[str] = set()
    for i, ev in enumerate(events):
        uid = str(ev.get("uid", i))
        seen_ev.add(uid)
        end_incl = (
            ev["end"] - datetime.timedelta(days=1) if ev.get("all_day") else ev["end"]
        )
        if end_incl < ev["start"]:
            end_incl = ev["start"]
        row = have.get(uid)
        if row is None:
            row = CalendarEvent(user_id=feed.user_id, feed_id=feed.id, uid=uid)
            db.add(row)
            have[uid] = row
        row.summary = (ev.get("summary") or "")[:200] or None
        row.location = (ev.get("location") or "")[:200] or None
        row.start_date, row.end_date, row.all_day = (
            ev["start"],
            end_incl,
            bool(ev.get("all_day")),
        )
        row.start_at, row.end_at = ev.get("start_at"), ev.get("end_at")
        row.kind, row.recurring = event_kind(ev), bool(ev.get("recurring"))
    for uid, row in list(have.items()):
        if uid not in seen_ev and row.end_date >= today:
            db.delete(row)

    # 2. travel spans (what Food consumes)
    existing = {
        s.uid: s
        for s in db.query(TravelSpan).filter(TravelSpan.feed_id == feed.id).all()
    }
    seen = set()
    for sp in spans:
        seen.add(sp["uid"])
        row = existing.get(sp["uid"])
        if row is None:
            db.add(
                TravelSpan(
                    user_id=feed.user_id,
                    feed_id=feed.id,
                    uid=sp["uid"],
                    start_date=sp["start"],
                    end_date=sp["end"],
                    summary=sp["summary"],
                    reason=sp["reason"],
                )
            )
        else:
            row.start_date, row.end_date, row.summary, row.reason = (
                sp["start"],
                sp["end"],
                sp["summary"],
                sp["reason"],
            )
    for uid, row in existing.items():
        if uid not in seen and row.end_date >= today:
            db.delete(row)  # event disappeared from the calendar
    feed.last_synced_at = datetime.datetime.now(datetime.UTC).replace(tzinfo=None)
    feed.last_error = None
    db.commit()
    return db.query(TravelSpan).filter(TravelSpan.feed_id == feed.id).count()


def travel_days_between(
    db: Session, user_id: int, start: datetime.date, end: datetime.date
) -> list[datetime.date]:
    """Calendar days inside [start, end] covered by spans that are not ignored."""
    spans = (
        db.query(TravelSpan)
        .filter(
            TravelSpan.user_id == user_id,
            TravelSpan.ignored.is_(False),
            TravelSpan.end_date >= start,
            TravelSpan.start_date <= end,
        )
        .all()
    )
    days: set[datetime.date] = set()
    for s in spans:
        d = max(s.start_date, start)
        while d <= min(s.end_date, end):
            days.add(d)
            d += datetime.timedelta(days=1)
    return sorted(days)
