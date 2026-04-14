"""Tests for adaptive calibration (TASK-006).

Covers:
- Pillar level context computation (rolling avg depth score)
- Consistency multiplier from streak data
- Adaptive context block generation for evaluation prompts
- Integration: evaluation uses adaptive context
"""

import json
import math
from datetime import date, timedelta
from unittest.mock import AsyncMock, patch

import pytest
from fastapi.testclient import TestClient

from app.main import app
from app.models.daily_entry import DailyEntry
from app.models.evaluation import Evaluation
from app.models.pillar import Pillar
from app.models.streak import Streak
from app.services.adaptive import (
    PillarContext,
    build_adaptive_context_block,
    calculate_consistency_multiplier,
    get_pillar_contexts,
    get_recent_entries_for_pillar,
)

client = TestClient(app)

MOCK_HIGH_SCORE = {
    "choices": [
        {
            "message": {
                "content": json.dumps(
                    {
                        "depth_score": 75,
                        "relevance_score": 80,
                        "one_percent_better": True,
                        "verdict_explanation": "Strong session pushing boundaries.",
                        "commentary": "Excellent deep work on advanced material.",
                    }
                )
            }
        }
    ]
}

MOCK_LOW_SCORE = {
    "choices": [
        {
            "message": {
                "content": json.dumps(
                    {
                        "depth_score": 10,
                        "relevance_score": 20,
                        "one_percent_better": False,
                        "verdict_explanation": "Re-reading intro material you already know.",
                        "commentary": "This is comfort zone activity, not growth.",
                    }
                )
            }
        }
    ]
}


def _create_entry_with_eval(
    db, user_id, pillar_id, depth_score, entry_date, description="Study session"
):
    """Helper: create an entry with a completed evaluation."""
    entry = DailyEntry(
        user_id=user_id,
        entry_date=entry_date,
        description=description,
        time_invested_minutes=60,
        difficulty_rating=7,
        energy_level=7,
        key_takeaway="Learned something",
    )
    entry.pillar_tag_list = [pillar_id]
    db.add(entry)
    db.flush()

    evaluation = Evaluation(
        entry_id=entry.id,
        depth_score=depth_score,
        relevance_score=depth_score,  # same for simplicity
        consistency_multiplier=1.0,
        one_percent_better=depth_score >= 50,
        verdict_explanation="Test evaluation",
        commentary="Test commentary",
    )
    db.add(evaluation)
    db.flush()
    return entry, evaluation


def _create_streak(db, user_id, pillar_id, current_streak, longest_streak=None):
    """Helper: create a streak record."""
    streak = Streak(
        user_id=user_id,
        pillar_id=pillar_id,
        current_streak=current_streak,
        longest_streak=longest_streak or current_streak,
        days_since_break=0,
        last_activity_date=date.today(),
    )
    db.add(streak)
    db.flush()
    return streak


class TestPillarContexts:
    """Test pillar level context computation."""

    def test_no_entries_returns_empty(self, db_session):
        contexts = get_pillar_contexts(user_id=1, db=db_session)
        assert contexts == []

    def test_single_pillar_avg_depth(self, db_session):
        """Rolling average depth is computed correctly."""
        today = date.today()
        for i in range(5):
            _create_entry_with_eval(
                db_session,
                user_id=1,
                pillar_id=1,
                depth_score=60 + i * 5,  # 60, 65, 70, 75, 80
                entry_date=today - timedelta(days=5 - i),
            )
        db_session.commit()

        contexts = get_pillar_contexts(user_id=1, db=db_session)
        assert len(contexts) == 1
        ctx = contexts[0]
        assert ctx.pillar_name == "Quantitative Finance"
        assert ctx.avg_depth_score == 70.0  # (60+65+70+75+80)/5
        assert ctx.entry_count == 5

    def test_multiple_pillars(self, db_session):
        """Contexts returned for each pillar with entries."""
        today = date.today()
        _create_entry_with_eval(db_session, 1, 1, 70, today)
        _create_entry_with_eval(db_session, 1, 3, 50, today)
        db_session.commit()

        contexts = get_pillar_contexts(user_id=1, db=db_session)
        pillar_ids = {c.pillar_id for c in contexts}
        assert 1 in pillar_ids
        assert 3 in pillar_ids

    def test_includes_streak_info(self, db_session):
        """Pillar context includes streak data."""
        today = date.today()
        _create_entry_with_eval(db_session, 1, 1, 70, today)
        _create_streak(db_session, 1, 1, current_streak=7, longest_streak=14)
        db_session.commit()

        contexts = get_pillar_contexts(user_id=1, db=db_session)
        assert len(contexts) == 1
        assert contexts[0].current_streak == 7
        assert contexts[0].longest_streak == 14


