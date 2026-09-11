"""Google Calendar travel detection, cycle auto-travel, and the daily scheduler."""

import datetime

import pytest
from httpx import ASGITransport, AsyncClient

from app.main import app
from app.models.food import CalendarFeed, MealCycle, TravelSpan
from app.services import calendar_sync, food_scheduler

TODAY = datetime.date.today()


def _d(offset: int) -> str:
    return (TODAY + datetime.timedelta(days=offset)).strftime("%Y%m%d")


ICS = f"""BEGIN:VCALENDAR
VERSION:2.0
BEGIN:VEVENT
UID:trip-sf
DTSTART;VALUE=DATE:{_d(5)}
DTEND;VALUE=DATE:{_d(8)}
SUMMARY:SF trip
LOCATION:San Francisco
END:VEVENT
BEGIN:VEVENT
UID:flight
DTSTART:{_d(20)}T070000Z
DTEND:{_d(20)}T130000Z
SUMMARY:JFK → LAX
END:VEVENT
BEGIN:VEVENT
UID:dentist
DTSTART:{_d(3)}T150000Z
DTEND:{_d(3)}T160000Z
SUMMARY:Dentist
LOCATION:Main St
END:VEVENT
BEGIN:VEVENT
UID:standup
DTSTART:{_d(1)}T090000Z
DTEND:{_d(1)}T091500Z
RRULE:FREQ=WEEKLY
SUMMARY:Travel team standup
END:VEVENT
BEGIN:VEVENT
UID:folded
DTSTART;VALUE=DATE:{_d(40)}
DTEND;VALUE=DATE:{_d(42)}
SUMMARY:Wedding in
  Austin
LOCATION:Austin\\, TX
END:VEVENT
END:VCALENDAR
"""


def _client():
    return AsyncClient(transport=ASGITransport(app=app), base_url="http://test")


def test_ics_parser_and_travel_heuristics():
    events = {e["uid"]: e for e in calendar_sync.parse_ics(ICS)}
    assert (
        events["trip-sf"]["all_day"] is True
        and (events["trip-sf"]["end"] - events["trip-sf"]["start"]).days == 3
    )
    assert events["folded"]["summary"] == "Wedding in Austin", "folded lines are joined"
    assert events["folded"]["location"] == "Austin, TX"
    assert calendar_sync.looks_like_travel(events["trip-sf"]) == (
        True,
        "travel keyword",
    )
    assert calendar_sync.looks_like_travel(events["flight"])[0] is True
    assert calendar_sync.looks_like_travel(events["dentist"])[0] is False
    assert calendar_sync.looks_like_travel(events["standup"]) == (False, "recurring"), (
        "recurring events never count as travel"
    )
    spans = {
        s["uid"]: s for s in calendar_sync.spans_from_events(list(events.values()))
    }
    assert set(spans) == {"trip-sf", "flight", "folded"}
    assert spans["trip-sf"]["end"] == events["trip-sf"]["start"] + datetime.timedelta(
        days=2
    ), "all-day DTEND is exclusive"


@pytest.mark.asyncio
async def test_sync_upserts_spans_and_cycles_subtract_them(db_session):
    async with _client() as client:
        await client.get("/api/v1/food/recipes")  # seeds user data
        feed = CalendarFeed(
            user_id=1,
            url="https://calendar.google.com/calendar/ical/x/private-abc/basic.ics",
        )
        db_session.add(feed)
        db_session.commit()
        n = await calendar_sync.sync_feed(db_session, feed, text=ICS, use_llm=False)
        assert n == 3
        # second sync is idempotent
        assert (
            await calendar_sync.sync_feed(db_session, feed, text=ICS, use_llm=False)
            == 3
        )
        travel = (await client.get("/api/v1/food/travel")).json()
        assert {t["summary"] for t in travel} >= {"SF trip", "JFK → LAX"}
        # a cycle starting today auto-subtracts the SF trip (days 5–7)
        cycle = (
            await client.post(
                "/api/v1/food/cycles",
                json={"start_date": TODAY.isoformat(), "eat_out_days": 2},
            )
        ).json()
        assert cycle["travel_days"] == [
            (TODAY + datetime.timedelta(days=d)).isoformat() for d in (5, 6, 7)
        ]
        assert cycle["eating_days"] == 14 - 3 - 2
        # ignoring the span removes it from the next cycle
        sf = next(t for t in travel if t["summary"] == "SF trip")
        assert (
            await client.patch(
                f"/api/v1/food/travel/{sf['id']}", json={"ignored": True}
            )
        ).json()["ignored"] is True
        c2 = (
            await client.post(
                "/api/v1/food/cycles",
                json={"start_date": (TODAY + datetime.timedelta(days=1)).isoformat()},
            )
        ).json()
        assert c2["travel_days"] == []


@pytest.mark.asyncio
async def test_put_feed_validates_and_manual_travel_is_confirmed(db_session):
    async with _client() as client:
        r = await client.put(
            "/api/v1/calendar/feeds", json={"url": "http://not-secure"}
        )
        assert r.status_code == 422
        r = await client.post(
            "/api/v1/food/travel",
            json={
                "start_date": TODAY.isoformat(),
                "end_date": (TODAY + datetime.timedelta(days=2)).isoformat(),
                "summary": "Cabin",
            },
        )
        assert (
            r.status_code == 200
            and r.json()["confirmed"] is True
            and r.json()["days"] == 3
        )


