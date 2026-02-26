"""Tests for milestone API endpoints."""

from fastapi.testclient import TestClient

from app.main import app

client = TestClient(app)


def test_create_milestone(db_session):
    """POST /api/v1/milestones creates a milestone."""
    resp = client.post(
        "/api/v1/milestones",
        json={
            "title": "First derivatives model built",
            "description": "Built a Black-Scholes pricer from scratch",
            "achieved_date": "2026-02-20",
            "pillar_id": 1,
        },
    )
    assert resp.status_code == 201
    data = resp.json()
    assert data["title"] == "First derivatives model built"
    assert data["achieved_date"] == "2026-02-20"
    assert data["pillar_id"] == 1
    assert data["id"] is not None


def test_create_milestone_minimal(db_session):
    """POST /api/v1/milestones works with only required fields."""
    resp = client.post(
        "/api/v1/milestones",
        json={
            "title": "Started learning",
            "achieved_date": "2026-01-01",
        },
    )
    assert resp.status_code == 201
    data = resp.json()
    assert data["pillar_id"] is None
    assert data["description"] is None


def test_list_milestones_empty(db_session):
    """GET /api/v1/milestones returns empty list when none exist."""
    resp = client.get("/api/v1/milestones")
    assert resp.status_code == 200
    assert resp.json() == []


def test_list_milestones_chronological(db_session):
    """GET /api/v1/milestones returns milestones in chronological order."""
    client.post(
        "/api/v1/milestones",
        json={"title": "Later", "achieved_date": "2026-03-01", "pillar_id": 1},
    )
    client.post(
        "/api/v1/milestones",
        json={"title": "Earlier", "achieved_date": "2026-01-15", "pillar_id": 2},
    )
    client.post(
        "/api/v1/milestones",
        json={"title": "Middle", "achieved_date": "2026-02-10"},
    )

    resp = client.get("/api/v1/milestones")
    assert resp.status_code == 200
    data = resp.json()
    assert len(data) == 3
    assert data[0]["title"] == "Earlier"
    assert data[1]["title"] == "Middle"
    assert data[2]["title"] == "Later"


def test_list_milestones_filter_by_pillar(db_session):
    """GET /api/v1/milestones?pillar_id=1 filters by pillar."""
    client.post(
        "/api/v1/milestones",
        json={"title": "Quant milestone", "achieved_date": "2026-02-01", "pillar_id": 1},
    )
    client.post(
        "/api/v1/milestones",
        json={"title": "Speaking milestone", "achieved_date": "2026-02-02", "pillar_id": 5},
    )
    client.post(
        "/api/v1/milestones",
        json={"title": "No pillar", "achieved_date": "2026-02-03"},
    )

    resp = client.get("/api/v1/milestones", params={"pillar_id": 1})
    assert resp.status_code == 200
    data = resp.json()
    assert len(data) == 1
    assert data[0]["title"] == "Quant milestone"


def test_create_milestone_validation(db_session):
    """POST /api/v1/milestones rejects invalid data."""
    # Missing title
    resp = client.post(
        "/api/v1/milestones",
        json={"achieved_date": "2026-02-01"},
    )
    assert resp.status_code == 422

    # Missing date
    resp = client.post(
        "/api/v1/milestones",
        json={"title": "Something"},
    )
    assert resp.status_code == 422

    # Empty title
    resp = client.post(
        "/api/v1/milestones",
        json={"title": "", "achieved_date": "2026-02-01"},
    )
    assert resp.status_code == 422
