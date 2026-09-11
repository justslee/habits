"""Train — the golf performance program (docs/TRAINING-GOLF.md).

GET   /api/v1/train/program            phases, current phase, lighter weeks, events, settings
GET   /api/v1/train/week?start=        the week laid out around travel and tournaments
GET   /api/v1/train/today              today's prescription (+ the session row if started)
POST  /api/v1/train/today/start        create today's WorkoutSession from the prescription
POST  /api/v1/train/sessions/{id}/complete   RPE + minutes; applies double progression
GET   /api/v1/train/log?start=         the copyable weekly log
GET/POST/DELETE /api/v1/train/events   tournaments and important rounds
PATCH /api/v1/train/settings
"""

from __future__ import annotations

import datetime
import json

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from app.db.database import get_db
from app.models.food import CalendarEvent
from app.models.user import User
from app.models.workout import (
    ExerciseProfile,
    GolfEvent,
    TrainingSettings,
    WorkoutSession,
)
from app.services import calendar_sync
from app.services import golf_program as gp

router = APIRouter(prefix="/api/v1/train", tags=["train"])

WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]


def _user(db: Session) -> User:
    user = db.query(User).first()
    if not user:
        raise HTTPException(status_code=404, detail="No user found")
    return user


def _settings(db: Session, user: User) -> TrainingSettings:
    s = db.query(TrainingSettings).filter(TrainingSettings.user_id == user.id).first()
    if s is None:
        s = TrainingSettings(
            user_id=user.id, first_event_date=gp.FIRST_EVENT_DEFAULT, five_sessions=True
        )
        db.add(s)
        db.commit()
    return s


def _first_event(db: Session, user: User, s: TrainingSettings) -> datetime.date:
    nxt = (
        db.query(GolfEvent)
        .filter(
            GolfEvent.user_id == user.id,
            GolfEvent.kind == "tournament",
            GolfEvent.event_date >= gp.PROGRAM_START,
        )
        .order_by(GolfEvent.event_date)
        .first()
    )
    return nxt.event_date if nxt else (s.first_event_date or gp.FIRST_EVENT_DEFAULT)


def _tournament_days(db: Session, user: User) -> list[datetime.date]:
    return [
        e.event_date
        for e in db.query(GolfEvent)
        .filter(GolfEvent.user_id == user.id, GolfEvent.kind == "tournament")
        .all()
    ]


def _golf_days(db: Session, user: User, ws: datetime.date) -> set[datetime.date]:
    """Rounds and practice from golf_events plus calendar events that look like golf."""
    days = {
        e.event_date
        for e in db.query(GolfEvent)
        .filter(
            GolfEvent.user_id == user.id,
            GolfEvent.kind != "tournament",
            GolfEvent.event_date >= ws,
            GolfEvent.event_date <= ws + datetime.timedelta(days=6),
        )
        .all()
    }
    for e in (
        db.query(CalendarEvent)
        .filter(
            CalendarEvent.user_id == user.id,
            CalendarEvent.end_date >= ws,
            CalendarEvent.start_date <= ws + datetime.timedelta(days=6),
        )
        .all()
    ):
        if (
            "golf" in (e.summary or "").lower()
            or "tee time" in (e.summary or "").lower()
        ):
            days.add(e.start_date)
    return days


def _profiles(db: Session, user: User) -> dict[str, dict]:
    out = {}
    for p in db.query(ExerciseProfile).filter(ExerciseProfile.user_id == user.id).all():
        out[p.exercise_name.lower()] = {
            "weight": p.current_working_weight,
            "note": None
            if p.progression_status == "progressing"
            else p.progression_status,
        }
    return out


def _extra_lighter(s: TrainingSettings) -> list[datetime.date]:
    out = []
    for part in (s.extra_lighter_weeks or "").split(","):
        part = part.strip()
        if part:
            try:
                out.append(datetime.date.fromisoformat(part))
            except ValueError:
                continue
    return out


def _week(db: Session, user: User, ws: datetime.date) -> list[gp.DayPlan]:
    s = _settings(db, user)
    travel = set(
        calendar_sync.travel_days_between(
            db, user.id, ws, ws + datetime.timedelta(days=6)
        )
    )
    return gp.plan_week(
        ws,
        travel_days=travel,
        tournaments=_tournament_days(db, user),
        five_sessions=s.five_sessions,
        golf_days=_golf_days(db, user, ws),
    )


def _day_out(
    dp: gp.DayPlan, sessions_by_date: dict[datetime.date, WorkoutSession]
) -> dict:
    row = sessions_by_date.get(dp.date)
    return {
        "date": dp.date.isoformat(),
        "weekday": WEEKDAYS[dp.date.weekday()],
        "session": dp.session,
        "label": dp.label,
        "travel": dp.travel,
        "note": dp.note,
        "status": (row.status if row else None),
        "session_id": (row.id if row else None),
        "minutes": (
            row.duration_minutes if row and hasattr(row, "duration_minutes") else None
        ),
    }


