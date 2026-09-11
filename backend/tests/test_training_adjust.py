"""Adaptive days: you change a day, the planner re-lays the week around it."""

import datetime

import pytest
from httpx import ASGITransport, AsyncClient

from app.main import app
from app.services import golf_program as gp

WS = datetime.date(2026, 10, 12)  # a normal Monday in the build phase
THU = WS + datetime.timedelta(days=3)


def _plan(pins, **kw):
    return gp.plan_week(WS, travel_days=set(), tournaments=[], pins=pins, **kw)


def test_run_instead_of_gym_moves_session_and_drops_s5():
    week = _plan({THU: {"kind": "run", "miles": 6}}, not_before=THU)
    by = {d.date.weekday(): d for d in week}
    assert by[3].session == "RUN" and by[3].adjusted == "run"
    # S3 (Thu) must land on a later free day, 48 h from S1 (Mon) and not in the past
    s3 = next(d for d in week if d.session == "S3")
    assert s3.date > THU
    assert "S5" not in [d.session for d in week]
    assert any("Session 5 dropped" in (d.note or "") for d in week)
    # the day after a real run carries a heavy-legs / easy-run note
    fri = by[4]
    assert fri.session in ("S3", "S5", None)
    notes = " ".join(d.note or "" for d in week)
    assert "ran yesterday" in notes or "heavy" in notes


def test_rest_and_golf_pins_free_the_day_and_swap_moves_sessions():
    week = _plan(
        {WS: {"kind": "rest"}, THU: {"kind": "swap", "session": "S1"}}, not_before=WS
    )
    by = {d.date.weekday(): d for d in week}
    assert by[0].session is None and by[0].adjusted == "rest"
    assert by[3].session == "S1" and by[3].adjusted == "swap"
    # S3 still happens, 48 h from S1
    s3 = next(d for d in week if d.session == "S3")
    assert abs((s3.date - THU).days) >= 2


def test_shorten_keeps_the_window_below_the_cap():
    """A very short day must not report a range that runs backwards."""
    for cap in (10, 15, 20, 25, 30, 45, 70):
        p = gp.prescribe(THU, "S3", first_event=datetime.date(2027, 4, 24))
        short = gp.shorten(p, cap)
        lo, hi = short["target_minutes"]
        assert lo <= hi, f"cap {cap} produced {lo}-{hi}"
        assert hi == cap
        assert lo >= 10


def test_shorten_drops_accessories_first_and_keeps_main_lifts():
    p = gp.prescribe(THU, "S3", first_event=datetime.date(2027, 4, 24))
    short = gp.shorten(p, 45)
    assert short["target_minutes"][1] == 45 and short["shortened_to"] == 45
    names = [e["name"] for b in short["blocks"] for e in b["exercises"]]
    assert any("squat" in n.lower() for n in names)  # main lift survives
    assert len(names) < len([e for b in p["blocks"] for e in b["exercises"]])
    assert short["rules"][0].startswith("Capped at 45 min")


def test_run_prescription_and_after_run():
    p = gp.run_prescription(THU, {"miles": 6, "intensity": "easy"})
    assert (
        p["session"] == "RUN" and p["run"]["miles"] == 6 and p["run"]["minutes"] == 57
    )
    s2 = gp.after_run(gp.prescribe(THU, "S2"))
    assert s2["run"]["minutes"] == 15 and "no intervals" in s2["rules"][0]


def test_describe_change_lists_moved_days():
    before = _plan({})
    after = _plan({THU: {"kind": "run", "miles": 6}}, not_before=THU)
    lines = gp.describe_change(before, after)
    assert any(line.startswith("Thu:") and "Outdoor run" in line for line in lines)