class TestRecentEntries:
    """Test recent entry history retrieval."""

    def test_returns_recent_entries(self, db_session):
        today = date.today()
        for i in range(3):
            _create_entry_with_eval(
                db_session, 1, 1, 60, today - timedelta(days=i),
                description=f"Session {i}"
            )
        db_session.commit()

        recent = get_recent_entries_for_pillar(1, 1, db_session, limit=5)
        assert len(recent) == 3
        assert recent[0].depth_score == 60

    def test_respects_limit(self, db_session):
        today = date.today()
        for i in range(10):
            _create_entry_with_eval(db_session, 1, 1, 50, today - timedelta(days=i))
        db_session.commit()

        recent = get_recent_entries_for_pillar(1, 1, db_session, limit=3)
        assert len(recent) == 3

    def test_truncates_description(self, db_session):
        long_desc = "x" * 500
        _create_entry_with_eval(db_session, 1, 1, 50, date.today(), description=long_desc)
        db_session.commit()

        recent = get_recent_entries_for_pillar(1, 1, db_session)
        assert len(recent[0].description) <= 200


class TestConsistencyMultiplier:
    """Test consistency multiplier calculation from streak data."""

    def test_no_streaks_returns_penalty(self, db_session):
        mult = calculate_consistency_multiplier(1, [1], db_session)
        assert mult == 0.85

    def test_no_pillar_ids_returns_neutral(self, db_session):
        mult = calculate_consistency_multiplier(1, [], db_session)
        assert mult == 1.0

    def test_zero_streak_below_one(self, db_session):
        """Zero-day streak should give a multiplier below 1.0."""
        _create_streak(db_session, 1, 1, current_streak=0)
        db_session.commit()

        mult = calculate_consistency_multiplier(1, [1], db_session)
        assert mult < 1.0

    def test_moderate_streak_near_one(self, db_session):
        """3-day streak should be near 1.0."""
        _create_streak(db_session, 1, 1, current_streak=3)
        db_session.commit()

        mult = calculate_consistency_multiplier(1, [1], db_session)
        assert 0.95 <= mult <= 1.05

    def test_long_streak_above_one(self, db_session):
        """7+ day streak should give bonus above 1.0."""
        _create_streak(db_session, 1, 1, current_streak=10)
        db_session.commit()

        mult = calculate_consistency_multiplier(1, [1], db_session)
        assert mult > 1.0

    def test_very_long_streak_capped(self, db_session):
        """Even very long streaks shouldn't exceed 1.3."""
        _create_streak(db_session, 1, 1, current_streak=100)
        db_session.commit()

        mult = calculate_consistency_multiplier(1, [1], db_session)
        assert mult <= 1.3

    def test_multiple_pillars_averaged(self, db_session):
        """Multiplier averages across pillars."""
        _create_streak(db_session, 1, 1, current_streak=10)
        _create_streak(db_session, 1, 2, current_streak=0)
        db_session.commit()

        mult = calculate_consistency_multiplier(1, [1, 2], db_session)
        # Average streak = 5, should be slightly above 1.0
        assert 0.95 < mult < 1.25


