"""Regression tests for the end-of-day 'Honest Mirror' response shape.

The client renders `results` as a list (`evalResponse.results.map(...)`), so the
endpoint MUST return a `results` array — never a singular `result` object. A
mismatch there crashed the app on Save Reflection. This locks the contract on the
"already evaluated today" branch (no LLM needed, fully deterministic).
"""

import datetime

import pytest

from app.models.daily_todo import DailyTodo
from app.models.daily_entry import DailyEntry
from app.models.evaluation import Evaluation
from app.models.pillar import Pillar
from app.models.user import User


@pytest.fixture
def client(db_session):
    from fastapi.testclient import TestClient
    from app.main import app
    return TestClient(app)


def test_end_of_day_returns_results_array(client, db_session):
    uid = db_session.query(User).first().id
    pid = db_session.query(Pillar).first().id
    today = datetime.date.today()

    # A completed pillar-linked todo backed by an already-evaluated entry
    entry = DailyEntry(
        user_id=uid, entry_date=today, description="ledger work",
        time_invested_minutes=60, difficulty_rating=5, energy_level=5,
        key_takeaway="progress", pillar_tags=str(pid),
    )
    db_session.add(entry); db_session.flush()
    db_session.add(Evaluation(
        entry_id=entry.id, depth_score=62, relevance_score=70,
        one_percent_better=True, verdict_explanation="Solid.", commentary="Good depth.",
    ))
    db_session.add(DailyTodo(
        user_id=uid, todo_date=today, text="Ledger modeling",
        pillar_id=pid, completed=True, entry_id=entry.id, sort_order=0,
    ))
    db_session.commit()

    resp = client.post("/api/v1/daily/end-of-day")
    assert resp.status_code == 200
    body = resp.json()

    # The exact contract that broke the app:
    assert isinstance(body.get("results"), list), "results must be a list (client does results.map)"
    assert "result" not in body, "must not use the singular 'result' shape"
    assert len(body["results"]) >= 1
    first = body["results"][0]
    # pillar_name must be a clean string, not a stringified dict
    assert isinstance(first["pillar_name"], str) and "{" not in first["pillar_name"]
    for key in ("depth_score", "one_percent_better", "verdict_explanation", "commentary", "time_invested_minutes"):
        assert key in first, f"EvalResult missing {key}"
