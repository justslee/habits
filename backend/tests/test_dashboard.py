"""Tests for the dashboard stats endpoint."""

from datetime import date, timedelta

from fastapi.testclient import TestClient

from app.main import app
from app.models.daily_entry import DailyEntry
from app.models.evaluation import Evaluation
from app.models.streak import Streak
from app.models.user import User

client = TestClient(app)


class TestDashboardStats:
    """Tests for GET /api/v1/dashboard/stats."""

    def test_empty_dashboard(self, db_session):
        """Dashboard returns zeros when no entries exist."""
        resp = client.get("/api/v1/dashboard/stats")
        assert resp.status_code == 200
        data = resp.json()
        assert data["hours"]["all_time"] == 0
        assert data["hours"]["this_week"] == 0
        assert data["hours"]["this_month"] == 0
        assert data["avg_depth_score"] is None
        assert data["trend"] == "plateauing"
        assert len(data["pillar_breakdown"]) == 5  # all pillars present
        assert data["streaks"] == []

    def test_hours_all_time(self, db_session):
        """Total hours aggregates all entries."""
        user = db_session.query(User).first()
        # Add entries: 120 min + 60 min = 180 min = 3 hours
        for mins in [120, 60]:
            entry = DailyEntry(
                user_id=user.id,
                entry_date=date.today(),
                description="study session",
                time_invested_minutes=mins,
                pillar_tags="1",
                difficulty_rating=5,
                energy_level=5,
                key_takeaway="learned stuff",
            )
            db_session.add(entry)
        db_session.commit()

        resp = client.get("/api/v1/dashboard/stats")
        data = resp.json()
        assert data["hours"]["all_time"] == 3.0

    def test_hours_this_week(self, db_session):
        """This week only counts entries from current week."""
        user = db_session.query(User).first()
        today = date.today()

        # Entry today (this week)
        db_session.add(
            DailyEntry(
                user_id=user.id,
                entry_date=today,
                description="today",
                time_invested_minutes=60,
                pillar_tags="1",
                difficulty_rating=5,
                energy_level=5,
                key_takeaway="t",
            )
        )
        # Entry 14 days ago (not this week)
        db_session.add(
            DailyEntry(
                user_id=user.id,
                entry_date=today - timedelta(days=14),
                description="old",
                time_invested_minutes=120,
                pillar_tags="1",
                difficulty_rating=5,
                energy_level=5,
                key_takeaway="t",
            )
        )
        db_session.commit()

        resp = client.get("/api/v1/dashboard/stats")
        data = resp.json()
        assert data["hours"]["all_time"] == 3.0
        assert data["hours"]["this_week"] == 1.0

    def test_hours_this_month(self, db_session):
        """This month only counts entries from current month."""
        user = db_session.query(User).first()
        today = date.today()

        db_session.add(
            DailyEntry(
                user_id=user.id,
                entry_date=today,
                description="this month",
                time_invested_minutes=90,
                pillar_tags="1",
                difficulty_rating=5,
                energy_level=5,
                key_takeaway="t",
            )
        )
        # 60 days ago
        db_session.add(
            DailyEntry(
                user_id=user.id,
                entry_date=today - timedelta(days=60),
                description="old month",
                time_invested_minutes=90,
                pillar_tags="1",
                difficulty_rating=5,
                energy_level=5,
                key_takeaway="t",
            )
        )
        db_session.commit()

        resp = client.get("/api/v1/dashboard/stats")
        data = resp.json()
        assert data["hours"]["this_month"] == 1.5
        assert data["hours"]["all_time"] == 3.0

    def test_pillar_breakdown(self, db_session):
        """Pillar breakdown shows hours and avg depth per pillar."""
        user = db_session.query(User).first()

        entry = DailyEntry(
            user_id=user.id,
            entry_date=date.today(),
            description="quant study",
            time_invested_minutes=120,
            pillar_tags="1",
            difficulty_rating=7,
            energy_level=8,
            key_takeaway="derivatives pricing",
        )
        db_session.add(entry)
        db_session.flush()

        evaluation = Evaluation(
            entry_id=entry.id,
            depth_score=75,
            relevance_score=80,
            one_percent_better=True,
            verdict_explanation="Good depth",
            commentary="Solid work",
        )
        db_session.add(evaluation)
        db_session.commit()

        resp = client.get("/api/v1/dashboard/stats")
        data = resp.json()

        pillar_1 = next(p for p in data["pillar_breakdown"] if p["pillar_id"] == 1)
        assert pillar_1["total_hours"] == 2.0
        assert pillar_1["avg_depth_score"] == 75.0
        assert pillar_1["entry_count"] == 1

    def test_avg_depth_score(self, db_session):
        """Overall avg depth score is computed from all evaluations."""
        user = db_session.query(User).first()

        for depth in [60, 80]:
            entry = DailyEntry(
                user_id=user.id,
                entry_date=date.today(),
                description="study",
                time_invested_minutes=60,
                pillar_tags="1",
                difficulty_rating=5,
                energy_level=5,
                key_takeaway="t",
            )
            db_session.add(entry)
            db_session.flush()
            db_session.add(
                Evaluation(
                    entry_id=entry.id,
                    depth_score=depth,
                    relevance_score=70,
                    one_percent_better=True,
                    verdict_explanation="ok",
                    commentary="ok",
                )
            )
        db_session.commit()

        resp = client.get("/api/v1/dashboard/stats")
        data = resp.json()
        assert data["avg_depth_score"] == 70.0

    def test_trend_improving(self, db_session):
        """Trend is 'improving' when recent depth > older depth."""
        user = db_session.query(User).first()
        today = date.today()

        # Older entries (15 days ago) with low depth
        for i in range(3):
            entry = DailyEntry(
                user_id=user.id,
                entry_date=today - timedelta(days=15 + i),
                description="old study",
                time_invested_minutes=60,
                pillar_tags="1",
                difficulty_rating=5,
                energy_level=5,
                key_takeaway="t",
            )
            db_session.add(entry)
            db_session.flush()
            db_session.add(
                Evaluation(
                    entry_id=entry.id,
                    depth_score=40,
                    relevance_score=50,
                    one_percent_better=False,
                    verdict_explanation="meh",
                    commentary="meh",
                )
            )

        # Recent entries (last 3 days) with high depth
        for i in range(3):
            entry = DailyEntry(
                user_id=user.id,
                entry_date=today - timedelta(days=i),
                description="deep study",
                time_invested_minutes=60,
                pillar_tags="1",
                difficulty_rating=8,
                energy_level=8,
                key_takeaway="t",
            )
            db_session.add(entry)
            db_session.flush()
            db_session.add(
                Evaluation(
                    entry_id=entry.id,
                    depth_score=80,
                    relevance_score=85,
                    one_percent_better=True,
                    verdict_explanation="good",
                    commentary="good",
                )
            )
        db_session.commit()

        resp = client.get("/api/v1/dashboard/stats")
        data = resp.json()
        assert data["trend"] == "improving"

    def test_trend_declining(self, db_session):
        """Trend is 'declining' when recent depth < older depth."""
        user = db_session.query(User).first()
        today = date.today()

        # Older entries with high depth
        for i in range(3):
            entry = DailyEntry(
                user_id=user.id,
                entry_date=today - timedelta(days=15 + i),
                description="old",
                time_invested_minutes=60,
                pillar_tags="1",
                difficulty_rating=5,
                energy_level=5,
                key_takeaway="t",
            )
            db_session.add(entry)
            db_session.flush()
            db_session.add(
                Evaluation(
                    entry_id=entry.id,
                    depth_score=85,
                    relevance_score=85,
                    one_percent_better=True,
                    verdict_explanation="g",
                    commentary="g",
                )
            )

        # Recent entries with low depth
        for i in range(3):
            entry = DailyEntry(
                user_id=user.id,
                entry_date=today - timedelta(days=i),
                description="lazy",
                time_invested_minutes=60,
                pillar_tags="1",
                difficulty_rating=3,
                energy_level=3,
                key_takeaway="t",
            )
            db_session.add(entry)
            db_session.flush()
            db_session.add(
                Evaluation(
                    entry_id=entry.id,
                    depth_score=35,
                    relevance_score=40,
                    one_percent_better=False,
                    verdict_explanation="b",
                    commentary="b",
                )
            )
        db_session.commit()

        resp = client.get("/api/v1/dashboard/stats")
        data = resp.json()
        assert data["trend"] == "declining"

    def test_streaks_included(self, db_session):
        """Streak data is included in dashboard response."""
        user = db_session.query(User).first()

        streak = Streak(
            user_id=user.id,
            pillar_id=1,
            current_streak=5,
            longest_streak=10,
            last_activity_date=date.today(),
            days_since_break=0,
        )
        db_session.add(streak)
        db_session.commit()

        resp = client.get("/api/v1/dashboard/stats")
        data = resp.json()
        assert len(data["streaks"]) == 1
        assert data["streaks"][0]["current_streak"] == 5
        assert data["streaks"][0]["pillar_name"] is not None

    def test_response_structure(self, db_session):
        """Response has all required fields."""
        resp = client.get("/api/v1/dashboard/stats")
        assert resp.status_code == 200
        data = resp.json()
        assert "hours" in data
        assert "pillar_breakdown" in data
        assert "avg_depth_score" in data
        assert "trend" in data
        assert "streaks" in data
        assert "all_time" in data["hours"]
        assert "this_week" in data["hours"]
        assert "this_month" in data["hours"]
