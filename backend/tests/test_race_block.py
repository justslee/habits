"""The half-marathon block: a race on the calendar reshapes the ten weeks before it, the taper,
race week and recovery, then hands back to the golf phases (docs/TRAINING-GOLF.md §12)."""

import datetime

import pytest
from httpx import ASGITransport, AsyncClient

from app.main import app
from app.models.run import RunSession
from app.services import golf_program as gp

D = datetime.date
WEEK = datetime.timedelta(weeks=1)
FE = D(2027, 4, 24)
RACE = gp.Race(D(2027, 1, 10), "Half marathon")  # a Sunday
TRAVEL = {D(2026, 12, 31), D(2027, 1, 1)} | {
    D(2027, 1, 13) + datetime.timedelta(days=i) for i in range(4)
}


def _week(ws, **kw):
    kw.setdefault("travel_days", set())
    return gp.plan_week(ws, tournaments=[], race=RACE, **kw)


def test_without_a_race_nothing_changes():
    assert gp.phases(FE) == gp.phases(FE, None)
    assert gp.lighter_weeks() == gp.LIGHTER_WEEKS
    assert [
        d.session
        for d in gp.plan_week(D(2026, 11, 16), travel_days=set(), tournaments=[])
    ] == [
        "S1",
        "S2",
        None,
        "S3",
        "S5",
        "S4",
        None,
    ]


def test_race_phases_and_lighter_weeks():
    ps = {p.key: p for p in gp.phases(FE, RACE)}
    assert list(ps) == [
        "baseline",
        "build",
        "race_build",
        "race_taper",
        "race_recover",
        "return",
        "strength",
        "golf_power",
        "pre_event",
        "in_season",
    ]
    assert (ps["build"].end, ps["race_build"].start) == (
        D(2026, 10, 25),
        D(2026, 10, 26),
    )
    assert (ps["race_taper"].start, ps["race_taper"].end) == (
        D(2026, 12, 28),
        RACE.date,
    )
    assert (ps["race_recover"].start, ps["race_recover"].end) == (
        D(2027, 1, 11),
        D(2027, 1, 17),
    )
    assert (ps["return"].start, ps["strength"].start, ps["golf_power"].start) == (
        D(2027, 1, 18),
        D(2027, 1, 25),
        D(2027, 2, 15),
    )
    assert ps["pre_event"].start == FE - 5 * WEEK, (
        "the golf season end of the plan is untouched"
    )
    # consecutive phases, no gaps
    seq = gp.phases(FE, RACE)
    assert all(
        b.start == a.end + datetime.timedelta(days=1) for a, b in zip(seq, seq[1:])
    )
    assert (
        "Nov 16 and Dec 14" in ps["race_build"].run_note
        and "Dec 26" in ps["race_build"].run_note
    )
    # the block's own cutback weeks replace the golf calendar's lighter weeks inside it
    assert gp.lighter_weeks(RACE) == [
        D(2026, 9, 28),
        D(2026, 11, 16),
        D(2026, 12, 14),
        D(2027, 1, 11),
        D(2027, 2, 15),
    ]
    # a Saturday race shifts race day, not the weeks
    sat = gp.Race(D(2027, 1, 9))
    sp = {p.key: p for p in gp.phases(FE, sat)}
    assert sp["race_build"].start == D(2026, 10, 26)
    assert (sp["race_taper"].end, sp["race_recover"].start) == (
        D(2027, 1, 9),
        D(2027, 1, 10),
    )


def test_build_weeks_three_runs_two_lifts():
    wk = _week(D(2026, 10, 26))
    assert [d.session for d in wk] == ["S1", "RUN", "RUN", "S2", None, "RUN", None]
    assert [d.label for d in wk if d.session == "RUN"] == [
        "Easy run · 30 min",
        "Steady finish · 30 min",
        "Long run · 5 mi",
    ]
    assert wk[3].label == "Rotational power and upper body", (
        "S2 has no run block in the race block"
    )
    assert all(
        d.detail == {"planned": True, "run": r}
        for d, r in zip([wk[1], wk[2], wk[5]], "EQL")
    )

    longs, kinds = [], []
    ws = D(2026, 10, 26)
    while ws < D(2026, 12, 28):
        sat = next(d for d in _week(ws) if d.date.weekday() == 5)
        longs.append(float(sat.label.split(" · ")[1].removesuffix(" mi")))
        kinds.append(gp.week_kind(ws, race=RACE))
        ws += WEEK
    assert longs == [5, 6, 7, 5, 8, 9, 10, 7, 11]
    assert all(b <= max(longs[: i + 1]) + 1 for i, b in enumerate(longs[1:])), (
        "the long run never jumps more than a mile past the longest so far"
    )
    assert kinds[3] == kinds[7] == "lighter" and kinds.count("lighter") == 2


def test_four_session_weeks_drop_the_easy_run():
    wk = _week(D(2026, 11, 2), five_sessions=False)
    assert [d.session for d in wk] == ["S1", None, "RUN", "S2", None, "RUN", None]


