"""Tests for streak tracking system (TASK-008)."""

from datetime import date, timedelta

from fastapi.testclient import TestClient

from app.main import app
from app.models.streak import Streak

client = TestClient(app)


class TestStreakModel:
    """Unit tests for Streak.update_streak logic."""

    def test_first_activity_starts_streak(self, db_session):
        streak = Streak(user_id=1, pillar_id=1)
        db_session.add(streak)
        db_session.flush()

        streak.update_streak(date(2026, 1, 1))
        assert streak.current_streak == 1
        assert streak.longest_streak == 1
        assert streak.last_activity_date == date(2026, 1, 1)

    def test_consecutive_days_extend_streak(self, db_session):
        streak = Streak(user_id=1, pillar_id=1)
        db_session.add(streak)
        db_session.flush()

        streak.update_streak(date(2026, 1, 1))
        streak.update_streak(date(2026, 1, 2))
        streak.update_streak(date(2026, 1, 3))
        assert streak.current_streak == 3
        assert streak.longest_streak == 3

    def test_same_day_no_change(self, db_session):
        streak = Streak(user_id=1, pillar_id=1)
        db_session.add(streak)
        db_session.flush()

        streak.update_streak(date(2026, 1, 1))
        streak.update_streak(date(2026, 1, 1))
        assert streak.current_streak == 1

    def test_broken_streak_resets_current(self, db_session):
        streak = Streak(user_id=1, pillar_id=1)
        db_session.add(streak)
        db_session.flush()

        streak.update_streak(date(2026, 1, 1))
        streak.update_streak(date(2026, 1, 2))
        streak.update_streak(date(2026, 1, 2))
        assert streak.current_streak == 2

        # Skip a day
        streak.update_streak(date(2026, 1, 5))
        assert streak.current_streak == 1
        assert streak.longest_streak == 2
        assert streak.days_since_break == 3

    def test_longest_streak_preserved(self, db_session):
        streak = Streak(user_id=1, pillar_id=1)
        db_session.add(streak)
        db_session.flush()

        # Build a 5-day streak
        for i in range(5):
            streak.update_streak(date(2026, 1, 1) + timedelta(days=i))
        assert streak.longest_streak == 5

        # Break and start new shorter streak
        streak.update_streak(date(2026, 1, 10))
        streak.update_streak(date(2026, 1, 11))
        assert streak.current_streak == 2
        assert streak.longest_streak == 5  # preserved

    def test_recovery_time_tracked(self, db_session):
        streak = Streak(user_id=1, pillar_id=1)
        db_session.add(streak)
        db_session.flush()

        streak.update_streak(date(2026, 1, 1))
        streak.update_streak(date(2026, 1, 8))  # 7-day gap
        assert streak.days_since_break == 7


class TestStreakAPI:
    """Integration tests for GET /api/v1/streaks."""

    def test_get_streaks_empty(self, db_session):
        resp = client.get("/api/v1/streaks")
        assert resp.status_code == 200
        assert resp.json() == []

    def test_streaks_created_on_entry(self, db_session):
        # Create an entry tagged with pillar 1
        entry_data = {
            "description": "Studied stochastic calculus",
            "time_invested_minutes": 60,
            "pillar_tags": [1],
            "difficulty_rating": 7,
            "energy_level": 8,
            "key_takeaway": "Ito's lemma is powerful",
            "entry_date": "2026-01-15",
        }
        resp = client.post("/api/v1/entries", json=entry_data)
        assert resp.status_code == 201

        # Check streaks
        resp = client.get("/api/v1/streaks")
        assert resp.status_code == 200
        streaks = resp.json()
        assert len(streaks) == 1
        assert streaks[0]["pillar_id"] == 1
        assert streaks[0]["current_streak"] == 1
        assert streaks[0]["pillar_name"] is not None

    def test_consecutive_entries_build_streak(self, db_session):
        base = {
            "description": "Study session",
            "time_invested_minutes": 45,
            "pillar_tags": [2],
            "difficulty_rating": 5,
            "energy_level": 6,
            "key_takeaway": "Learning",
        }
        for i in range(3):
            d = date(2026, 2, 1) + timedelta(days=i)
            client.post("/api/v1/entries", json={**base, "entry_date": d.isoformat()})

        resp = client.get("/api/v1/streaks")
        streaks = resp.json()
        pillar2 = [s for s in streaks if s["pillar_id"] == 2][0]
        assert pillar2["current_streak"] == 3
        assert pillar2["longest_streak"] == 3

    def test_multi_pillar_entry_updates_all(self, db_session):
        entry_data = {
            "description": "Cross-disciplinary session",
            "time_invested_minutes": 90,
            "pillar_tags": [1, 3, 5],
            "difficulty_rating": 8,
            "energy_level": 7,
            "key_takeaway": "Connections between fields",
            "entry_date": "2026-03-01",
        }
        client.post("/api/v1/entries", json=entry_data)

        resp = client.get("/api/v1/streaks")
        streaks = resp.json()
        assert len(streaks) == 3
        pillar_ids = {s["pillar_id"] for s in streaks}
        assert pillar_ids == {1, 3, 5}