@pytest.mark.asyncio
async def test_daily_tick_closes_finished_cycles_and_pushes(db_session, monkeypatch):
    sent = []

    async def fake_push(db, user_id, *, title, body, data=None, sound="default"):
        sent.append((title, body))
        return 1

    import app.services.push as push_mod

    monkeypatch.setattr(push_mod, "send_push", fake_push)
    async with _client() as client:
        recipes = (await client.get("/api/v1/food/recipes")).json()
        # a cycle that ended yesterday, with one cooked meal
        start = TODAY - datetime.timedelta(days=15)
        cycle = (
            await client.post(
                "/api/v1/food/cycles", json={"start_date": start.isoformat()}
            )
        ).json()
        await client.post(
            f"/api/v1/food/cycles/{cycle['id']}/swipe",
            json={"recipe_id": recipes[0]["id"], "decision": "keep", "spare": True},
        )
        plan = (await client.post(f"/api/v1/food/cycles/{cycle['id']}/plan")).json()
        await client.post(
            f"/api/v1/food/cycles/{cycle['id']}/meals/{plan['meals'][0]['id']}/cooked",
            json={"cooked": True, "rating": 1},
        )
        out = await food_scheduler.daily_tick(db_session, force=True)
        assert out["closed"] == [cycle["id"]]
        db_session.expire_all()
        c = db_session.get(MealCycle, cycle["id"])
        assert c.status == "done" and "1 of 1 planned meals cooked" in (c.notes or "")
        assert any(t == "Cycle closed" for t, _ in sent)
        # no open cycle and the next one starts now → pantry push
        assert out.get("pantry_push") is True
        assert any(t == "Shopping in 2 days" for t, _ in sent)
        # cook push for a cook day today
        c3 = (
            await client.post(
                "/api/v1/food/cycles", json={"start_date": TODAY.isoformat()}
            )
        ).json()
        await client.post(
            f"/api/v1/food/cycles/{c3['id']}/swipe",
            json={"recipe_id": recipes[1]["id"], "decision": "keep", "spare": True},
        )
        await client.post(f"/api/v1/food/cycles/{c3['id']}/plan")
        out2 = await food_scheduler.daily_tick(db_session, force=True)
        assert out2.get("cook_push") == recipes[1]["title"]
        assert db_session.query(TravelSpan).count() == 0


@pytest.mark.asyncio
async def test_refresh_travel_updates_an_open_cycle(db_session):
    async with _client() as client:
        await client.get("/api/v1/food/recipes")
        cycle = (
            await client.post(
                "/api/v1/food/cycles", json={"start_date": TODAY.isoformat()}
            )
        ).json()
        assert cycle["travel_days"] == []
        feed = CalendarFeed(
            user_id=1,
            url="https://calendar.google.com/calendar/ical/x/private-abc/basic.ics",
        )
        db_session.add(feed)
        db_session.commit()
        await calendar_sync.sync_feed(db_session, feed, text=ICS, use_llm=False)
        out = (
            await client.post(f"/api/v1/food/cycles/{cycle['id']}/refresh-travel")
        ).json()
        assert out["travel_days"] == [
            (TODAY + datetime.timedelta(days=d)).isoformat() for d in (5, 6, 7)
        ]
        assert out["eating_days"] == 14 - 3 - 2
        # the daily tick does the same for open cycles
        tick = await food_scheduler.daily_tick(db_session, force=True)
        assert (
            "travel_refreshed" not in tick
            or cycle["id"] not in tick["travel_refreshed"]
        ), "already current"


@pytest.mark.asyncio
async def test_app_wide_calendar_events_and_today(db_session):
    async with _client() as client:
        await client.get("/api/v1/food/recipes")
        feed = CalendarFeed(
            user_id=1,
            url="https://calendar.google.com/calendar/ical/x/private-abc/basic.ics",
        )
        db_session.add(feed)
        db_session.commit()
        await calendar_sync.sync_feed(db_session, feed, text=ICS, use_llm=False)
        feeds = (await client.get("/api/v1/calendar/feeds")).json()
        assert feeds[0]["events"] == 5 and feeds[0]["travel_spans"] == 3
        end = (TODAY + datetime.timedelta(days=45)).isoformat()
        events = (
            await client.get(
                f"/api/v1/calendar/events?start={TODAY.isoformat()}&end={end}"
            )
        ).json()
        kinds = {e["summary"]: e["kind"] for e in events}
        assert (
            kinds["SF trip"] == "travel"
            and kinds["Dentist"] == "meeting"
            and kinds["Travel team standup"] == "meeting"
        )
        dentist = next(e for e in events if e["summary"] == "Dentist")
        assert dentist["all_day"] is False and dentist["start_at"] is not None, (
            "timed events keep their local time"
        )
        today = (await client.get("/api/v1/calendar/today")).json()
        assert today["connected"] is True and today["travelling"] is False
        assert (await client.delete("/api/v1/calendar/feeds")).json()["deleted"] is True
        assert (await client.get("/api/v1/calendar/today")).json()["connected"] is False
        assert (await client.get("/api/v1/food/travel")).json() == []