def test_lost_days_keep_the_hard_runs_apart():
    ws = D(2026, 11, 2)
    # away Saturday: the long run moves to Friday, 48 h after Wednesday's quality run
    wk = _week(ws, travel_days={ws + datetime.timedelta(days=5)})
    fri = wk[4]
    assert (
        fri.session == "RUN"
        and fri.label.startswith("Long run")
        and fri.note == "moved around travel"
    )
    # away Wednesday: no day 48 h clear of the long run, so the quality run is dropped, never stacked
    wk = _week(ws, travel_days={ws + datetime.timedelta(days=2)})
    assert [d.label.split(" · ")[0] for d in wk if d.session == "RUN"] == [
        "Easy run",
        "Long run",
    ]
    assert any("dropped the quality run" in (d.note or "") for d in wk)


def test_a_planned_run_can_be_moved_and_an_outdoor_run_covers_the_easy_run():
    ws = D(2026, 11, 2)
    sat, sun = ws + datetime.timedelta(days=5), ws + datetime.timedelta(days=6)
    wk = _week(
        ws,
        pins={
            sat: {"kind": "rest", "label": "Free (moved the long run to Sun)"},
            sun: {
                "kind": "move",
                "session": "L",
                "target_date": sun.isoformat(),
                "from_date": sat.isoformat(),
            },
        },
    )
    assert (
        wk[5].adjusted == "rest"
        and wk[6].label == "Long run · 6 mi"
        and wk[6].adjusted == "move"
    )
    # an outdoor run you chose instead of Monday's lifting: Session 1 moves, the easy run goes
    wk = _week(ws, pins={ws: {"kind": "run", "miles": 4}}, not_before=ws)
    assert wk[0].session == "RUN" and wk[0].adjusted == "run"
    assert "S1" in [d.session for d in wk]
    assert not any(d.label.startswith("Easy run") for d in wk)
    assert any("The easy run dropped this week" in (d.note or "") for d in wk)


def test_taper_race_and_recovery_weeks_follow_the_template():
    taper = _week(D(2026, 12, 28), travel_days=TRAVEL)
    assert [(d.session, d.label) for d in taper] == [
        ("S1", gp.SESSIONS["S1"]["title"]),
        ("RUN", "Race-effort run · 38 min"),
        ("RUN", "Long run · 6 mi"),
        ("MOB", "Travel · 8-min mobility"),
        ("MOB", "Travel · 8-min mobility"),
        ("RUN", "Easy run · 25 min"),
        ("RUN", "Easy run · 35 min"),
    ]
    race_week = _week(D(2027, 1, 4), travel_days=TRAVEL)
    assert [d.session for d in race_week] == [
        None,
        "RUN",
        "RUN",
        "RUN",
        None,
        "RUN",
        "RUN",
    ]
    assert (
        race_week[6].label == "Race day · Half marathon"
        and race_week[6].detail["run"] == "RACE"
    )
    recovery = _week(D(2027, 1, 11), travel_days=TRAVEL)
    assert [d.session for d in recovery] == ["MOB"] * 6 + ["RUN"]
    assert recovery[2].travel and recovery[6].label == "Easy run · 25 min"
    # the golf programme resumes the Monday after
    back = _week(D(2027, 1, 18))
    assert [d.session for d in back] == ["S1", "S2", None, "S3", "S5", "S4", None]
    assert gp.prescribe(D(2027, 1, 19), "S2", race=RACE)["run"]["intervals"] == 4
    assert gp.prescribe(D(2027, 1, 26), "S2", race=RACE)["run"]["intervals"] == 6


def test_strength_doses_hold_golf_strength_while_running_builds():
    s1 = gp.prescribe(D(2026, 11, 9), "S1", race=RACE)
    names = {e["name"]: e for b in s1["blocks"] for e in b["exercises"]}
    assert (
        names["Trap-bar deadlift"]["sets"] == 3
        and names["Trap-bar deadlift"]["rpe"] == "7"
    )
    assert (
        names["Single-leg calf raise"]["sets"] == 2 and names["Box jump"]["sets"] == 2
    )
    assert s1["rules"][0].startswith("Running comes first")
    assert s1["target_minutes"] == [55, 65], "fewer sets, a shorter session"
    s2 = gp.prescribe(D(2026, 11, 12), "S2", race=RACE)
    assert s2["run"] is None and s2["target_minutes"] == [45, 55]
    assert s2["title"] == "Rotational power and upper body"
    taper = gp.prescribe(D(2026, 12, 28), "S1", race=RACE)
    t_names = {e["name"]: e for b in taper["blocks"] for e in b["exercises"]}
    assert (
        t_names["Trap-bar deadlift"]["sets"] == 2
        and t_names["Single-leg calf raise"]["sets"] == 1
    )
    assert taper["week_kind"] == "taper"
    light = gp.prescribe(D(2026, 11, 16), "S1", race=RACE)
    assert light["week_kind"] == "lighter"


