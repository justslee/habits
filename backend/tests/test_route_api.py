"""Tests for route API endpoints (P4-060)."""

import json
from fastapi.testclient import TestClient
from app.main import app


client = TestClient(app)


def test_create_route(db_session):
    resp = client.post("/api/v1/routes/", json={
        "name": "Central Park Loop",
        "distance_miles": 6.1,
        "elevation_gain_ft": 200,
        "route_type": "loop",
        "tags": "flat,park",
        "polyline": json.dumps([{"lat": 40.7829, "lng": -73.9654}]),
    })
    assert resp.status_code == 200
    data = resp.json()
    assert data["name"] == "Central Park Loop"
    assert data["distance_miles"] == 6.1
    assert data["route_type"] == "loop"
    assert data["times_run"] == 0


def test_list_routes(db_session):
    client.post("/api/v1/routes/", json={"name": "Route A", "distance_miles": 3.0})
    client.post("/api/v1/routes/", json={"name": "Route B", "distance_miles": 5.0})
    resp = client.get("/api/v1/routes/")
    assert resp.status_code == 200
    assert len(resp.json()) >= 2


def test_get_route(db_session):
    create = client.post("/api/v1/routes/", json={"name": "Test", "distance_miles": 2.5})
    route_id = create.json()["id"]
    resp = client.get(f"/api/v1/routes/{route_id}")
    assert resp.status_code == 200
    assert resp.json()["name"] == "Test"


def test_delete_route(db_session):
    create = client.post("/api/v1/routes/", json={"name": "Deleteme", "distance_miles": 1.0})
    route_id = create.json()["id"]
    resp = client.delete(f"/api/v1/routes/{route_id}")
    assert resp.status_code == 200
    resp2 = client.get(f"/api/v1/routes/{route_id}")
    assert resp2.status_code == 404


def test_get_route_not_found(db_session):
    resp = client.get("/api/v1/routes/9999")
    assert resp.status_code == 404


def test_route_runs_empty(db_session):
    create = client.post("/api/v1/routes/", json={"name": "Empty", "distance_miles": 3.0})
    route_id = create.json()["id"]
    resp = client.get(f"/api/v1/routes/{route_id}/runs")
    assert resp.status_code == 200
    assert resp.json() == []
