"""A session can change in any way, during it or after: sets past the plan, a set's numbers,
movements added, swapped or removed. Edits to a finished session re-run its progression."""

import datetime
import json

import pytest
from httpx import ASGITransport, AsyncClient

from app.main import app
from app.models.workout import ExerciseLog, ExerciseProfile, WorkoutSession
from app.services import golf_program as gp

SQUAT = "Goblet squat"
ROW = "Chest-supported row"


def _client():
    return AsyncClient(transport=ASGITransport(app=app), base_url="http://test")


def _session(db, day=datetime.date(2026, 10, 12), plan=True):
    row = WorkoutSession(
        user_id=1,
        session_date=day,
        day_type="S1",
        status="planned",
        ai_plan=json.dumps(
            {
                "session": "S1",
                "exercises": [
                    {
                        "name": SQUAT,
                        "sets": 3,
                        "reps": "8-10",
                        "weight": 100,
                        "kind": "main",
                    },
                    {
                        "name": ROW,
                        "sets": 3,
                        "reps": "10-12",
                        "weight": 60,
                        "kind": "accessory",
                    },
                ],
            }
        )
        if plan
        else None,
    )
    db.add(row)
    db.commit()
    return row.id


async def _log(client, sid, name, n, weight=100, reps=10, rpe=7):
    r = await client.post(
        f"/api/v1/workouts/{sid}/exercises",
        json={
            "exercise_name": name,
            "set_number": n,
            "weight": weight,
            "reps": reps,
            "rpe": rpe,
        },
    )
    assert r.status_code == 200, r.text
    return r.json()


def _sets(session, name):
    return [
        (e["set_number"], e["weight"], e["reps"])
        for e in session["exercises"]
        if e["exercise_name"] == name
    ]


def _plan_names(session):
    return [e["name"] for e in json.loads(session["ai_plan"])["exercises"]]


@pytest.mark.asyncio
async def test_sets_past_the_plan_are_kept_and_count_toward_progression(db_session):
    sid = _session(db_session)
    async with _client() as client:
        for n in range(1, 5):  # the plan says 3
            await _log(client, sid, SQUAT, n)
        session = (await client.get(f"/api/v1/workouts/{sid}")).json()
        assert _sets(session, SQUAT) == [(n, 100, 10) for n in range(1, 5)]
        done = (
            await client.post(f"/api/v1/train/sessions/{sid}/complete", json={})
        ).json()
    squat = next(p for p in done["progression"] if p["exercise"] == SQUAT)
    assert squat["weight"] == 100 + gp.increment_for(SQUAT)


@pytest.mark.asyncio
async def test_a_set_can_be_changed_or_removed(db_session):
    sid = _session(db_session)
    async with _client() as client:
        logged = [
            await _log(client, sid, SQUAT, n, weight=95 + 5 * n) for n in (1, 2, 3)
        ]
        r = await client.patch(
            f"/api/v1/workouts/{sid}/exercises/{logged[1]['id']}", json={"reps": 6}
        )
        assert _sets(r.json(), SQUAT)[1] == (2, 105, 6)
        r = await client.delete(f"/api/v1/workouts/{sid}/exercises/{logged[0]['id']}")
        # the rest are numbered from 1 again, numbers kept
        assert _sets(r.json(), SQUAT) == [(1, 105, 6), (2, 110, 10)]
        assert (
            await client.delete(f"/api/v1/workouts/{sid}/exercises/{logged[0]['id']}")
        ).status_code == 404
    assert db_session.query(ExerciseLog).count() == 2


