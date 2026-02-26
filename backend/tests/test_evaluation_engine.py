"""Tests for the AI evaluation engine (TASK-005).

All LLM calls are mocked — no actual Clawdbot calls in tests.
"""

import json
from unittest.mock import AsyncMock, patch

import pytest
from fastapi.testclient import TestClient

from app.main import app
from app.models.daily_entry import DailyEntry
from app.models.evaluation import Evaluation
from app.services.evaluation import (
    SYSTEM_PROMPT,
    _build_user_prompt,
    parse_llm_response,
)

client = TestClient(app)

# Sample LLM response matching expected format
MOCK_LLM_RESPONSE = {
    "choices": [
        {
            "message": {
                "content": json.dumps(
                    {
                        "depth_score": 72,
                        "relevance_score": 85,
                        "one_percent_better": True,
                        "verdict_explanation": "Working through stochastic calculus proofs is exactly the kind of deep engagement that compounds.",
                        "commentary": "Solid session. You didn't just read about Itô's lemma — you proved it. That's the difference between knowing and understanding. The 90 minutes was well spent, though I'd push you to attempt the multi-dimensional case next time. Don't get comfortable with 1D.",
                    }
                )
            }
        }
    ]
}

MOCK_LOW_SCORE_RESPONSE = {
    "choices": [
        {
            "message": {
                "content": json.dumps(
                    {
                        "depth_score": 15,
                        "relevance_score": 30,
                        "one_percent_better": False,
                        "verdict_explanation": "Watching a YouTube overview is not learning. It's entertainment with a guilt-free wrapper.",
                        "commentary": "You spent 20 minutes watching a summary video about options pricing. That's passive consumption, not active learning. You didn't work a single problem, derive a single equation, or build anything. This is the equivalent of watching someone else do pushups and calling it a workout.",
                    }
                )
            }
        }
    ]
}


ENTRY_PAYLOAD = {
    "description": "Worked through proofs of Itô's lemma from Shreve's Stochastic Calculus for Finance II. Derived the formula from first principles and verified with three practice problems.",
    "time_invested_minutes": 90,
    "pillar_tags": [1],
    "difficulty_rating": 8,
    "energy_level": 7,
    "key_takeaway": "Itô's lemma is essentially the chain rule for stochastic processes, but the extra term from quadratic variation is what makes it non-trivial.",
}


class TestParseResponse:
    """Test LLM response parsing."""

    def test_parse_valid_response(self):
        result = parse_llm_response(MOCK_LLM_RESPONSE)
        assert result["depth_score"] == 72
        assert result["relevance_score"] == 85
        assert result["one_percent_better"] is True
        assert "stochastic calculus" in result["verdict_explanation"]
        assert len(result["commentary"]) > 0

    def test_parse_low_score_response(self):
        result = parse_llm_response(MOCK_LOW_SCORE_RESPONSE)
        assert result["depth_score"] == 15
        assert result["relevance_score"] == 30
        assert result["one_percent_better"] is False

    def test_parse_clamps_scores(self):
        """Scores outside 0-100 get clamped."""
        bad_response = {
            "choices": [
                {
                    "message": {
                        "content": json.dumps(
                            {
                                "depth_score": 150,
                                "relevance_score": -10,
                                "one_percent_better": True,
                                "verdict_explanation": "test",
                                "commentary": "test",
                            }
                        )
                    }
                }
            ]
        }
        result = parse_llm_response(bad_response)
        assert result["depth_score"] == 100
        assert result["relevance_score"] == 0

    def test_parse_markdown_wrapped_json(self):
        """Handle LLM wrapping JSON in markdown code fences."""
        wrapped = {
            "choices": [
                {
                    "message": {
                        "content": "```json\n"
                        + json.dumps(
                            {
                                "depth_score": 50,
                                "relevance_score": 60,
                                "one_percent_better": True,
                                "verdict_explanation": "test",
                                "commentary": "test",
                            }
                        )
                        + "\n```"
                    }
                }
            ]
        }
        result = parse_llm_response(wrapped)
        assert result["depth_score"] == 50

    def test_parse_invalid_json_raises(self):
        bad = {"choices": [{"message": {"content": "not json at all"}}]}
        with pytest.raises(json.JSONDecodeError):
            parse_llm_response(bad)


class TestSystemPrompt:
    """Test the evaluation prompt design."""

    def test_system_prompt_enforces_honesty(self):
        assert "participation trophies" in SYSTEM_PROMPT.lower()
        assert "brutally honest" in SYSTEM_PROMPT.lower()

    def test_system_prompt_requires_json(self):
        assert "depth_score" in SYSTEM_PROMPT
        assert "relevance_score" in SYSTEM_PROMPT
        assert "one_percent_better" in SYSTEM_PROMPT
        assert "commentary" in SYSTEM_PROMPT

    def test_system_prompt_has_scoring_guidelines(self):
        assert "0-20" in SYSTEM_PROMPT
        assert "81-100" in SYSTEM_PROMPT


