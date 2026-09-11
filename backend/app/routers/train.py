"""Train — the golf performance program (docs/TRAINING-GOLF.md).

GET   /api/v1/train/program            phases, current phase, lighter weeks, events, settings
GET   /api/v1/train/week?start=        the week laid out around travel and tournaments
GET   /api/v1/train/today              today's prescription (+ the session row if started)
POST  /api/v1/train/today/start        create today's WorkoutSession from the prescription
POST  /api/v1/train/sessions/{id}/complete   RPE + minutes; applies double progression
GET   /api/v1/train/log?start=         the copyable weekly log
GET/POST/DELETE /api/v1/train/events   tournaments and important rounds
PATCH /api/v1/train/settings
POST  /api/v1/train/adjust             change a day (run outside / rest / golf / swap / move / shorten,
                                       or free text the coach interprets); the week is re-planned around it
GET   /api/v1/train/adjustments?start= your active changes for the week
DELETE /api/v1/train/adjustments/{id}  undo one
"""

from __future__ import annotations

import datetime
import json

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from app.db.database import get_db
from app.models.food import CalendarEvent
from app.models.run import RunSession
from app.models.user import User
from app.models.workout import (
    ExerciseProfile,
    GolfEvent,
    TrainingAdjustment,
    TrainingSettings,
    WorkoutSession,
)
from app.services import calendar_sync
from app.services import golf_program as gp
from app.services.llm import FAST, structured_output

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


def _active_adjustments(
    db: Session, user: User, ws: datetime.date
) -> list[TrainingAdjustment]:
    return (
        db.query(TrainingAdjustment)
        .filter(
            TrainingAdjustment.user_id == user.id,
            TrainingAdjustment.reverted_at.is_(None),
            TrainingAdjustment.date >= ws,
            TrainingAdjustment.date <= ws + datetime.timedelta(days=6),
        )
        .order_by(TrainingAdjustment.id)
        .all()
    )


def _pins(db: Session, user: User, ws: datetime.date) -> dict[datetime.date, dict]:
    """Your changes as planner pins. A 'move' pins the session on its target day and frees the source."""
    pins: dict[datetime.date, dict] = {}
    for a in _active_adjustments(db, user, ws):
        params = json.loads(a.params or "{}")
        base = {"kind": a.kind, "id": a.id, **params}
        if a.kind == "move":
            target = datetime.date.fromisoformat(params["target_date"])
            pins[target] = {**base, "session": params.get("session")}
            pins[a.date] = {
                "kind": "rest",
                "id": a.id,
                "label": f"Free (moved {params.get('session')} to {target.strftime('%a')})",
            }
        else:
            pins[a.date] = base
    return pins


def _week(
    db: Session, user: User, ws: datetime.date, *, ignore_pins: bool = False
) -> list[gp.DayPlan]:
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
        pins=None if ignore_pins else _pins(db, user, ws),
        not_before=datetime.date.today(),
    )


def _runs_by_date(
    db: Session, user: User, ws: datetime.date
) -> dict[datetime.date, RunSession]:
    rows = (
        db.query(RunSession)
        .filter(
            RunSession.user_id == user.id,
            RunSession.run_date >= ws,
            RunSession.run_date <= ws + datetime.timedelta(days=6),
            RunSession.deleted_at.is_(None),
        )
        .all()
    )
    return {r.run_date: r for r in rows}


def _day_out(
    dp: gp.DayPlan,
    sessions_by_date: dict[datetime.date, WorkoutSession],
    runs_by_date: dict[datetime.date, RunSession] | None = None,
) -> dict:
    row = sessions_by_date.get(dp.date)
    run = (runs_by_date or {}).get(dp.date)
    status = row.status if row else None
    if dp.session == "RUN" and run:
        status = "completed"
    return {
        "date": dp.date.isoformat(),
        "weekday": WEEKDAYS[dp.date.weekday()],
        "session": dp.session,
        "label": dp.label,
        "travel": dp.travel,
        "note": dp.note,
        "adjusted": dp.adjusted,
        "adjustment_id": (dp.detail or {}).get("id"),
        "detail": {k: v for k, v in (dp.detail or {}).items() if k != "id"} or None,
        "status": status,
        "session_id": (row.id if row else None),
        "run_id": (run.id if run else None),
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
        "adjustments": [_adjustment_out(a) for a in _active_adjustments(db, user, ws)],
        "week_kind": "lighter"
        if gp.is_lighter_week(ws, _extra_lighter(s))
        else (
            "tournament"
            if gp.tournament_in_week(ws, _tournament_days(db, user))
            else "normal"
        ),
        "rotation": gp.rotation_week(ws),
        "phase": gp.phase_for(ws, _first_event(db, user, s)).name,
        "days": [_day_out(dp, by_date, _runs_by_date(db, user, ws)) for dp in days],
    }


