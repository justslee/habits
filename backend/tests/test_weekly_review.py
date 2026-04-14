"""Tests for weekly review endpoints and service."""

import json
from datetime import date, timedelta
from unittest.mock import AsyncMock, patch

from fastapi.testclient import TestClient

from app.main import app
from app.models.daily_entry import DailyEntry
from app.models.evaluation import Evaluation
from app.models.user import User
from app.models.weekly_review import WeeklyReview
from app.services.weekly_review import (
    get_current_week_bounds,
    get_last_week_bounds,
)

client = TestClient(app)

# Mock structured output — now returns dicts directly (no OpenAI wrapper)
MOCK_REVIEW_RESULT = {
    "pillar_distribution": "QF: 3h (depth 72), ML: 2h (depth 65). Other pillars neglected.",
    "comfort_zone_analysis": "Heavy lean toward technical pillars. Public speaking completely ignored for 2 weeks.",
    "recommendations": "1. Schedule 30min speaking practice Wed/Fri. 2. Add one macro reading session. 3. Push ML depth — move from textbook to proofs.",
    "letter_grade": "C",
    "grade_justification": "Decent depth in 2 pillars but ignoring 3 others is not acceptable. Balance matters.",
    "quote": '"The only way to do great work is to love what you do." — Steve Jobs',
}


class TestWeekBounds:
    def test_current_week_bounds(self):
        monday, sunday = get_current_week_bounds(date(2026, 2, 26))  # Thursday
        assert monday == date(2026, 2, 23)
        assert sunday == date(2026, 3, 1)

    def test_last_week_bounds(self):
        monday, sunday = get_last_week_bounds(date(2026, 2, 26))
        assert monday == date(2026, 2, 16)
        assert sunday == date(2026, 2, 22)


class TestReviewEndpoints:
    def test_list_reviews_empty(self, db_session):
        resp = client.get("/api/v1/reviews/")
        assert resp.status_code == 200
        assert resp.json() == []

    def test_latest_review_none(self, db_session):
        resp = client.get("/api/v1/reviews/latest")
        assert resp.status_code == 200
        assert resp.json() is None

    @patch("app.services.weekly_review.structured_output", new_callable=AsyncMock)
    def test_generate_review(self, mock_structured, db_session):
        mock_structured.return_value = MOCK_REVIEW_RESULT

        user = db_session.query(User).first()
        today = date.today()

        # Add an entry for context
        entry = DailyEntry(
            user_id=user.id,
            entry_date=today - timedelta(days=3),
            description="Studied stochastic calculus",
            time_invested_minutes=120,
            pillar_tags="1",
            difficulty_rating=8,
            energy_level=7,
            key_takeaway="Ito's lemma",
        )
        db_session.add(entry)
        db_session.commit()

        resp = client.post("/api/v1/reviews/generate")
        assert resp.status_code == 200
        data = resp.json()
        assert data["letter_grade"] == "C"
        assert "pillar_distribution" in data
        assert "recommendations" in data

    @patch("app.services.weekly_review.structured_output", new_callable=AsyncMock)
    def test_generate_review_idempotent(self, mock_structured, db_session):
        """Generating review for same week returns existing one."""
        mock_structured.return_value = MOCK_REVIEW_RESULT

        resp1 = client.post("/api/v1/reviews/generate")
        resp2 = client.post("/api/v1/reviews/generate")
        assert resp1.json()["id"] == resp2.json()["id"]
        assert mock_structured.call_count == 1  # only called once

    @patch("app.services.weekly_review.structured_output", new_callable=AsyncMock)
    def test_list_reviews_after_generate(self, mock_structured, db_session):
        mock_structured.return_value = MOCK_REVIEW_RESULT
        client.post("/api/v1/reviews/generate")

        resp = client.get("/api/v1/reviews/")
        assert resp.status_code == 200
        data = resp.json()
        assert len(data) == 1
        assert data[0]["letter_grade"] == "C"
