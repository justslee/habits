"""The golf program: phases, week planning around travel and tournaments, doses, progression, API."""

import datetime

import pytest
from httpx import ASGITransport, AsyncClient

from app.main import app
from app.services import golf_program as gp

D = datetime.date


def _client():
    return AsyncClient(transport=ASGITransport(app=app), base_url="http://test")


def test_spec_has_nothing_banned_and_five_sessions():
    assert gp.spec_check() == []
    assert set(gp.SESSIONS) == {"S1", "S2", "S3", "S4", "S5"}
    assert all(v["target_minutes"][1] <= gp.MAX_MINUTES for v in gp.SESSIONS.values())


def test_phases_follow_the_calendar_and_the_first_event():
    fe = D(2027, 5, 1)
    assert gp.phase_for(D(2026, 9, 15), fe).key == "baseline"
    assert gp.phase_for(D(2026, 10, 15), fe).key == "build"
    assert gp.phase_for(D(2026, 12, 1), fe).key == "strength"
    assert gp.phase_for(D(2027, 1, 20), fe).key == "consolidate"
    assert gp.phase_for(D(2027, 2, 20), fe).key == "golf_power"
    assert gp.phase_for(D(2027, 4, 10), fe).key == "pre_event", (
        "pre-event starts 5 weeks before the real first event"
    )
    assert gp.phase_for(D(2027, 5, 15), fe).key == "in_season"


def test_lighter_weeks_and_rotation():
    assert gp.is_lighter_week(D(2026, 9, 30)) and not gp.is_lighter_week(D(2026, 10, 7))
    assert gp.is_lighter_week(D(2026, 11, 4))
    assert (
        gp.rotation_week(D(2026, 9, 8)) == "A"
        and gp.rotation_week(D(2026, 9, 15)) == "B"
        and gp.rotation_week(D(2026, 9, 22)) == "A"
    )


def test_week_plan_default_and_around_travel():
    ws = D(2026, 10, 5)  # Monday
    plain = gp.plan_week(ws, travel_days=set(), tournaments=[])
    assert [d.session for d in plain] == ["S1", "S2", None, "S3", "S5", "S4", None]
    # away Mon–Wed: S1 and S2 move, lower-body sessions stay 48 h apart, travel days get mobility
    travel = {ws, ws + datetime.timedelta(days=1), ws + datetime.timedelta(days=2)}
    moved = gp.plan_week(ws, travel_days=travel, tournaments=[])
    assert all(d.session == "MOB" for d in moved[:3])
    sessions = {
        d.session: d.date for d in moved if d.session and d.session.startswith("S")
    }
    assert "S1" in sessions and "S3" in sessions
    assert abs((sessions["S1"] - sessions["S3"]).days) >= 2
    assert not any(d.session and d.session.startswith("S") for d in moved[:3])
    # a whole week away: nothing but mobility, and no catch-up
    away = gp.plan_week(
        ws,
        travel_days=set(ws + datetime.timedelta(days=i) for i in range(7)),
        tournaments=[],
    )
    assert all(d.session == "MOB" for d in away)
    # four-session week has no S5
    four = gp.plan_week(ws, travel_days=set(), tournaments=[], five_sessions=False)
    assert "S5" not in [d.session for d in four]


def test_tournament_week_uses_the_taper_template():
    ws = D(2026, 10, 5)
    sat = ws + datetime.timedelta(days=5)
    wk = gp.plan_week(ws, travel_days=set(), tournaments=[sat])
    assert [d.session for d in wk] == [
        "T-strength",
        "T-easy",
        "T-primer",
        "T-walk",
        "T-rest",
        "T-event",
        "T-event",
    ]
    p = gp.prescribe(ws, "T-strength")
    assert (
        p["week_kind"] == "tournament"
        and p["blocks"][0]["exercises"][0]["name"] == "Trap-bar deadlift"
        and p["blocks"][0]["exercises"][0]["sets"] == 2
    )