@pytest.mark.asyncio
async def test_adjust_api_structured_then_revert(db_session, monkeypatch):
    today = datetime.date.today()
    async with AsyncClient(
        transport=ASGITransport(app=app), base_url="http://test"
    ) as client:
        r = await client.post(
            "/api/v1/train/adjust",
            json={
                "kind": "run",
                "miles": 6,
                "intensity": "moderate",
                "date": today.isoformat(),
            },
        )
        assert r.status_code == 200, r.text
        body = r.json()
        assert body["adjustment"]["kind"] == "run"
        t = body["today"]
        assert (
            t["prescription"]["session"] == "RUN"
            and t["prescription"]["run"]["miles"] == 6
        )
        assert body["week"]["adjustments"][0]["id"] == body["adjustment"]["id"]
        # starting the gym session today is refused — log the run instead
        assert (await client.post("/api/v1/train/today/start")).status_code == 422
        # a second change on the same day replaces the first
        r2 = await client.post(
            "/api/v1/train/adjust", json={"kind": "rest", "date": today.isoformat()}
        )
        assert r2.status_code == 200
        assert len((await client.get("/api/v1/train/adjustments")).json()) == 1
        # undo
        r3 = await client.delete(
            f"/api/v1/train/adjustments/{r2.json()['adjustment']['id']}"
        )
        assert r3.status_code == 200 and r3.json()["note"] == "Undone."
        assert (await client.get("/api/v1/train/adjustments")).json() == []
        # yesterday is refused
        y = (today - datetime.timedelta(days=1)).isoformat()
        assert (
            await client.post("/api/v1/train/adjust", json={"kind": "rest", "date": y})
        ).status_code == 422


@pytest.mark.asyncio
async def test_adjust_api_free_text_uses_parser(db_session, monkeypatch):
    today = datetime.date.today()

    async def fake_structured_output(**kw):
        assert "running 6 miles" in kw["user_prompt"]
        return {
            "kind": "run",
            "date": today.isoformat(),
            "miles": 6,
            "intensity": "easy",
            "note": "Enjoy the air.",
        }

    monkeypatch.setattr("app.routers.train.structured_output", fake_structured_output)
    async with AsyncClient(
        transport=ASGITransport(app=app), base_url="http://test"
    ) as client:
        r = await client.post(
            "/api/v1/train/adjust",
            json={"text": "today I'm running 6 miles instead of the gym"},
        )
        assert r.status_code == 200, r.text
        assert r.json()["note"] == "Enjoy the air."
        assert r.json()["today"]["prescription"]["session"] == "RUN"


@pytest.mark.asyncio
async def test_coach_chat_applies_adjustment(db_session, monkeypatch):
    async def fake_structured_output(**kw):
        return {
            "reply": "Go run. I'll move Session 3.",
            "adjustment": {"kind": "run", "date": None, "miles": 6},
        }

    monkeypatch.setattr("app.routers.coach.structured_output", fake_structured_output)
    async with AsyncClient(
        transport=ASGITransport(app=app), base_url="http://test"
    ) as client:
        r = await client.post(
            "/api/v1/coach/chat",
            json={"message": "running 6 miles today instead of the gym"},
        )
        assert r.status_code == 200, r.text
        body = r.json()
        assert body["adjustment_id"] and "Updated your week" in body["reply"]
        assert (await client.get("/api/v1/train/today")).json()["prescription"][
            "session"
        ] == "RUN"


def test_the_programme_opens_with_session_one_on_its_first_day():
    """Nothing is planned before the start, and day one is S1 wherever it lands."""
    first = gp.PROGRAM_START
    opening = gp.plan_week(gp.week_start(first), travel_days=set(), tournaments=[])
    by_date = {d.date: d for d in opening}
    assert by_date[first].session == "S1"
    assert all(
        d.session is None for d in opening if d.date < first
    ), "no session may be planned before the programme starts"

    # The following week is the ordinary rhythm, untouched.
    nxt = gp.plan_week(
        gp.week_start(first) + datetime.timedelta(days=7), travel_days=set(), tournaments=[]
    )
    assert [d.session for d in nxt] == ["S1", "S2", None, "S3", "S5", "S4", None]

    # A week entirely before the start holds nothing at all.
    before = gp.plan_week(
        gp.week_start(first) - datetime.timedelta(days=14), travel_days=set(), tournaments=[]
    )
    assert all(d.session is None for d in before)
