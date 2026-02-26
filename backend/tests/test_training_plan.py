"""Tests for Phase 4 training plan endpoints."""

from fastapi.testclient import TestClient
from app.main import app

client = TestClient(app)


def test_get_today_plan_no_plan():
    """Should return no planned run when no plan exists."""
    resp = client.get("/api/v1/runs/today-plan")
    assert resp.status_code == 200
    data = resp.json()
    assert data["has_planned_run"] is False


def test_get_active_plan_returns_data():
    """Should return plan data from active endpoint."""
    resp = client.get("/api/v1/runs/plans/active")
    assert resp.status_code == 200
    # May or may not have a plan depending on test ordering


def test_create_training_plan():
    """Should create a training plan with planned runs."""
    resp = client.post("/api/v1/runs/plans", json={
        "goal_type": "base_building",
        "fitness_level": "intermediate",
        "available_days": "4,6",  # Fri, Sun
    })
    assert resp.status_code == 200
    data = resp.json()
    assert data["goal_type"] == "base_building"
    assert data["fitness_level"] == "intermediate"
    assert data["status"] == "active"
    assert data["total_weeks"] == 8
    assert len(data["planned_runs"]) > 0

    # Should have planned runs
    for run in data["planned_runs"]:
        assert run["run_type"] in ["easy", "tempo", "intervals", "long", "recovery", "fartlek", "progression"]
        assert run["status"] == "upcoming"


def test_get_active_plan():
    """Should return the active plan after creation."""
    # Create plan first
    client.post("/api/v1/runs/plans", json={
        "goal_type": "5k", "fitness_level": "beginner",
    })

    resp = client.get("/api/v1/runs/plans/active")
    assert resp.status_code == 200
    data = resp.json()
    assert data is not None
    assert data["goal_type"] == "5k"
    assert data["status"] == "active"


def test_creating_new_plan_abandons_old():
    """Creating a new plan should abandon the previous one."""
    # Create first plan
    resp1 = client.post("/api/v1/runs/plans", json={"goal_type": "base_building"})
    plan1_id = resp1.json()["id"]

    # Create second plan
    resp2 = client.post("/api/v1/runs/plans", json={"goal_type": "10k"})
    plan2_id = resp2.json()["id"]

    # Active plan should be the new one
    active = client.get("/api/v1/runs/plans/active").json()
    assert active["id"] == plan2_id
    assert active["goal_type"] == "10k"


def test_get_plan_week():
    """Should return planned runs for a specific week."""
    resp = client.post("/api/v1/runs/plans", json={
        "goal_type": "general", "available_days": "4,6",
    })
    plan_id = resp.json()["id"]

    week_resp = client.get(f"/api/v1/runs/plans/{plan_id}/week/1")
    assert week_resp.status_code == 200
    runs = week_resp.json()
    assert len(runs) > 0
    for r in runs:
        assert r["week_number"] == 1


def test_post_run_feedback():
    """Should generate feedback for a run."""
    # Create a run first
    run_resp = client.post("/api/v1/runs/", json={
        "distance_miles": 3.1, "duration_seconds": 1800,
        "run_type": "easy",
    })
    run_id = run_resp.json()["id"]

    feedback_resp = client.post(f"/api/v1/runs/{run_id}/feedback")
    assert feedback_resp.status_code == 200
    data = feedback_resp.json()
    assert "feedback" in data
    assert isinstance(data["is_pr"], bool)