def _prescription_for(db: Session, user: User, d: datetime.date) -> dict | None:
    s = _settings(db, user)
    week = _week(db, user, gp.week_start(d))
    dp = next((x for x in week if x.date == d), None)
    if dp is None or dp.session is None:
        return None
    fe = _first_event(db, user, s)
    lighter = gp.is_lighter_week(d, _extra_lighter(s))
    if dp.session == "RUN":
        p = gp.run_prescription(d, dp.detail or {}, first_event=fe, lighter=lighter)
    else:
        p = gp.prescribe(
            d,
            dp.session,
            first_event=fe,
            lighter=lighter,
            five_sessions=s.five_sessions,
            profiles=_profiles(db, user),
        )
        prev = next((x for x in week if x.date == d - datetime.timedelta(days=1)), None)
        if prev and prev.session == "RUN" and gp._big_run(prev.detail or {}):
            p = gp.after_run(p)
        if dp.adjusted == "shorten" and (dp.detail or {}).get("minutes"):
            p = gp.shorten(p, int(dp.detail["minutes"]))
    if dp.note:
        p["day_note"] = dp.note
    p["adjusted"] = dp.adjusted
    return p


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
    if p["session"] == "RUN":
        raise HTTPException(
            status_code=422,
            detail="Today is your outdoor run — log it from the run screen when you're back.",
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


# --- adjustments: change a day, re-plan the week ------------------------------

ADJUST_KINDS = ("run", "rest", "golf", "swap", "move", "shorten")

ADJUST_SCHEMA = {
    "type": "object",
    "properties": {
        "kind": {
            "type": "string",
            "enum": list(ADJUST_KINDS) + ["none"],
            "description": "run = an outdoor run instead of the gym; rest = take the day off; golf = playing golf instead; "
            "swap = do a different program session today (S1..S5); move = move today's session to another date; "
            "shorten = keep the session but cap the minutes; none = no change requested",
        },
        "date": {
            "type": "string",
            "description": "YYYY-MM-DD of the day being changed",
        },
        "miles": {"type": ["number", "null"]},
        "minutes": {
            "type": ["integer", "null"],
            "description": "run minutes, or the cap for shorten",
        },
        "intensity": {
            "type": ["string", "null"],
            "enum": ["easy", "moderate", "hard", None],
        },
        "session": {
            "type": ["string", "null"],
            "enum": ["S1", "S2", "S3", "S4", "S5", None],
        },
        "target_date": {
            "type": ["string", "null"],
            "description": "for move: YYYY-MM-DD",
        },
        "note": {"type": "string", "description": "one short line back to the athlete"},
    },
    "required": ["kind", "date", "note"],
}


class AdjustIn(BaseModel):
    date: datetime.date | None = None
    text: str | None = None  # free text; interpreted by the coach when kind is missing
    kind: str | None = None
    miles: float | None = None
    minutes: int | None = None
    intensity: str | None = None
    session: str | None = None
    target_date: datetime.date | None = None


def _adjustment_out(a: TrainingAdjustment) -> dict:
    return {
        "id": a.id,
        "date": a.date.isoformat(),
        "kind": a.kind,
        "params": json.loads(a.params or "{}"),
        "reason": a.reason,
        "summary": a.summary,
        "created_at": a.created_at.isoformat() if a.created_at else None,
    }


async def parse_adjustment(
    db: Session, user: User, text: str, d: datetime.date
) -> dict:
    """Turn 'today I'm running 6 miles instead of the gym' into a structured change."""
    week = _week(db, user, gp.week_start(d))
    plan_lines = "\n".join(
        f"  {x.date.isoformat()} {x.date.strftime('%a')}: {x.session or 'rest'} — {x.label}"
        for x in week
    )
    prompt = (
        f"Today is {d.isoformat()} ({d.strftime('%A')}). This week's plan:\n{plan_lines}\n\n"
        f"The athlete says: {text}\n\n"
        "Return the single change they are asking for. If they name no date, use today. "
        "Distances in miles; if they give time only, use minutes. 'Skip' or 'off' = rest. "
        "If they only ask a question and request no change, kind = none."
    )
    return await structured_output(
        system="You convert an athlete's message about today's training into one structured change to their plan.",
        user_prompt=prompt,
        tool_name="submit_adjustment",
        tool_description="The structured change",
        output_schema=ADJUST_SCHEMA,
        model=FAST,
        max_tokens=400,
    )


def apply_adjustment(
    db: Session,
    user: User,
    *,
    d: datetime.date,
    kind: str,
    params: dict,
    reason: str | None,
) -> tuple[TrainingAdjustment, list[str]]:
    """Record the change, replacing any active change on that date, and describe the re-planned week."""
    if kind not in ADJUST_KINDS:
        raise HTTPException(status_code=422, detail=f"Unknown adjustment kind {kind!r}")
    params = {k: v for k, v in params.items() if v is not None}
    if kind == "swap" and params.get("session") not in gp.SESSIONS:
        raise HTTPException(status_code=422, detail="swap needs a session S1–S5")
    if kind == "shorten" and not params.get("minutes"):
        raise HTTPException(status_code=422, detail="shorten needs minutes")
    ws = gp.week_start(d)
    before = _week(db, user, ws)
    if kind == "move":
        if not params.get("target_date"):
            raise HTTPException(status_code=422, detail="move needs target_date")
        src = next((x for x in before if x.date == d), None)
        if not src or src.session not in gp.SESSIONS:
            raise HTTPException(status_code=422, detail="Nothing on that day to move")
        params["session"] = src.session
        target = datetime.date.fromisoformat(str(params["target_date"]))
        if gp.week_start(target) != ws:
            raise HTTPException(status_code=422, detail="Move within the same week")
        params["target_date"] = target.isoformat()
    now = datetime.datetime.now(datetime.UTC).replace(tzinfo=None)
    for old in _active_adjustments(db, user, ws):
        if old.date == d:
            old.reverted_at = now
    row = TrainingAdjustment(
        user_id=user.id,
        date=d,
        kind=kind,
        params=json.dumps(params),
        reason=reason,
    )
    db.add(row)
    db.flush()
    after = _week(db, user, ws)
    changes = gp.describe_change(before, after)
    row.summary = " · ".join(changes)
    db.commit()
    return row, changes


def _adjust_response(
    db: Session,
    user: User,
    row: TrainingAdjustment | None,
    changes: list[str],
    note: str | None = None,
) -> dict:
    ws = gp.week_start(row.date if row else datetime.date.today())
    return {
        "adjustment": _adjustment_out(row) if row else None,
        "changes": changes,
        "note": note,
        "week": week(start=ws, db=db),
        "today": today(db=db),
    }


@router.post("/adjust")
async def adjust(payload: AdjustIn, db: Session = Depends(get_db)):
    user = _user(db)
    d = payload.date or datetime.date.today()
    if d < datetime.date.today():
        raise HTTPException(status_code=422, detail="That day is already behind you")
    kind = payload.kind
    params = {
        "miles": payload.miles,
        "minutes": payload.minutes,
        "intensity": payload.intensity,
        "session": payload.session,
        "target_date": payload.target_date.isoformat() if payload.target_date else None,
    }
    note = None
    if not kind:
        if not (payload.text or "").strip():
            raise HTTPException(status_code=422, detail="Say what you want to change")
        try:
            parsed = await parse_adjustment(db, user, payload.text.strip(), d)
        except Exception as e:  # noqa: BLE001
            raise HTTPException(
                status_code=502, detail=f"Coach unavailable: {str(e)[:200]}"
            )
        note = parsed.get("note")
        if parsed.get("kind") in (None, "none"):
            return _adjust_response(db, user, None, ["No change made."], note)
        kind = parsed["kind"]
        if parsed.get("date"):
            d = datetime.date.fromisoformat(parsed["date"])
        params = {
            "miles": parsed.get("miles"),
            "minutes": parsed.get("minutes"),
            "intensity": parsed.get("intensity"),
            "session": parsed.get("session"),
            "target_date": parsed.get("target_date"),
        }
    row, changes = apply_adjustment(
        db, user, d=d, kind=kind, params=params, reason=payload.text
    )
    return _adjust_response(db, user, row, changes, note)


@router.get("/adjustments")
def list_adjustments(start: datetime.date | None = None, db: Session = Depends(get_db)):
    user = _user(db)
    ws = gp.week_start(start or datetime.date.today())
    return [_adjustment_out(a) for a in _active_adjustments(db, user, ws)]


@router.delete("/adjustments/{adjustment_id}")
def revert_adjustment(adjustment_id: int, db: Session = Depends(get_db)):
    user = _user(db)
    row = (
        db.query(TrainingAdjustment)
        .filter(
            TrainingAdjustment.id == adjustment_id,
            TrainingAdjustment.user_id == user.id,
        )
        .first()
    )
    if not row:
        raise HTTPException(status_code=404, detail="No such change")
    ws = gp.week_start(row.date)
    before = _week(db, user, ws)
    row.reverted_at = datetime.datetime.now(datetime.UTC).replace(tzinfo=None)
    db.flush()
    after = _week(db, user, ws)
    changes = gp.describe_change(before, after)
    db.commit()
    return _adjust_response(db, user, None, changes, "Undone.")
