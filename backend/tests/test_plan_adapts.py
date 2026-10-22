"""The plan adapts to what you log (docs/TRAINING-GOLF.md §13): the long run builds from the
runs you logged, a run that felt harder than planned is repeated, the first week back after
time off is easier, and Session 2's golf rotation steps aside in a week a run felt hard."""

import datetime
from dataclasses import replace

import pytest
from httpx import ASGITransport, AsyncClient

from app.main import app
from app.models.run import RunSession
from app.models.workout import ExerciseLog, WorkoutSession
from app.services import golf_program as gp

D = datetime.date
DAY = datetime.timedelta(days=1)
WEEK = datetime.timedelta(weeks=1)
RACE = gp.Race(D(2027, 1, 10), "Half marathon")
BUILD = D(2026, 10, 26)  # the block's first week
PLAN_LONGS = [5, 6, 7, 5, 8, 9, 10, 7, 11]
# The owner's log on Oct 21, 2026: one run in September, the last lifting on Oct 1.
OWNER = gp.History(
    runs=(gp.LoggedRun(D(2026, 9, 12), 4.1, 7),),
    lifted=(D(2026, 9, 28), D(2026, 9, 29), D(2026, 10, 1)),
)


def _with(h: gp.History, *, runs=(), lifted=()) -> gp.History:
    return gp.History(runs=h.runs + tuple(runs), lifted=h.lifted + tuple(lifted))


def _lifting(start: datetime.date, end: datetime.date) -> list[datetime.date]:
    """Mondays and Thursdays from start up to end."""
    return [
        start + i * DAY
        for i in range((end - start).days)
        if (start + i * DAY).weekday() in (0, 3)
    ]


def _run_the_block(h: gp.History, rpe: int = 4) -> list[float]:
    """Lift Monday and Thursday and run each build week's long run as the plan gives it,
    logging it at `rpe`. Returns the long runs."""
    longs = []
    for i in range(9):
        sat = BUILD + i * WEEK + 5 * DAY
        h = _with(h, lifted=_lifting(sat - 5 * DAY, sat))
        miles, _ = gp.long_run_miles(RACE, sat, h)
        longs.append(miles)
        h = _with(h, runs=[gp.LoggedRun(sat, miles, rpe)])
    return longs


def _names(p: dict) -> dict[str, dict]:
    return {e["name"]: e for b in p["blocks"] for e in b["exercises"]}


def test_without_a_history_the_plan_is_as_written():
    wk = gp.plan_week(BUILD, travel_days=set(), tournaments=[], race=RACE)
    assert [d.label for d in wk if d.session == "RUN"] == [
        "Easy run · 30 min",
        "Steady finish · 30 min",
        "Long run · 5 mi",
    ]
    assert all(d.note is None for d in wk)
    assert gp.long_run_miles(RACE, BUILD, None) == (5, None)
    assert gp.prescribe(D(2026, 10, 22), "S3")["days_off"] is None
    # nothing logged at all is a fresh start, not a comeback
    assert gp.days_off_before(D(2026, 10, 22), gp.History()) is None
    assert gp.long_run_miles(RACE, BUILD, gp.History()) == (5, None)


def test_the_long_run_builds_from_what_you_log():
    # no run logged in the three weeks before the block, so it starts at 4 miles
    assert gp.long_run_miles(RACE, BUILD + 5 * DAY, OWNER) == (
        4.0,
        "no runs logged in three weeks (plan: 5 mi)",
    )
    longs = _run_the_block(_with(OWNER, lifted=[D(2026, 10, 22)]))
    assert longs == [4, 5.5, 6.5, 4.5, 7.5, 8.5, 9.5, 7, 10.5]
    assert all(m <= p for m, p in zip(longs, PLAN_LONGS)), "the plan is the ceiling"
    assert all(b - max(longs[: i + 1]) <= 1.5 for i, b in enumerate(longs[1:])), (
        "it catches up at most 1.5 miles a week, and only while the runs feel easy"
    )
    # one 4.5-mile run the weekend before, then the plan as asked: the plan is what you get
    on_plan = _with(
        OWNER, runs=[gp.LoggedRun(D(2026, 10, 24), 4.5, 4)], lifted=[D(2026, 10, 22)]
    )
    assert _run_the_block(on_plan) == PLAN_LONGS


def test_a_long_run_that_felt_hard_is_repeated():
    h = gp.History(
        runs=(
            gp.LoggedRun(D(2026, 10, 31), 5, 4),
            gp.LoggedRun(D(2026, 11, 7), 6, 8),
        ),
        lifted=tuple(_lifting(D(2026, 10, 22), D(2026, 11, 14))),
    )
    sat = D(2026, 11, 14)  # the plan says 7
    why = "a repeat: the last long run felt hard, RPE 8 (plan: 7 mi)"
    assert gp.long_run_miles(RACE, sat, h) == (6, why)
    wk = gp.plan_week(
        D(2026, 11, 9), travel_days=set(), tournaments=[], race=RACE, history=h
    )
    assert (wk[5].label, wk[5].note) == ("Long run · 6 mi", why)
    p = gp.planned_run(sat, {"planned": True, "run": "L"}, race=RACE, history=h)
    assert p["run"]["miles"] == 6 and p["run"]["structure"].startswith("6 miles easy")
    assert p["rules"][0] == f"Adapted to your log: {why}." and p["adapted"] == why


