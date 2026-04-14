"""Tests for TASK-007: Auto-suggest pillar tags."""

from unittest.mock import AsyncMock, patch

import pytest
from fastapi.testclient import TestClient

from app.main import app


@pytest.fixture
def client(db_session):
    """Test client with seeded DB."""
    return TestClient(app)


class TestSuggestTagsEndpoint:
    """Test POST /api/v1/entries/suggest-tags."""

    @patch("app.services.suggest_tags.structured_output", new_callable=AsyncMock)
    def test_suggest_quant_finance(self, mock_structured, client, db_session):
        """Stochastic calculus should suggest Quant Finance."""
        mock_structured.return_value = {
            "suggestions": [
                {
                    "pillar_id": 1,
                    "pillar_name": "Quantitative Finance",
                    "confidence": 0.95,
                    "sub_topics": ["stochastic calculus", "Itô's lemma"],
                }
            ]
        }

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

    @patch("app.services.suggest_tags.structured_output", new_callable=AsyncMock)
    def test_suggest_multiple_pillars(self, mock_structured, client, db_session):
        """ML for finance should suggest both ML Math and Quant Finance."""
        mock_structured.return_value = {
            "suggestions": [
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
        }

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

    @patch("app.services.suggest_tags.structured_output", new_callable=AsyncMock)
    def test_low_confidence_filtered(self, mock_structured, client, db_session):
        """Suggestions below 0.3 confidence should be filtered out."""
        mock_structured.return_value = {
            "suggestions": [
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
        }

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

    @patch("app.services.suggest_tags.structured_output", new_callable=AsyncMock)
    def test_invalid_pillar_id_filtered(self, mock_structured, client, db_session):
        """Invalid pillar IDs from LLM should be filtered out."""
        mock_structured.return_value = {
            "suggestions": [
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
        }

        resp = client.post(
            "/api/v1/entries/suggest-tags",
            json={"description": "Analyzed Fed rate decision impact on yields"},
        )

        assert resp.status_code == 200
        suggestions = resp.json()["suggestions"]
        assert len(suggestions) == 1
        assert suggestions[0]["pillar_id"] == 2

    @patch("app.services.suggest_tags.structured_output", new_callable=AsyncMock)
    def test_uses_haiku_model(self, mock_structured, client, db_session):
        """Tag suggestion should use Haiku for cost efficiency."""
        mock_structured.return_value = {"suggestions": []}

        client.post(
            "/api/v1/entries/suggest-tags",
            json={"description": "Studied options pricing"},
        )

        call_kwargs = mock_structured.call_args[1]
        assert "haiku" in call_kwargs["model"]