class TestAdaptiveContextBlock:
    """Test the text block generation for prompt injection."""

    def test_empty_when_no_history(self, db_session):
        block = build_adaptive_context_block(1, [1], db_session)
        assert block == ""

    def test_includes_pillar_level(self, db_session):
        today = date.today()
        _create_entry_with_eval(db_session, 1, 1, 72, today)
        _create_streak(db_session, 1, 1, current_streak=5)
        db_session.commit()

        block = build_adaptive_context_block(1, [1], db_session)
        assert "Quantitative Finance" in block
        assert "72.0/100" in block
        assert "5 days" in block

    def test_includes_calibration_instructions(self, db_session):
        _create_entry_with_eval(db_session, 1, 1, 50, date.today())
        db_session.commit()

        block = build_adaptive_context_block(1, [1], db_session)
        assert "Calibration Instructions" in block
        assert "score near zero" in block.lower() or "score it LOW" in block

    def test_includes_recent_sessions(self, db_session):
        _create_entry_with_eval(
            db_session, 1, 1, 65, date.today(), description="Proved Girsanov theorem"
        )
        db_session.commit()

        block = build_adaptive_context_block(1, [1], db_session)
        assert "Proved Girsanov theorem" in block


class TestEvaluationIntegration:
    """Test that evaluate_entry uses adaptive context end-to-end."""

    @patch("app.services.evaluation.call_claude", new_callable=AsyncMock)
    def test_evaluation_uses_adaptive_context(self, mock_claude, db_session):
        """When prior history exists, evaluation prompt includes adaptive context."""
        mock_claude.return_value = MOCK_HIGH_SCORE

        today = date.today()
        # Create prior history
        for i in range(3):
            _create_entry_with_eval(db_session, 1, 1, 70, today - timedelta(days=3 - i))
        _create_streak(db_session, 1, 1, current_streak=5)
        db_session.commit()

        # Create a new entry via API
        payload = {
            "description": "Derived Black-Scholes from risk-neutral pricing",
            "time_invested_minutes": 90,
            "pillar_tags": [1],
            "difficulty_rating": 8,
            "energy_level": 7,
            "key_takeaway": "Risk-neutral measure simplifies everything",
        }
        resp = client.post("/api/v1/entries", json=payload)
        assert resp.status_code == 201
        entry_id = resp.json()["id"]

        # Evaluate
        resp = client.post(f"/api/v1/entries/{entry_id}/evaluate")
        assert resp.status_code == 200

        # Verify the system prompt passed to Claude included adaptive context
        call_args = mock_claude.call_args
        system_prompt = call_args[1]["system_prompt"] if "system_prompt" in (call_args[1] or {}) else call_args[0][0]
        assert "Current Level" in system_prompt or "Calibration" in system_prompt

    @patch("app.services.evaluation.call_claude", new_callable=AsyncMock)
    def test_consistency_multiplier_from_streak(self, mock_claude, db_session):
        """Consistency multiplier is calculated from actual streak data."""
        mock_claude.return_value = MOCK_HIGH_SCORE

        # Create a streak
        _create_streak(db_session, 1, 1, current_streak=10)
        db_session.commit()

        payload = {
            "description": "Advanced stochastic calculus problem set",
            "time_invested_minutes": 120,
            "pillar_tags": [1],
            "difficulty_rating": 9,
            "energy_level": 8,
            "key_takeaway": "Martingale representation theorem is powerful",
        }
        resp = client.post("/api/v1/entries", json=payload)
        entry_id = resp.json()["id"]

        resp = client.post(f"/api/v1/entries/{entry_id}/evaluate")
        assert resp.status_code == 200

        # Check stored multiplier is not the old hardcoded 1.0
        eval_obj = db_session.query(Evaluation).filter_by(entry_id=entry_id).first()
        assert eval_obj is not None
        assert eval_obj.consistency_multiplier != 1.0
        assert eval_obj.consistency_multiplier > 1.0  # 10-day streak = bonus

    @patch("app.services.evaluation.call_claude", new_callable=AsyncMock)
    def test_no_history_still_works(self, mock_claude, db_session):
        """Evaluation works fine with no prior history (new user)."""
        mock_claude.return_value = MOCK_HIGH_SCORE

        payload = {
            "description": "First ever study session on options pricing",
            "time_invested_minutes": 45,
            "pillar_tags": [1],
            "difficulty_rating": 5,
            "energy_level": 6,
            "key_takeaway": "Put-call parity is elegant",
        }
        resp = client.post("/api/v1/entries", json=payload)
        entry_id = resp.json()["id"]

        resp = client.post(f"/api/v1/entries/{entry_id}/evaluate")
        assert resp.status_code == 200
        data = resp.json()
        assert data["evaluation"]["depth_score"] == 75
