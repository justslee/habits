"""Tests for TASK-007: Auto-suggest pillar tags."""

import json
from unittest.mock import AsyncMock, patch

import pytest
from fastapi.testclient import TestClient

from app.main import app
from app.services.suggest_tags import parse_suggest_response


@pytest.fixture
def client(db_session):
    """Test client with seeded DB."""
    return TestClient(app)


def _mock_clawdbot_response(suggestions: list[dict]) -> dict:
    """Build a mock Clawdbot response."""
    return {
        "choices": [{"message": {"content": json.dumps({"suggestions": suggestions})}}]
    }


class TestSuggestTagsEndpoint:
    """Test POST /api/v1/entries/suggest-tags."""

    @patch("app.services.suggest_tags.call_clawdbot", new_callable=AsyncMock)
    def test_suggest_quant_finance(self, mock_clawdbot, client, db_session):
        """Stochastic calculus should suggest Quant Finance."""
        mock_clawdbot.return_value = _mock_clawdbot_response(
            [
                {
                    "pillar_id": 1,
                    "pillar_name": "Quantitative Finance",
                    "confidence": 0.95,
                    "sub_topics": ["stochastic calculus", "Itô's lemma"],
                }
            ]
        )

        resp = client.post(
            "/api/v1/entries/suggest-tags",
            json={"description": "Studied stochastic calculus proofs and Itô's lemma"},
        )

        assert resp.status_code == 200
        data = resp.json()
        assert len(data["suggestions"]) == 1
        assert data["suggestions"][0]["pillar_id"] == 1
        assert data["suggestions"][0]["confidence"] == 0.95
        assert "stochastic calculus" in data["suggestions"][0]["sub_topics"]

    @patch("app.services.suggest_tags.call_clawdbot", new_callable=AsyncMock)
    def test_suggest_multiple_pillars(self, mock_clawdbot, client, db_session):
        """ML for finance should suggest both ML Math and Quant Finance."""
        mock_clawdbot.return_value = _mock_clawdbot_response(
            [
                {
                    "pillar_id": 3,
                    "pillar_name": "Machine Learning (Math)",
                    "confidence": 0.85,
                    "sub_topics": ["neural networks", "backpropagation"],
                },
                {
                    "pillar_id": 1,
                    "pillar_name": "Quantitative Finance",
                    "confidence": 0.6,
                    "sub_topics": ["factor models"],
                },
            ]
        )

        resp = client.post(
            "/api/v1/entries/suggest-tags",
            json={
                "description": "Built a neural network for predicting factor returns"
            },
        )

        assert resp.status_code == 200
        suggestions = resp.json()["suggestions"]
        assert len(suggestions) == 2
        # Should be sorted by confidence desc
        assert suggestions[0]["confidence"] >= suggestions[1]["confidence"]

    @patch("app.services.suggest_tags.call_clawdbot", new_callable=AsyncMock)
    def test_suggest_with_code_fences(self, mock_clawdbot, client, db_session):
        """LLM response wrapped in code fences should still parse."""
        content = (
            '```json\n{"suggestions": [{"pillar_id": 5, '
            '"pillar_name": "Public Speaking & Communication", '
            '"confidence": 0.9, "sub_topics": ["pitch delivery"]}]}\n```'
        )
        mock_clawdbot.return_value = {"choices": [{"message": {"content": content}}]}

        resp = client.post(
            "/api/v1/entries/suggest-tags",
            json={"description": "Practiced my investor pitch for 2 hours"},
        )

        assert resp.status_code == 200
        assert resp.json()["suggestions"][0]["pillar_id"] == 5

    @patch("app.services.suggest_tags.call_clawdbot", new_callable=AsyncMock)
    def test_low_confidence_filtered(self, mock_clawdbot, client, db_session):
        """Suggestions below 0.3 confidence should be filtered out."""
        mock_clawdbot.return_value = _mock_clawdbot_response(
            [
                {
                    "pillar_id": 1,
                    "pillar_name": "Quantitative Finance",
                    "confidence": 0.8,
                    "sub_topics": [],
                },
                {
                    "pillar_id": 4,
                    "pillar_name": "AI Engineering & Deployment",
                    "confidence": 0.15,
                    "sub_topics": [],
                },
            ]
        )

        resp = client.post(
            "/api/v1/entries/suggest-tags",
            json={"description": "Read about Black-Scholes derivation"},
        )

        assert resp.status_code == 200
        suggestions = resp.json()["suggestions"]
        assert len(suggestions) == 1
        assert suggestions[0]["pillar_id"] == 1

    def test_empty_description_rejected(self, client, db_session):
        """Empty description should return 422."""
        resp = client.post(
            "/api/v1/entries/suggest-tags",
            json={"description": ""},
        )
        assert resp.status_code == 422

    @patch("app.services.suggest_tags.call_clawdbot", new_callable=AsyncMock)
    def test_invalid_pillar_id_filtered(self, mock_clawdbot, client, db_session):
        """Invalid pillar IDs from LLM should be filtered out."""
        mock_clawdbot.return_value = _mock_clawdbot_response(
            [
                {
                    "pillar_id": 999,
                    "pillar_name": "Nonexistent",
                    "confidence": 0.9,
                    "sub_topics": [],
                },
                {
                    "pillar_id": 2,
                    "pillar_name": "Macro & Qualitative Investing",
                    "confidence": 0.7,
                    "sub_topics": ["monetary policy"],
                },
            ]
        )

        resp = client.post(
            "/api/v1/entries/suggest-tags",
            json={"description": "Analyzed Fed rate decision impact on yields"},
        )

        assert resp.status_code == 200
        suggestions = resp.json()["suggestions"]
        assert len(suggestions) == 1
        assert suggestions[0]["pillar_id"] == 2


class TestParseSuggestResponse:
    """Unit tests for parse_suggest_response."""

    def test_parse_valid_response(self, db_session):
        """Parse a well-formed LLM response."""
        from app.models.pillar import Pillar

        pillars = db_session.query(Pillar).all()
        raw = _mock_clawdbot_response(
            [
                {
                    "pillar_id": 1,
                    "pillar_name": "Quantitative Finance",
                    "confidence": 0.92,
                    "sub_topics": ["options pricing"],
                }
            ]
        )

        result = parse_suggest_response(raw, pillars)
        assert len(result) == 1
        assert result[0]["pillar_id"] == 1
        assert result[0]["confidence"] == 0.92
        assert result[0]["sub_topics"] == ["options pricing"]

    def test_clamps_confidence(self, db_session):
        """Confidence > 1.0 should be clamped."""
        from app.models.pillar import Pillar

        pillars = db_session.query(Pillar).all()
        raw = _mock_clawdbot_response(
            [
                {
                    "pillar_id": 1,
                    "pillar_name": "Quantitative Finance",
                    "confidence": 1.5,
                    "sub_topics": [],
                }
            ]
        )

        result = parse_suggest_response(raw, pillars)
        assert result[0]["confidence"] == 1.0
