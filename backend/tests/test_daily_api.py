"""Tests for Daily API — todos, habits, summary."""

from fastapi.testclient import TestClient
from app.main import app

client = TestClient(app)


def test_create_todo(db_session):
    resp = client.post("/api/v1/daily/todos", json={
        "text": "Read chapter 3 of Hull's Options book",
        "estimated_minutes": 45,
    })
    assert resp.status_code == 200
    data = resp.json()
    assert data["text"] == "Read chapter 3 of Hull's Options book"
    assert data["completed"] is False
    assert "todo_date" in data


def test_list_todos(db_session):
    client.post("/api/v1/daily/todos", json={"text": "Task A"})
    client.post("/api/v1/daily/todos", json={"text": "Task B"})
    resp = client.get("/api/v1/daily/todos")
    assert resp.status_code == 200
    assert len(resp.json()) >= 2


def test_complete_todo(db_session):
    create = client.post("/api/v1/daily/todos", json={"text": "Study derivatives"})
    todo_id = create.json()["id"]
    resp = client.post(f"/api/v1/daily/todos/{todo_id}/complete")
    assert resp.status_code == 200
    assert resp.json()["completed"] is True


def test_toggle_todo_uncomplete(db_session):
    create = client.post("/api/v1/daily/todos", json={"text": "Toggle test"})
    todo_id = create.json()["id"]
    client.post(f"/api/v1/daily/todos/{todo_id}/complete")
    resp = client.post(f"/api/v1/daily/todos/{todo_id}/complete")
    assert resp.json()["completed"] is False


def test_delete_todo(db_session):
    create = client.post("/api/v1/daily/todos", json={"text": "Delete me"})
    todo_id = create.json()["id"]
    resp = client.delete(f"/api/v1/daily/todos/{todo_id}")
    assert resp.status_code == 200


def test_create_habit(db_session):
    resp = client.post("/api/v1/daily/habits", json={
        "name": "Meditate",
        "icon": "flower-outline",
        "color": "#8B5CF6",
    })
    assert resp.status_code == 200
    data = resp.json()
    assert data["name"] == "Meditate"
    assert data["current_streak"] == 0


def test_toggle_habit(db_session):
    create = client.post("/api/v1/daily/habits", json={"name": "Cold Shower"})
    habit_id = create.json()["id"]
    resp = client.post(f"/api/v1/daily/habits/{habit_id}/toggle")
    assert resp.status_code == 200
    data = resp.json()
    assert data["completed_today"] is True
    assert data["current_streak"] >= 1


def test_toggle_habit_off(db_session):
    create = client.post("/api/v1/daily/habits", json={"name": "Stretch"})
    habit_id = create.json()["id"]
    client.post(f"/api/v1/daily/habits/{habit_id}/toggle")  # on
    resp = client.post(f"/api/v1/daily/habits/{habit_id}/toggle")  # off
    assert resp.json()["completed_today"] is False


def test_list_habits(db_session):
    client.post("/api/v1/daily/habits", json={"name": "Read 30min"})
    client.post("/api/v1/daily/habits", json={"name": "Journal"})
    resp = client.get("/api/v1/daily/habits")
    assert resp.status_code == 200
    assert len(resp.json()) >= 2


def test_daily_summary(db_session):
    resp = client.get("/api/v1/daily/summary")
    assert resp.status_code == 200
    data = resp.json()
    assert "quote" in data
    assert "quote_author" in data
    assert isinstance(data["todos"], list)
    assert isinstance(data["habits"], list)
