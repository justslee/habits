"""Regression tests for todo/habit reordering.

The reorder endpoints were shadowed: `PUT /todos/reorder` was declared *after*
`PUT /todos/{todo_id}`, so "reorder" was parsed as todo_id and 422'd — drag-to-
reorder silently reverted in the app. These tests assert the literal route wins.
"""

import datetime

import pytest

from app.models.daily_todo import DailyHabit, DailyTodo
from app.models.user import User


def _uid(db_session):
    return db_session.query(User).first().id


def test_reorder_todos_is_not_shadowed_by_todo_id(client, db_session):
    uid = _uid(db_session)
    today = datetime.date.today()
    ids = []
    for i, txt in enumerate(["A", "B", "C"]):
        t = DailyTodo(user_id=uid, todo_date=today, text=txt, sort_order=i)
        db_session.add(t)
        db_session.flush()
        ids.append(t.id)
    db_session.commit()

    resp = client.put("/api/v1/daily/todos/reorder", json={"ids": list(reversed(ids))})
    assert resp.status_code == 200, "reorder route shadowed by /todos/{todo_id} (422)"

    db_session.expire_all()
    order = [t.id for t in db_session.query(DailyTodo).order_by(DailyTodo.sort_order).all()]
    assert order == list(reversed(ids))


def test_reorder_habits_is_not_shadowed_by_habit_id(client, db_session):
    uid = _uid(db_session)
    ids = []
    for i, name in enumerate(["Read", "Meditate", "Lift"]):
        h = DailyHabit(user_id=uid, name=name, sort_order=i, is_active=True)
        db_session.add(h)
        db_session.flush()
        ids.append(h.id)
    db_session.commit()

    resp = client.put("/api/v1/daily/habits/reorder", json={"ids": list(reversed(ids))})
    assert resp.status_code == 200, "reorder route shadowed by /habits/{habit_id} (422)"

    db_session.expire_all()
    order = [h.id for h in db_session.query(DailyHabit).order_by(DailyHabit.sort_order).all()]
    assert order == list(reversed(ids))


@pytest.fixture
def client(db_session):
    from fastapi.testclient import TestClient
    from app.main import app
    return TestClient(app)