def test_doses_by_phase_and_lighter_week():
    # reference (Nov–Jan): trap bar 4 × 4–5
    ref = gp.prescribe(D(2026, 11, 16), "S1", lighter=False)
    tb = ref["blocks"][1]["exercises"][0]
    assert tb["name"] == "Trap-bar deadlift" and tb["sets"] == 4 and tb["reps"] == "4–5"
    # September: 2 sets of 6–8 at RPE 6–7, accessories 2, power 2
    sep = gp.prescribe(D(2026, 9, 14), "S1", lighter=False)
    assert (
        sep["blocks"][1]["exercises"][0]["sets"] == 2
        and sep["blocks"][1]["exercises"][0]["reps"] == "6–8"
        and sep["blocks"][1]["exercises"][0]["rpe"] == "6–7"
    )
    assert sep["blocks"][0]["exercises"][0]["sets"] == 2, (
        "power sets capped at 2 in September"
    )
    assert sep["blocks"][2]["exercises"][1]["sets"] == 2, "accessories stay at 2"
    # lighter week: sets cut, RPE 6–7, power halved, run easy
    light = gp.prescribe(D(2026, 12, 8), "S1", lighter=True)
    assert (
        light["blocks"][1]["exercises"][0]["sets"] == 2
        and light["blocks"][0]["exercises"][0]["sets"] == 1
    )
    assert light["week_kind"] == "lighter"
    run_light = gp.prescribe(D(2026, 12, 8), "S2", lighter=True)["run"]
    assert run_light["intervals"] == 0
    # golf power: main 3 × 3–5
    gpw = gp.prescribe(D(2027, 2, 10), "S3", lighter=False)
    assert (
        gpw["blocks"][1]["exercises"][0]["reps"] == "3–5"
        and gpw["blocks"][1]["exercises"][0]["sets"] == 3
    )
    # accessory rotation alternates weekly
    a = gp.prescribe(D(2026, 11, 16), "S1", lighter=False)["blocks"][2]["exercises"][0][
        "name"
    ]
    b = gp.prescribe(D(2026, 11, 23), "S1", lighter=False)["blocks"][2]["exercises"][0][
        "name"
    ]
    assert {a, b} == {"Bulgarian split squat", "Single-leg RDL"}
    # four-session S4 keeps jump + rotation and adds the easy run
    s4 = gp.prescribe(D(2026, 11, 21), "S4", lighter=False, five_sessions=False)
    assert (
        len(s4["blocks"][0]["exercises"]) == 2
        and s4["run"]["intervals"] == 0
        and s4["run"]["minutes"] == 18
    )
    # run structure by phase
    assert gp.prescribe(D(2026, 10, 13), "S2", lighter=False)["run"]["intervals"] == 4
    assert gp.prescribe(D(2026, 11, 17), "S2", lighter=False)["run"]["intervals"] == 6


def test_double_progression():
    ex = {"name": "Trap-bar deadlift", "sets": 4, "reps": "4–5"}
    hit = [{"weight": 185, "reps": 5, "rpe": 8}] * 4
    assert gp.progression_after(ex, hit) == {
        "weight": 195.0,
        "note": "all sets hit 5 with reps left → +10 lb, back to 4",
    }
    partial = [
        {"weight": 185, "reps": 5, "rpe": 8},
        {"weight": 185, "reps": 5, "rpe": 8},
        {"weight": 185, "reps": 4, "rpe": 8},
        {"weight": 185, "reps": 4, "rpe": 8},
    ]
    assert gp.progression_after(ex, partial)["weight"] == 185
    missed = [{"weight": 185, "reps": 3, "rpe": 9}] * 4
    assert "missed" in gp.progression_after(ex, missed)["note"]
    upper = {"name": "DB bench press", "sets": 3, "reps": "6–8"}
    assert (
        gp.progression_after(upper, [{"weight": 60, "reps": 8, "rpe": 7}] * 3)["weight"]
        == 65.0
    )


@pytest.mark.asyncio
async def test_train_api_week_today_start_complete_and_log(db_session):
    async with _client() as client:
        prog = (await client.get("/api/v1/train/program")).json()
        assert prog["spec_ok"] and prog["phase"]["key"] in {
            p["key"] for p in prog["phases"]
        }
        wk = (await client.get("/api/v1/train/week?start=2026-11-16")).json()
        assert [d["session"] for d in wk["days"]] == [
            "S1",
            "S2",
            None,
            "S3",
            "S5",
            "S4",
            None,
        ]
        # a tournament flips the week to the taper
        await client.post(
            "/api/v1/train/events",
            json={"event_date": "2026-11-21", "name": "Club championship"},
        )
        wk2 = (await client.get("/api/v1/train/week?start=2026-11-16")).json()
        assert (
            wk2["week_kind"] == "tournament"
            and wk2["days"][0]["session"] == "T-strength"
        )
        assert (await client.get("/api/v1/train/program")).json()[
            "first_event"
        ] == "2026-11-21", "the earliest tournament drives the phases"
        # today: either a session (start it, log, complete) or a rest day
        t = (await client.get("/api/v1/train/today")).json()
        if t["prescription"]:
            started = (await client.post("/api/v1/train/today/start")).json()
            assert started["created"] is True
            sid = started["session_id"]
            # Some sessions (the optional fifth) are a run and mobility with no lifting blocks.
            first_lift = next(
                (
                    e
                    for b in t["prescription"]["blocks"]
                    for e in b["exercises"]
                    if e["kind"] in ("main", "accessory")
                ),
                None,
            )
            if first_lift:
                lo, hi = gp.parse_reps(first_lift["reps"])
                for n in range(1, first_lift["sets"] + 1):
                    await client.post(
                        f"/api/v1/workouts/{sid}/exercises",
                        json={
                            "exercise_name": first_lift["name"],
                            "set_number": n,
                            "weight": 100,
                            "reps": hi,
                            "rpe": 7,
                        },
                    )
            done = (
                await client.post(
                    f"/api/v1/train/sessions/{sid}/complete",
                    json={"overall_rpe": 7, "minutes": 66},
                )
            ).json()
            assert done["status"] == "completed"
            if first_lift:
                assert any(
                    p["exercise"] == first_lift["name"] and p["weight"] > 100
                    for p in done["progression"]
                ), "top of the range on every set → load goes up"
        else:
            assert (await client.post("/api/v1/train/today/start")).status_code == 422
        log = (await client.get("/api/v1/train/log?start=2026-11-16")).json()
        assert "Week of: 2026-11-16" in log["text"] and "Session 1" in log["text"]
        st = (
            await client.patch("/api/v1/train/settings", json={"five_sessions": False})
        ).json()
        assert st["five_sessions"] is False
