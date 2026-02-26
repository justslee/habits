"""Tests for run tracking API endpoints."""

from datetime import date, timedelta

from fastapi.testclient import TestClient

from app.main import app
from app.models.run import PersonalRecord, RunSession
from app.models.user import User

client = TestClient(app)


class TestCreateRun:
    def test_create_basic_run(self, db_session):
        resp = client.post("/api/v1/runs/", json={
            "distance_miles": 3.1,
            "duration_seconds": 1860,
            "run_type": "easy",
        })
        assert resp.status_code == 200
        data = resp.json()
        assert data["distance_miles"] == 3.1
        assert data["avg_pace_seconds"] == 600
        assert data["avg_pace_formatted"] == "10:00"
        assert data["status"] == "completed"

    def test_create_run_with_splits(self, db_session):
        resp = client.post("/api/v1/runs/", json={
            "distance_miles": 3.0,
            "duration_seconds": 1800,
            "splits": [
                {"mile_number": 1, "pace_seconds": 590},
                {"mile_number": 2, "pace_seconds": 600},
                {"mile_number": 3, "pace_seconds": 610},
            ],
        })
        assert resp.status_code == 200
        data = resp.json()
        assert len(data["splits"]) == 3
        assert data["splits"][0]["pace_formatted"] == "9:50"

    def test_create_run_with_date(self, db_session):
        yesterday = (date.today() - timedelta(days=1)).isoformat()
        resp = client.post("/api/v1/runs/", json={
            "distance_miles": 5.0,
            "duration_seconds": 2700,
            "run_date": yesterday,
        })
        assert resp.status_code == 200
        assert resp.json()["run_date"] == yesterday

    def test_create_run_detects_pr(self, db_session):
        # Run a mile in 7 min
        resp = client.post("/api/v1/runs/", json={
            "distance_miles": 1.0,
            "duration_seconds": 420,
        })
        assert resp.status_code == 200

        prs = client.get("/api/v1/runs/prs").json()
        mile_pr = [p for p in prs if p["distance_label"] == "mile"]
        assert len(mile_pr) == 1
        assert mile_pr[0]["time_seconds"] == 420


class TestListRuns:
    def test_list_empty(self, db_session):
        resp = client.get("/api/v1/runs/")
        assert resp.status_code == 200
        assert resp.json() == []

    def test_list_with_runs(self, db_session):
        client.post("/api/v1/runs/", json={"distance_miles": 3.0, "duration_seconds": 1800})
        client.post("/api/v1/runs/", json={"distance_miles": 5.0, "duration_seconds": 2700})

        resp = client.get("/api/v1/runs/")
        assert len(resp.json()) == 2

    def test_filter_by_type(self, db_session):
        client.post("/api/v1/runs/", json={"distance_miles": 3.0, "duration_seconds": 1800, "run_type": "easy"})
        client.post("/api/v1/runs/", json={"distance_miles": 5.0, "duration_seconds": 2250, "run_type": "tempo"})

        resp = client.get("/api/v1/runs/?run_type=tempo")
        data = resp.json()
        assert len(data) == 1
        assert data[0]["run_type"] == "tempo"


class TestGetRun:
    def test_get_existing(self, db_session):
        create = client.post("/api/v1/runs/", json={"distance_miles": 3.0, "duration_seconds": 1800})
        run_id = create.json()["id"]

        resp = client.get(f"/api/v1/runs/{run_id}")
        assert resp.status_code == 200
        assert resp.json()["distance_miles"] == 3.0

    def test_get_not_found(self, db_session):
        resp = client.get("/api/v1/runs/9999")
        assert resp.status_code == 404


class TestRunStats:
    def test_stats_empty(self, db_session):
        resp = client.get("/api/v1/runs/stats")
        assert resp.status_code == 200
        data = resp.json()
        assert data["total_runs"] == 0
        assert data["total_miles"] == 0

    def test_stats_with_runs(self, db_session):
        client.post("/api/v1/runs/", json={"distance_miles": 3.0, "duration_seconds": 1800})
        client.post("/api/v1/runs/", json={"distance_miles": 5.0, "duration_seconds": 2700})

        resp = client.get("/api/v1/runs/stats")
        data = resp.json()
        assert data["total_runs"] == 2
        assert data["total_miles"] == 8.0
        assert data["longest_run_miles"] == 5.0


class TestPRs:
    def test_prs_empty(self, db_session):
        resp = client.get("/api/v1/runs/prs")
        assert resp.status_code == 200
        assert resp.json() == []

    def test_pr_updated_on_faster_run(self, db_session):
        # First mile: 8 min
        client.post("/api/v1/runs/", json={"distance_miles": 1.0, "duration_seconds": 480})
        # Faster mile: 7 min
        client.post("/api/v1/runs/", json={"distance_miles": 1.0, "duration_seconds": 420})

        prs = client.get("/api/v1/runs/prs").json()
        mile_pr = [p for p in prs if p["distance_label"] == "mile"]
        assert len(mile_pr) == 1
        assert mile_pr[0]["time_seconds"] == 420  # faster time wins