def test_a_quality_run_that_felt_too_hard_is_repeated():
    base = gp.History(
        runs=(gp.LoggedRun(D(2026, 10, 31), 5, 4),),
        lifted=tuple(_lifting(D(2026, 10, 22), D(2027, 1, 1))),
    )
    wed = D(2026, 11, 11)  # the plan says hills
    assert gp.build_run(RACE, wed, "Q", base)[0].title == "Hill repeats"
    # last week's tempo run logged at RPE 8: this week repeats it instead of stepping up
    hard = _with(base, runs=[gp.LoggedRun(D(2026, 11, 4), 4, 8, "moderate")])
    spec, why = gp.build_run(RACE, wed, "Q", hard)
    assert gp.run_label(spec) == "Tempo run · 39 min"
    assert why == "a repeat: the last quality run felt hard, RPE 8"
    # hills are meant to be hard: RPE 8 is on plan, 9 is too much
    hills = gp.LoggedRun(D(2026, 12, 2), 4, 8, "hard")
    assert gp.build_run(RACE, D(2026, 12, 9), "Q", _with(base, runs=[hills])) == (
        gp.RACE_BUILD[4]["Q"],
        None,
    )
    spec, why = gp.build_run(
        RACE, D(2026, 12, 9), "Q", _with(base, runs=[replace(hills, rpe=9)])
    )
    assert spec.title == "Hill repeats" and why
    # a cutback week keeps its easier session either way
    tough = _with(base, runs=[gp.LoggedRun(D(2026, 11, 11), 4, 9, "hard")])
    assert gp.build_run(RACE, D(2026, 11, 18), "Q", tough)[0].title == "Fartlek"


def test_the_first_week_back_after_time_off_is_easier():
    tomorrow = D(2026, 10, 22)
    assert gp.days_off_before(tomorrow, OWNER) == 20
    back = _with(OWNER, lifted=[tomorrow])
    assert gp.days_off_before(D(2026, 10, 28), back) == 20, "the whole first week"
    assert gp.days_off_before(D(2026, 10, 29), back) is None

    s3 = gp.prescribe(
        tomorrow,
        "S3",
        profiles={"incline db press": {"weight": 50, "note": None}},
        history=OWNER,
    )
    ex = _names(s3)
    assert {e["sets"] for e in ex.values()} == {2}, "2 sets of everything"
    assert _names(gp.prescribe(tomorrow, "S3"))["Front squat"]["sets"] == 3
    assert (s3["target_minutes"], gp.prescribe(tomorrow, "S3")["target_minutes"]) == (
        [55, 60],
        [65, 70],
    )
    assert {e["rpe"] for e in ex.values()} == {"6–7"}
    assert ex["Incline DB press"]["load"] == 45
    assert "10 %" in ex["Incline DB press"]["load_note"]
    assert s3["days_off"] == 20
    assert s3["rules"][0].startswith(
        "First week back after 20 days off: 2 sets of everything"
    )
    assert _names(gp.prescribe(tomorrow, "S3"))["Front squat"]["sets"] == 3
    # Session 2's intervals wait a week
    s2 = gp.prescribe(D(2026, 10, 20), "S2", history=OWNER)
    assert s2["run"]["intervals"] == 0 and "first week back" in s2["run"]["structure"]
    # a lighter week has already trimmed the sets: only effort and load change
    gap = gp.History(lifted=(D(2026, 11, 1),))
    light = gp.prescribe(D(2026, 11, 16), "S1", race=RACE, history=gap)
    assert [e["sets"] for e in _names(light).values()] == [
        e["sets"]
        for e in _names(gp.prescribe(D(2026, 11, 16), "S1", race=RACE)).values()
    ]
    assert "the lighter week already trims the sets" in light["rules"][0]

    # the week says so, and the comeback's quality run is easy running
    wk = gp.plan_week(
        D(2026, 10, 19), travel_days=set(), tournaments=[], race=RACE, history=OWNER
    )
    assert (wk[3].session, wk[3].note) == (
        "S3",
        "first week back: 2 sets each, RPE 6–7",
    )
    build = gp.plan_week(
        BUILD, travel_days=set(), tournaments=[], race=RACE, history=back
    )
    assert build[0].note == "first week back: 2 sets each, RPE 6–7"
    assert build[2].label == "Easy run · 30 min"
    assert build[2].note == "first week back after 20 days off: easy, no hard running"
    assert build[3].note is None, "a week after the comeback, Session 2 is itself again"
    assert build[5].label == "Long run · 4 mi"