# --- program -----------------------------------------------------------------


@router.get("/program")
def program(db: Session = Depends(get_db)):
    user = _user(db)
    s = _settings(db, user)
    fe = _first_event(db, user, s)
    today = datetime.date.today()
    ph = gp.phase_for(today, fe)
    lighter = gp.is_lighter_week(today, _extra_lighter(s))
    return {
        "start": gp.PROGRAM_START.isoformat(),
        "first_event": fe.isoformat(),
        "five_sessions": s.five_sessions,
        "phase": {
            "key": ph.key,
            "name": ph.name,
            "start": ph.start.isoformat(),
            "end": ph.end.isoformat(),
            "strength": ph.notes,
            "running": ph.run_note,
            "rpe": ph.rpe,
        },
        "phases": [
            {
                "key": p.key,
                "name": p.name,
                "start": p.start.isoformat(),
                "end": p.end.isoformat(),
            }
            for p in gp.phases(fe)
        ],
        "week_kind": "lighter"
        if lighter
        else (
            "tournament"
            if gp.tournament_in_week(today, _tournament_days(db, user))
            else "normal"
        ),
        "rotation": gp.rotation_week(today),
        "lighter_weeks": [
            d.isoformat()
            for d in sorted(set(gp.LIGHTER_WEEKS) | set(_extra_lighter(s)))
        ],
        "next_lighter_week": next(
            (
                d.isoformat()
                for d in sorted(set(gp.LIGHTER_WEEKS) | set(_extra_lighter(s)))
                if d >= gp.week_start(today)
            ),
            None,
        ),
        "sessions": {
            k: {
                "title": v["title"],
                "target_minutes": list(v["target_minutes"]),
                "budget": v["budget"],
            }
            for k, v in gp.SESSIONS.items()
        },
        "mobility": [{"movement": m, "dose": d} for m, d in gp.DAILY_MOBILITY],
        "banned": list(gp.BANNED),
        "spec_ok": gp.spec_check() == [],
    }


@router.get("/week")
def week(start: datetime.date | None = None, db: Session = Depends(get_db)):
    user = _user(db)
    ws = gp.week_start(start or datetime.date.today())
    days = _week(db, user, ws)
    rows = (
        db.query(WorkoutSession)
        .filter(
            WorkoutSession.user_id == user.id,
            WorkoutSession.session_date >= ws,
            WorkoutSession.session_date <= ws + datetime.timedelta(days=6),
            WorkoutSession.deleted_at.is_(None),
        )
        .all()
    )
    by_date = {r.session_date: r for r in rows}
    s = _settings(db, user)
    return {
        "week_start": ws.isoformat(),
        "week_kind": "lighter"
        if gp.is_lighter_week(ws, _extra_lighter(s))
        else (
            "tournament"
            if gp.tournament_in_week(ws, _tournament_days(db, user))
            else "normal"
        ),
        "rotation": gp.rotation_week(ws),
        "phase": gp.phase_for(ws, _first_event(db, user, s)).name,
        "days": [_day_out(dp, by_date) for dp in days],
    }


def _prescription_for(db: Session, user: User, d: datetime.date) -> dict | None:
    s = _settings(db, user)
    dp = next((x for x in _week(db, user, gp.week_start(d)) if x.date == d), None)
    if dp is None or dp.session is None:
        return None
    return gp.prescribe(
        d,
        dp.session,
        first_event=_first_event(db, user, s),
        lighter=gp.is_lighter_week(d, _extra_lighter(s)),
        five_sessions=s.five_sessions,
        profiles=_profiles(db, user),
    )


def _flatten_for_logger(p: dict) -> list[dict]:
    """The shape WorkoutScreen + LiftLogger already understand: name, sets, reps, weight, notes."""
    out = []
    for b in p.get("blocks", []):
        for e in b["exercises"]:
            out.append(
                {
                    "name": e["name"],
                    "sets": e["sets"],
                    "reps": e["reps"] + ("/side" if e.get("per_side") else ""),
                    "weight": e.get("load"),
                    "notes": e.get("notes"),
                    "kind": e.get("kind"),
                    "block": b["name"],
                    "rest": e.get("rest"),
                    "superset": e.get("superset"),
                    "rpe": e.get("rpe"),
                }
            )
    return out


