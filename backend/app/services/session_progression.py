"""Double progression for one golf-programme session (docs: golf_program.progression_after).

Runs when a session is finished, and again whenever a finished session is edited, so a
corrected set feeds the next prescription. It only moves an exercise's profile when this
session is that exercise's latest progression: editing an old session never overwrites
what a newer one decided. Re-running on the same sets gives the same answer.
"""

from __future__ import annotations

import json

from sqlalchemy.orm import Session

from app.models.workout import ExerciseProfile, WorkoutSession
from app.services import golf_program as gp


def apply_progression(db: Session, user_id: int, row: WorkoutSession) -> list[dict]:
    """Decide the next load for each prescribed main/accessory lift in `row` and store it on
    the exercise profile. Returns the decisions ({exercise, weight, note}). No commit."""
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
                ExerciseProfile.user_id == user_id,
                ExerciseProfile.exercise_name == ex["name"],
            )
            .first()
        )
        if prof is None:
            prof = ExerciseProfile(
                user_id=user_id, exercise_name=ex["name"], muscle_group="golf"
            )
            db.add(prof)
        elif (
            prof.last_progression_date and prof.last_progression_date > row.session_date
        ):
            continue  # a newer session already set this lift's next load
        prof.current_working_weight = nxt["weight"]
        prof.progression_status = (
            "progressing"
            if "+" in nxt["note"]
            else ("stalled" if "missed" in nxt["note"] else "progressing")
        )
        prof.last_progression_date = row.session_date
        decisions.append({"exercise": ex["name"], **nxt})
    return decisions