@pytest.mark.asyncio
async def test_movements_can_be_added_swapped_retargeted_and_removed(db_session):
    sid = _session(db_session)
    async with _client() as client:
        r = await client.post(
            f"/api/v1/workouts/{sid}/movements",
            json={"name": "Face pull", "sets": 3, "reps": "12"},
        )
        assert _plan_names(r.json()) == [SQUAT, ROW, "Face pull"]
        assert (
            await client.post(
                f"/api/v1/workouts/{sid}/movements", json={"name": "face pull"}
            )
        ).status_code == 422
        await _log(client, sid, "Face pull", 1, weight=30, reps=12)

        # swap it: the plan entry and its logged sets follow the new name
        r = await client.patch(
            f"/api/v1/workouts/{sid}/movements",
            json={
                "name": "Face pull",
                "new_name": "Band pull-apart",
                "sets": 4,
                "reps": "15",
            },
        )
        session = r.json()
        added = json.loads(session["ai_plan"])["exercises"][-1]
        assert (
            added["name"] == "Band pull-apart"
            and added["sets"] == 4
            and added["reps"] == "15"
        )
        assert _sets(session, "Band pull-apart") == [(1, 30, 12)]
        clash = await client.patch(
            f"/api/v1/workouts/{sid}/movements",
            json={"name": "Band pull-apart", "new_name": SQUAT},
        )
        assert clash.status_code == 422

        # a planned movement can go too, with its sets
        await _log(client, sid, ROW, 1, weight=60, reps=12)
        r = await client.delete(
            f"/api/v1/workouts/{sid}/movements", params={"name": ROW}
        )
        assert _plan_names(r.json()) == [SQUAT, "Band pull-apart"]
        assert _sets(r.json(), ROW) == []
        missing = await client.delete(
            f"/api/v1/workouts/{sid}/movements", params={"name": "Nope"}
        )
        assert missing.status_code == 404


@pytest.mark.asyncio
async def test_a_session_without_a_plan_edits_by_what_was_logged(db_session):
    sid = _session(db_session, plan=False)
    async with _client() as client:
        await _log(client, sid, "Bench press", 1, weight=135, reps=8)
        r = await client.patch(
            f"/api/v1/workouts/{sid}/movements",
            json={"name": "Bench press", "new_name": "Incline bench press"},
        )
        assert r.json()["ai_plan"] is None  # renaming alone doesn't invent a plan
        assert _sets(r.json(), "Incline bench press") == [(1, 135, 8)]
        r = await client.patch(
            f"/api/v1/workouts/{sid}/movements",
            json={"name": "Incline bench press", "sets": 3},
        )
        assert _plan_names(r.json()) == ["Incline bench press"]


@pytest.mark.asyncio
async def test_editing_a_finished_session_updates_the_next_load(db_session):
    sid = _session(db_session)
    async with _client() as client:
        logged = [await _log(client, sid, SQUAT, n) for n in (1, 2, 3)]
        await client.post(f"/api/v1/train/sessions/{sid}/complete", json={})
        prof = lambda: (  # noqa: E731
            db_session.query(ExerciseProfile)
            .filter(ExerciseProfile.exercise_name == SQUAT)
            .one()
        )
        assert prof().current_working_weight == 100 + gp.increment_for(SQUAT)

        # the last set was really 7 reps: below the range, so the load holds
        await client.patch(
            f"/api/v1/workouts/{sid}/exercises/{logged[2]['id']}", json={"reps": 7}
        )
        db_session.expire_all()
        assert prof().current_working_weight == 100
        assert prof().progression_status == "stalled"

        # adding a set to a finished session keeps it finished
        await _log(client, sid, SQUAT, 4, reps=10)
        assert (await client.get(f"/api/v1/workouts/{sid}")).json()[
            "status"
        ] == "completed"


@pytest.mark.asyncio
async def test_editing_an_older_session_leaves_a_newer_decision_alone(db_session):
    older = _session(db_session, day=datetime.date(2026, 10, 12))
    newer = _session(db_session, day=datetime.date(2026, 10, 15))
    async with _client() as client:
        old_sets = [await _log(client, older, SQUAT, n, reps=8) for n in (1, 2, 3)]
        await client.post(f"/api/v1/train/sessions/{older}/complete", json={})
        for n in (1, 2, 3):
            await _log(client, newer, SQUAT, n, reps=10)
        await client.post(f"/api/v1/train/sessions/{newer}/complete", json={})
        bumped = 100 + gp.increment_for(SQUAT)

        await client.patch(
            f"/api/v1/workouts/{older}/exercises/{old_sets[0]['id']}", json={"reps": 5}
        )
    db_session.expire_all()
    prof = (
        db_session.query(ExerciseProfile)
        .filter(ExerciseProfile.exercise_name == SQUAT)
        .one()
    )
    assert prof.current_working_weight == bumped
    assert prof.last_progression_date == datetime.date(2026, 10, 15)