@router.get("/today")
def today(db: Session = Depends(get_db)):
    user = _user(db)
    d = datetime.date.today()
    dp = next((x for x in _week(db, user, gp.week_start(d)) if x.date == d), None)
    p = _prescription_for(db, user, d)
    row = (
        db.query(WorkoutSession)
        .filter(
            WorkoutSession.user_id == user.id,
            WorkoutSession.session_date == d,
            WorkoutSession.deleted_at.is_(None),
        )
        .first()
    )
    return {
        "date": d.isoformat(),
        "day": _day_out(dp, {d: row} if row else {}) if dp else None,
        "prescription": p,
        "session_id": row.id if row else None,
        "status": row.status if row else None,
    }


@router.post("/today/start")
def start_today(db: Session = Depends(get_db)):
    user = _user(db)
    d = datetime.date.today()
    row = (
        db.query(WorkoutSession)
        .filter(
            WorkoutSession.user_id == user.id,
            WorkoutSession.session_date == d,
            WorkoutSession.deleted_at.is_(None),
        )
        .first()
    )
    if row:
        return {"session_id": row.id, "status": row.status, "created": False}
    p = _prescription_for(db, user, d)
    if not p:
        raise HTTPException(
            status_code=422, detail="Nothing scheduled today — rest, golf or mobility."
        )
    plan = {**p, "exercises": _flatten_for_logger(p)}
    row = WorkoutSession(
        user_id=user.id,
        session_date=d,
        day_type=p["session"],
        ai_plan=json.dumps(plan),
        coach_notes=f"{p['title']} · {p['phase_name']} · {p['week_kind']} week · target {p['target_minutes'][0]}–{p['target_minutes'][1]} min",
        status="planned",
    )
    db.add(row)
    db.commit()
    return {"session_id": row.id, "status": row.status, "created": True}


class CompleteIn(BaseModel):
    overall_rpe: int | None = Field(default=None, ge=1, le=10)
    minutes: int | None = Field(default=None, ge=1, le=240)
    notes: str | None = None


@router.post("/sessions/{session_id}/complete")
def complete(session_id: int, payload: CompleteIn, db: Session = Depends(get_db)):
    """Close the session and apply double progression per prescribed exercise."""
    user = _user(db)
    row = (
        db.query(WorkoutSession)
        .filter(WorkoutSession.id == session_id, WorkoutSession.user_id == user.id)
        .first()
    )
    if not row:
        raise HTTPException(status_code=404, detail="Session not found")
    plan = json.loads(row.ai_plan) if row.ai_plan else {}
    logged: dict[str, list[dict]] = {}
    for e in row.exercises:
        if e.deleted_at:
            continue
        logged.setdefault(e.exercise_name.lower(), []).append(
            {"weight": e.weight, "reps": e.reps, "rpe": e.rpe, "is_warmup": e.is_warmup}
        )
    decisions = []
    for ex in plan.get("exercises", []):
        sets = logged.get(ex["name"].lower())
        if not sets or ex.get("kind") not in ("main", "accessory"):
            continue
        prescribed = {
            "name": ex["name"],
            "sets": ex["sets"],
            "reps": str(ex["reps"]).replace("/side", ""),
        }
        nxt = gp.progression_after(prescribed, sets)
        if not nxt:
            continue
        prof = (
            db.query(ExerciseProfile)
            .filter(
                ExerciseProfile.user_id == user.id,
                ExerciseProfile.exercise_name == ex["name"],
            )
            .first()
        )
        if prof is None:
            prof = ExerciseProfile(
                user_id=user.id, exercise_name=ex["name"], muscle_group="golf"
            )
            db.add(prof)
        prof.current_working_weight = nxt["weight"]
        prof.progression_status = (
            "progressing"
            if "+" in nxt["note"]
            else ("stalled" if "missed" in nxt["note"] else "progressing")
        )
        prof.last_progression_date = row.session_date
        decisions.append({"exercise": ex["name"], **nxt})
    row.status = "completed"
    if payload.overall_rpe is not None:
        row.overall_rpe = payload.overall_rpe
    if payload.minutes is not None:
        row.coach_notes = (row.coach_notes or "") + f" · {payload.minutes} min"
        if payload.minutes > gp.MAX_MINUTES:
            decisions.append(
                {
                    "exercise": "session",
                    "note": f"{payload.minutes} min is over the 70-min cap — next time omit the last accessory set, not the warm-up",
                }
            )
    if payload.notes:
        row.coach_notes = (row.coach_notes or "") + f" · {payload.notes}"
    db.commit()
    return {"session_id": row.id, "status": row.status, "progression": decisions}


# --- weekly log --------------------------------------------------------------