def test_planned_run_prescriptions():
    q = gp.planned_run(
        D(2026, 11, 4), {"planned": True, "run": "Q"}, race=RACE, first_event=FE
    )
    assert (
        q["session"] == "RUN"
        and q["run_kind"] == "Q"
        and q["title"] == "Tempo run · 39 min"
    )
    assert [b["name"] for b in q["blocks"]] == ["Warm-up", "Tempo run", "Cool-down"]
    assert (
        q["blocks"][1]["exercises"][0]["sets"] == 3
        and q["run"]["intensity"] == "moderate"
    )
    long = gp.planned_run(
        D(2026, 12, 26), {"planned": True, "run": "L"}, race=RACE, easy_pace=600
    )
    assert long["run"]["miles"] == 11 and long["run"]["minutes"] == 110
    assert long["target_minutes"] == [99, 121] and "fuel" in long["run"]["structure"]
    race_day = gp.planned_run(RACE.date, {"planned": True, "run": "RACE"}, race=RACE)
    assert (
        race_day["title"] == "Race day · Half marathon"
        and race_day["run"]["miles"] == 13.1
    )
    assert race_day["phase"] == "race_taper" and race_day["week_kind"] == "race"
    # a capped quality run keeps its structure; a capped long run is just shorter
    assert (
        gp.shorten_run(q, 30)["run"]["minutes"] == 30
        and gp.shorten_run(q, 30)["blocks"]
    )
    short_long = gp.shorten_run(long, 60)
    assert short_long["run"]["miles"] is None and short_long["blocks"] == []
    assert short_long["rules"][0].startswith("Capped at 60 min")


@pytest.mark.asyncio
async def test_train_api_with_a_race(db_session):
    today = datetime.date.today()
    race_day = (
        gp.week_start(today) + 14 * WEEK + datetime.timedelta(days=6)
    )  # a Sunday, 15 weeks out
    build = gp.week_start(race_day) - 10 * WEEK
    sat = build + datetime.timedelta(days=5)
    for i in (
        2,
        4,
    ):  # two logged easy runs at 9:30/mile set the long run's expected minutes
        db_session.add(
            RunSession(
                user_id=1,
                run_date=today - datetime.timedelta(days=i),
                distance_miles=4,
                duration_seconds=4 * 570,
                avg_pace_seconds=570,
                run_type="easy run",
                rpe=4,
            )
        )
    db_session.commit()
    async with AsyncClient(
        transport=ASGITransport(app=app), base_url="http://test"
    ) as client:
        r = await client.post(
            "/api/v1/train/events",
            json={
                "event_date": race_day.isoformat(),
                "name": "Half marathon",
                "kind": "race",
                "notes": "goal: finish strong, by effort",
            },
        )
        assert r.status_code == 200, r.text
        prog = (await client.get("/api/v1/train/program")).json()
        assert (
            prog["race"]["date"] == race_day.isoformat()
            and prog["race"]["build_start"] == build.isoformat()
        )
        assert "race_build" in [p["key"] for p in prog["phases"]]
        assert all(p["notes"] and p["run_note"] for p in prog["phases"])
        wk = (await client.get(f"/api/v1/train/week?start={build.isoformat()}")).json()
        assert [d["session"] for d in wk["days"]] == [
            "S1",
            "RUN",
            "RUN",
            "S2",
            None,
            "RUN",
            None,
        ]
        assert wk["phase"] == "Half marathon build"
        # a race is not a golf day
        rw = (
            await client.get(
                f"/api/v1/train/week?start={gp.week_start(race_day).isoformat()}"
            )
        ).json()
        assert (
            rw["week_kind"] == "race"
            and rw["days"][6]["label"] == "Race day · Half marathon"
        )
        # move the long run to Sunday through the adjust endpoint, then undo it
        moved = await client.post(
            "/api/v1/train/adjust",
            json={
                "kind": "move",
                "date": sat.isoformat(),
                "target_date": (sat + datetime.timedelta(days=1)).isoformat(),
            },
        )
        assert moved.status_code == 200, moved.text
        days = moved.json()["week"]["days"]
        assert days[5]["adjusted"] == "rest" and days[6]["label"] == "Long run · 5 mi"
        assert "the long run" in days[5]["label"]
        undo = await client.delete(
            f"/api/v1/train/adjustments/{moved.json()['adjustment']['id']}"
        )
        assert undo.status_code == 200
        again = (
            await client.get(f"/api/v1/train/week?start={build.isoformat()}")
        ).json()
        assert (
            again["days"][5]["label"] == "Long run · 5 mi"
            and again["days"][6]["session"] is None
        )
        # swapping in a run is allowed; nonsense is not
        assert (
            await client.post(
                "/api/v1/train/adjust",
                json={"kind": "swap", "session": "X", "date": sat.isoformat()},
            )
        ).status_code == 422
        log = (await client.get(f"/api/v1/train/log?start={build.isoformat()}")).json()[
            "text"
        ]
        assert "Runs:" in log and "Long run · 5 mi" in log and "Session 3" not in log
        ctx = (await client.get("/api/v1/coach/context")).json()["context"]
        assert "RACE: Half marathon" in ctx and "finish strong" in ctx

    # the long run's minutes follow the logged easy pace
    from app.routers.train import _prescription_for, _user

    p = _prescription_for(db_session, _user(db_session), sat)
    assert p["run"]["minutes"] == round(5 * 570 / 60)