class TestBuildPrompt:
    """Test user prompt construction."""

    def test_build_prompt_with_pillars(self, db_session):
        from app.models.pillar import Pillar

        entry = DailyEntry(
            id=99,
            user_id=1,
            entry_date="2026-02-25",
            description="Studied stochastic calculus",
            time_invested_minutes=60,
            difficulty_rating=7,
            energy_level=8,
            key_takeaway="Learned Itô's lemma",
        )
        entry.pillar_tag_list = [1]

        pillars = db_session.query(Pillar).all()
        prompt = _build_user_prompt(entry, pillars)

        assert "Studied stochastic calculus" in prompt
        assert "60 minutes" in prompt
        assert "Quantitative Finance" in prompt
        assert "7/10" in prompt


class TestEvaluateEndpoint:
    """Test the POST /api/v1/entries/{id}/evaluate endpoint."""

    @patch("app.services.evaluation.call_clawdbot", new_callable=AsyncMock)
    def test_evaluate_entry_success(self, mock_clawdbot, db_session):
        mock_clawdbot.return_value = MOCK_LLM_RESPONSE

        # Create an entry first
        resp = client.post("/api/v1/entries", json=ENTRY_PAYLOAD)
        assert resp.status_code == 201
        entry_id = resp.json()["id"]

        # Evaluate it
        resp = client.post(f"/api/v1/entries/{entry_id}/evaluate")
        assert resp.status_code == 200
        data = resp.json()

        assert data["evaluation"] is not None
        assert data["evaluation"]["depth_score"] == 72
        assert data["evaluation"]["relevance_score"] == 85
        assert data["evaluation"]["one_percent_better"] is True
        assert len(data["evaluation"]["commentary"]) > 0

        # Verify stored in DB
        eval_obj = db_session.query(Evaluation).filter_by(entry_id=entry_id).first()
        assert eval_obj is not None
        assert eval_obj.depth_score == 72

    @patch("app.services.evaluation.call_clawdbot", new_callable=AsyncMock)
    def test_evaluate_already_evaluated_returns_409(self, mock_clawdbot, db_session):
        mock_clawdbot.return_value = MOCK_LLM_RESPONSE

        resp = client.post("/api/v1/entries", json=ENTRY_PAYLOAD)
        entry_id = resp.json()["id"]

        # First evaluation succeeds
        resp = client.post(f"/api/v1/entries/{entry_id}/evaluate")
        assert resp.status_code == 200

        # Second evaluation fails with 409
        resp = client.post(f"/api/v1/entries/{entry_id}/evaluate")
        assert resp.status_code == 409

    def test_evaluate_nonexistent_entry_returns_404(self, db_session):
        resp = client.post("/api/v1/entries/9999/evaluate")
        assert resp.status_code == 404

    @patch("app.services.evaluation.call_clawdbot", new_callable=AsyncMock)
    def test_evaluate_low_score_entry(self, mock_clawdbot, db_session):
        mock_clawdbot.return_value = MOCK_LOW_SCORE_RESPONSE

        payload = {
            "description": "Watched a 20-minute YouTube video about options pricing basics",
            "time_invested_minutes": 20,
            "pillar_tags": [1],
            "difficulty_rating": 2,
            "energy_level": 4,
            "key_takeaway": "Options have intrinsic and extrinsic value",
        }
        resp = client.post("/api/v1/entries", json=payload)
        entry_id = resp.json()["id"]

        resp = client.post(f"/api/v1/entries/{entry_id}/evaluate")
        assert resp.status_code == 200
        data = resp.json()

        assert data["evaluation"]["depth_score"] == 15
        assert data["evaluation"]["one_percent_better"] is False

    @patch("app.services.evaluation.call_clawdbot", new_callable=AsyncMock)
    def test_evaluation_visible_in_get_entry(self, mock_clawdbot, db_session):
        """After evaluation, GET /entries/{id} includes evaluation data."""
        mock_clawdbot.return_value = MOCK_LLM_RESPONSE

        resp = client.post("/api/v1/entries", json=ENTRY_PAYLOAD)
        entry_id = resp.json()["id"]

        client.post(f"/api/v1/entries/{entry_id}/evaluate")

        resp = client.get(f"/api/v1/entries/{entry_id}")
        assert resp.status_code == 200
        assert resp.json()["evaluation"]["depth_score"] == 72
