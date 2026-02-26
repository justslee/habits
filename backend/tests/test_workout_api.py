"""Tests for workout API endpoints."""

from datetime import date, timedelta
from unittest.mock import AsyncMock, patch

from fastapi.testclient import TestClient

from app.main import app
from app.models.user import User
from app.models.workout import ExerciseProfile, WorkoutSession

client = TestClient(app)


class TestCreateWorkoutSession:
    def test_create_empty_session(self, db_session):
        resp = client.post("/api/v1/workouts/", json={
            "day_type": "push",
        })
        assert resp.status_code == 200
        data = resp.json()
        assert data["day_type"] == "push"
        assert data["status"] == "planned"
        assert data["exercises"] == []

    def test_create_session_with_exercises(self, db_session):
        resp = client.post("/api/v1/workouts/", json={
            "day_type": "push",
            "exercises": [
                {"exercise_name": "Bench Press", "set_number": 1, "weight": 165, "reps": 5},
                {"exercise_name": "Bench Press", "set_number": 2, "weight": 165, "reps": 5},
                {"exercise_name": "OHP", "set_number": 1, "weight": 95, "reps": 8},
            ],
        })
        assert resp.status_code == 200
        data = resp.json()
        assert data["status"] == "completed"
        assert len(data["exercises"]) == 3

    def test_create_session_with_date(self, db_session):
        yesterday = (date.today() - timedelta(days=1)).isoformat()
        resp = client.post("/api/v1/workouts/", json={
            "day_type": "pull",
            "session_date": yesterday,
        })
        assert resp.status_code == 200
        assert resp.json()["session_date"] == yesterday


class TestListWorkoutSessions:
    def test_list_empty(self, db_session):
        resp = client.get("/api/v1/workouts/")
        assert resp.status_code == 200
        assert resp.json() == []

    def test_list_with_filter(self, db_session):
        client.post("/api/v1/workouts/", json={"day_type": "push"})
        client.post("/api/v1/workouts/", json={"day_type": "pull"})

        resp = client.get("/api/v1/workouts/?day_type=push")
        assert resp.status_code == 200
        data = resp.json()
        assert len(data) == 1
        assert data[0]["day_type"] == "push"


class TestGetWorkoutSession:
    def test_get_existing(self, db_session):
        create_resp = client.post("/api/v1/workouts/", json={"day_type": "legs"})
        session_id = create_resp.json()["id"]

        resp = client.get(f"/api/v1/workouts/{session_id}")
        assert resp.status_code == 200
        assert resp.json()["day_type"] == "legs"

    def test_get_not_found(self, db_session):
        resp = client.get("/api/v1/workouts/9999")
        assert resp.status_code == 404


class TestAddExerciseLog:
    def test_add_set(self, db_session):
        create_resp = client.post("/api/v1/workouts/", json={"day_type": "push"})
        session_id = create_resp.json()["id"]

        resp = client.post(f"/api/v1/workouts/{session_id}/exercises", json={
            "exercise_name": "Bench Press",
            "set_number": 1,
            "weight": 165,
            "reps": 5,
        })
        assert resp.status_code == 200
        data = resp.json()
        assert data["exercise_name"] == "Bench Press"
        assert data["weight"] == 165
        assert data["reps"] == 5

    def test_add_set_updates_status(self, db_session):
        create_resp = client.post("/api/v1/workouts/", json={"day_type": "push"})
        session_id = create_resp.json()["id"]

        client.post(f"/api/v1/workouts/{session_id}/exercises", json={
            "exercise_name": "Bench Press",
            "set_number": 1,
            "weight": 165,
            "reps": 5,
        })

        session = client.get(f"/api/v1/workouts/{session_id}").json()
        assert session["status"] == "in_progress"


class TestExerciseProfiles:
    def test_list_empty(self, db_session):
        resp = client.get("/api/v1/workouts/exercises/profiles")
        assert resp.status_code == 200
        assert resp.json() == []

    def test_list_profiles(self, db_session):
        user = db_session.query(User).first()
        profile = ExerciseProfile(
            user_id=user.id,
            exercise_name="Bench Press",
            muscle_group="push",
            current_working_weight=165,
            current_rep_target=5,
            current_set_target=4,
        )
        db_session.add(profile)
        db_session.commit()

        resp = client.get("/api/v1/workouts/exercises/profiles")
        assert resp.status_code == 200
        data = resp.json()
        assert len(data) == 1
        assert data[0]["exercise_name"] == "Bench Press"
        assert data[0]["current_working_weight"] == 165


class TestProfileUpdate:
    def test_profile_updates_on_session_create(self, db_session):
        """When creating a session with exercises, profiles should update."""
        user = db_session.query(User).first()
        profile = ExerciseProfile(
            user_id=user.id,
            exercise_name="Bench Press",
            muscle_group="push",
            current_working_weight=165,
            current_rep_target=5,
            current_set_target=4,
        )
        db_session.add(profile)
        db_session.commit()

        # Log a session where all sets hit target
        client.post("/api/v1/workouts/", json={
            "day_type": "push",
            "exercises": [
                {"exercise_name": "Bench Press", "set_number": i, "weight": 165, "reps": 5}
                for i in range(1, 5)
            ],
        })

        # Profile should have progressed
        profiles = client.get("/api/v1/workouts/exercises/profiles").json()
        bp = [p for p in profiles if p["exercise_name"] == "Bench Press"][0]
        assert bp["current_working_weight"] == 170  # progressed +5
        assert bp["progression_status"] == "progressing"