def test_golf_rotation_steps_aside_in_a_week_a_run_felt_hard():
    easy = gp.History(
        runs=(
            gp.LoggedRun(D(2026, 11, 7), 6, 4),
            gp.LoggedRun(D(2026, 11, 10), 3, 4),
        ),
        lifted=tuple(_lifting(D(2026, 10, 22), D(2027, 1, 1))),
    )
    thu = D(2026, 11, 12)
    s2 = gp.prescribe(thu, "S2", race=RACE, history=easy)
    assert "Golf rotation" in [b["name"] for b in s2["blocks"]]
    assert s2["target_minutes"] == [55, 65]
    hard = _with(easy, runs=[gp.LoggedRun(D(2026, 11, 11), 4, 8, "moderate")])
    s2 = gp.prescribe(thu, "S2", race=RACE, history=hard)
    assert "Golf rotation" not in [b["name"] for b in s2["blocks"]]
    assert s2["target_minutes"] == [45, 55]
    assert s2["rules"][-1].startswith(
        "Golf rotation left out today (Wed's run felt hard, RPE 8)"
    )
    wk = gp.plan_week(
        D(2026, 11, 9), travel_days=set(), tournaments=[], race=RACE, history=hard
    )
    assert (wk[3].session, wk[3].note) == (
        "S2",
        "golf rotation off: Wed's run felt hard, RPE 8",
    )
    # the week after, it's back (a cutback week: lighter sets, still there)
    later = gp.prescribe(thu + WEEK, "S2", race=RACE, history=hard)
    assert "Golf rotation" in [b["name"] for b in later["blocks"]]


def test_race_day_brings_in_walk_breaks_when_the_long_runs_fell_short():
    def race_day(h):
        return gp.planned_run(
            RACE.date, {"planned": True, "run": "RACE"}, race=RACE, history=h
        )["run"]["structure"]

    short = gp.History(runs=(gp.LoggedRun(D(2026, 12, 26), 8, 5),))
    assert race_day(short).startswith(
        "Your longest run in the last six weeks was 8 miles, so walk a minute at every "
        "mile marker from mile 5"
    )
    enough = gp.History(runs=(gp.LoggedRun(D(2026, 12, 26), 10.5, 5),))
    assert race_day(enough).startswith("Start slower than feels right")
    assert race_day(None) == race_day(enough)


@pytest.mark.asyncio
async def test_the_api_adapts_to_what_you_log(db_session):
    today = datetime.date.today()
    race_day = gp.week_start(today) + 14 * WEEK + 6 * DAY  # a Sunday, 15 weeks out
    build = gp.week_start(race_day) - 10 * WEEK
    # a month before the build: a session logged but never finished, the sets climbing
    row = WorkoutSession(
        user_id=1, session_date=build - 30 * DAY, day_type="S1", status="in_progress"
    )
    db_session.add(row)
    db_session.flush()
    for i, (w, reps) in enumerate([(95, 10), (135, 8), (175, 5)], start=1):
        db_session.add(
            ExerciseLog(
                session_id=row.id,
                exercise_name="Trap-bar deadlift",
                set_number=i,
                weight=w,
                reps=reps,
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
            },
        )
        assert r.status_code == 200, r.text
        days = (
            await client.get(f"/api/v1/train/week?start={build.isoformat()}")
        ).json()["days"]
        assert days[0]["note"] == "first week back: 2 sets each, RPE 6–7"
        assert days[2]["label"] == "Easy run · 30 min"
        assert (days[5]["label"], days[5]["note"]) == (
            "Long run · 4 mi",
            "no runs logged in three weeks (plan: 5 mi)",
        )
        # a run logged the weekend before puts the long run back on plan
        db_session.add(
            RunSession(
                user_id=1,
                run_date=build - 2 * DAY,
                distance_miles=4.5,
                duration_seconds=2700,
                avg_pace_seconds=600,
                run_type="easy run",
                rpe=4,
            )
        )
        db_session.commit()
        days = (
            await client.get(f"/api/v1/train/week?start={build.isoformat()}")
        ).json()["days"]
        assert (days[5]["label"], days[5]["note"]) == ("Long run · 5 mi", None)
        ctx = (await client.get("/api/v1/coach/context")).json()["context"]
        assert "THE RUNS ADAPT TO THE LOG" in ctx and "FIRST WEEK BACK" in ctx

    from app.routers.train import _prescription_for, _user

    s1 = _prescription_for(db_session, _user(db_session), build)
    trap = _names(s1)["Trap-bar deadlift"]
    # 135, the middle of what was logged, eased in for the first week back
    assert (trap["sets"], trap["load"], s1["days_off"]) == (2, 120, 27)