@router.get("/log")
def weekly_log(start: datetime.date | None = None, db: Session = Depends(get_db)):
    user = _user(db)
    ws = gp.week_start(start or datetime.date.today())
    wk = week(ws, db)
    rows = {
        r.session_date: r
        for r in db.query(WorkoutSession)
        .filter(
            WorkoutSession.user_id == user.id,
            WorkoutSession.session_date >= ws,
            WorkoutSession.session_date <= ws + datetime.timedelta(days=6),
            WorkoutSession.deleted_at.is_(None),
        )
        .all()
    }
    s = _settings(db, user)
    nxt = (
        db.query(GolfEvent)
        .filter(GolfEvent.user_id == user.id, GolfEvent.event_date >= ws)
        .order_by(GolfEvent.event_date)
        .first()
    )
    lines = [
        f"Week of: {ws.isoformat()}",
        f"Current phase: {wk['phase']} ({wk['week_kind']} week, rotation {wk['rotation']})",
        f"Next tournament / important round: {nxt.name + ' · ' + nxt.event_date.isoformat() if nxt else '—'}",
        "",
    ]
    for sid in ("S1", "S2", "S3", "S4", "S5"):
        day = next((x for x in wk["days"] if x["session"] == sid), None)
        row = rows.get(datetime.date.fromisoformat(day["date"])) if day else None
        done = "x" if row and row.status == "completed" else " "
        mins = ""
        if row and row.coach_notes and " min" in row.coach_notes:
            mins = row.coach_notes.split("·")[-1].strip()
        mains = ""
        if row:
            for e in row.exercises:
                if not e.is_warmup and e.weight and e.reps:
                    mains += f"{e.exercise_name} {e.weight:.0f}×{e.reps} "
                    if len(mains) > 80:
                        break
        lines.append(
            f"[{done}] {'Optional 5' if sid == 'S5' else 'Session ' + sid[1]}   {day['weekday'] if day else '—'}   Minutes: {mins:<8} {mains.strip()}"
        )
    lines += [
        "",
        "Mobility days completed:",
        "Golf practice / rounds:",
        "Sleep, soreness and energy:",
        "What improved:",
        "Next week's one progression or recovery adjustment:",
    ]
    return {
        "week_start": ws.isoformat(),
        "text": "\n".join(lines),
        "five_sessions": s.five_sessions,
    }


# --- events & settings -------------------------------------------------------


class EventIn(BaseModel):
    event_date: datetime.date
    end_date: datetime.date | None = None
    name: str = Field(min_length=1, max_length=120)
    kind: str = Field(default="tournament", pattern="^(tournament|round|practice)$")
    notes: str | None = None


@router.get("/events")
def list_events(db: Session = Depends(get_db)):
    user = _user(db)
    rows = (
        db.query(GolfEvent)
        .filter(GolfEvent.user_id == user.id)
        .order_by(GolfEvent.event_date)
        .all()
    )
    return [
        {
            "id": e.id,
            "event_date": e.event_date.isoformat(),
            "end_date": e.end_date.isoformat() if e.end_date else None,
            "name": e.name,
            "kind": e.kind,
            "notes": e.notes,
        }
        for e in rows
    ]


@router.post("/events")
def add_event(payload: EventIn, db: Session = Depends(get_db)):
    user = _user(db)
    e = GolfEvent(user_id=user.id, **payload.model_dump())
    db.add(e)
    db.commit()
    return {
        "id": e.id,
        "event_date": e.event_date.isoformat(),
        "name": e.name,
        "kind": e.kind,
    }


@router.delete("/events/{event_id}")
def delete_event(event_id: int, db: Session = Depends(get_db)):
    user = _user(db)
    e = (
        db.query(GolfEvent)
        .filter(GolfEvent.id == event_id, GolfEvent.user_id == user.id)
        .first()
    )
    if not e:
        raise HTTPException(status_code=404, detail="Event not found")
    db.delete(e)
    db.commit()
    return {"deleted": True}


class SettingsIn(BaseModel):
    first_event_date: datetime.date | None = None
    five_sessions: bool | None = None
    extra_lighter_weeks: list[datetime.date] | None = None


@router.patch("/settings")
def patch_settings(payload: SettingsIn, db: Session = Depends(get_db)):
    user = _user(db)
    s = _settings(db, user)
    if payload.first_event_date is not None:
        s.first_event_date = payload.first_event_date
    if payload.five_sessions is not None:
        s.five_sessions = payload.five_sessions
    if payload.extra_lighter_weeks is not None:
        s.extra_lighter_weeks = ",".join(
            gp.week_start(d).isoformat() for d in payload.extra_lighter_weeks
        )
    db.commit()
    return {
        "first_event_date": s.first_event_date.isoformat()
        if s.first_event_date
        else None,
        "five_sessions": s.five_sessions,
        "extra_lighter_weeks": _extra_lighter(s),
    }
