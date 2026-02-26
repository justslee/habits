"""Tests for daily entry API endpoints (TASK-003)."""

import pytest
from datetime import date
from httpx import ASGITransport, AsyncClient

from app.main import app


@pytest.fixture
def base_payload():
    """Valid entry payload."""
    return {
        "description": "Studied stochastic calculus for 2 hours",
        "time_invested_minutes": 120,
        "pillar_tags": [1, 3],
        "difficulty_rating": 8,
        "energy_level": 7,
        "key_takeaway": "Finally understood Ito's lemma",
        "entry_date": "2026-02-25",
    }


class TestCreateEntry:
    """POST /api/v1/entries"""

    @pytest.mark.asyncio
    async def test_create_entry_success(self, db_session, base_payload):
        async with AsyncClient(
            transport=ASGITransport(app=app), base_url="http://test"
        ) as client:
            resp = await client.post("/api/v1/entries", json=base_payload)

        assert resp.status_code == 201
        data = resp.json()
        assert data["description"] == base_payload["description"]
        assert data["time_invested_minutes"] == 120
        assert data["pillar_tags"] == [1, 3]
        assert data["difficulty_rating"] == 8
        assert data["energy_level"] == 7
        assert data["key_takeaway"] == "Finally understood Ito's lemma"
        assert data["entry_date"] == "2026-02-25"
        assert data["id"] is not None
        assert data["created_at"] is not None
        assert data["evaluation"] is None

    @pytest.mark.asyncio
    async def test_create_entry_defaults_to_today(self, db_session):
        payload = {
            "description": "Quick review",
            "time_invested_minutes": 30,
            "difficulty_rating": 3,
            "energy_level": 5,
            "key_takeaway": "Refreshed basics",
        }
        async with AsyncClient(
            transport=ASGITransport(app=app), base_url="http://test"
        ) as client:
            resp = await client.post("/api/v1/entries", json=payload)

        assert resp.status_code == 201
        assert resp.json()["entry_date"] == str(date.today())

    @pytest.mark.asyncio
    async def test_create_entry_missing_description(self, db_session, base_payload):
        del base_payload["description"]
        async with AsyncClient(
            transport=ASGITransport(app=app), base_url="http://test"
        ) as client:
            resp = await client.post("/api/v1/entries", json=base_payload)
        assert resp.status_code == 422

    @pytest.mark.asyncio
    async def test_create_entry_missing_time(self, db_session, base_payload):
        del base_payload["time_invested_minutes"]
        async with AsyncClient(
            transport=ASGITransport(app=app), base_url="http://test"
        ) as client:
            resp = await client.post("/api/v1/entries", json=base_payload)
        assert resp.status_code == 422

    @pytest.mark.asyncio
    async def test_create_entry_missing_difficulty(self, db_session, base_payload):
        del base_payload["difficulty_rating"]
        async with AsyncClient(
            transport=ASGITransport(app=app), base_url="http://test"
        ) as client:
            resp = await client.post("/api/v1/entries", json=base_payload)
        assert resp.status_code == 422

    @pytest.mark.asyncio
    async def test_create_entry_missing_energy(self, db_session, base_payload):
        del base_payload["energy_level"]
        async with AsyncClient(
            transport=ASGITransport(app=app), base_url="http://test"
        ) as client:
            resp = await client.post("/api/v1/entries", json=base_payload)
        assert resp.status_code == 422

    @pytest.mark.asyncio
    async def test_create_entry_missing_takeaway(self, db_session, base_payload):
        del base_payload["key_takeaway"]
        async with AsyncClient(
            transport=ASGITransport(app=app), base_url="http://test"
        ) as client:
            resp = await client.post("/api/v1/entries", json=base_payload)
        assert resp.status_code == 422

    @pytest.mark.asyncio
    async def test_create_entry_invalid_difficulty_range(self, db_session, base_payload):
        base_payload["difficulty_rating"] = 11
        async with AsyncClient(
            transport=ASGITransport(app=app), base_url="http://test"
        ) as client:
            resp = await client.post("/api/v1/entries", json=base_payload)
        assert resp.status_code == 422

    @pytest.mark.asyncio
    async def test_create_entry_invalid_energy_range(self, db_session, base_payload):
        base_payload["energy_level"] = 0
        async with AsyncClient(
            transport=ASGITransport(app=app), base_url="http://test"
        ) as client:
            resp = await client.post("/api/v1/entries", json=base_payload)
        assert resp.status_code == 422

    @pytest.mark.asyncio
    async def test_create_entry_zero_time(self, db_session, base_payload):
        base_payload["time_invested_minutes"] = 0
        async with AsyncClient(
            transport=ASGITransport(app=app), base_url="http://test"
        ) as client:
            resp = await client.post("/api/v1/entries", json=base_payload)
        assert resp.status_code == 422

    @pytest.mark.asyncio
    async def test_create_entry_empty_description(self, db_session, base_payload):
        base_payload["description"] = ""
        async with AsyncClient(
            transport=ASGITransport(app=app), base_url="http://test"
        ) as client:
            resp = await client.post("/api/v1/entries", json=base_payload)
        assert resp.status_code == 422


class TestListEntries:
    """GET /api/v1/entries"""

    @pytest.mark.asyncio
    async def test_list_entries_empty(self, db_session):
        async with AsyncClient(
            transport=ASGITransport(app=app), base_url="http://test"
        ) as client:
            resp = await client.get("/api/v1/entries")
        assert resp.status_code == 200
        assert resp.json() == []

    @pytest.mark.asyncio
    async def test_list_entries_returns_created(self, db_session, base_payload):
        async with AsyncClient(
            transport=ASGITransport(app=app), base_url="http://test"
        ) as client:
            await client.post("/api/v1/entries", json=base_payload)
            resp = await client.get("/api/v1/entries")

        assert resp.status_code == 200
        data = resp.json()
        assert len(data) == 1
        assert data[0]["description"] == base_payload["description"]

    @pytest.mark.asyncio
    async def test_list_entries_date_filter(self, db_session, base_payload):
        async with AsyncClient(
            transport=ASGITransport(app=app), base_url="http://test"
        ) as client:
            # Create entries on different dates
            base_payload["entry_date"] = "2026-02-20"
            await client.post("/api/v1/entries", json=base_payload)
            base_payload["entry_date"] = "2026-02-25"
            await client.post("/api/v1/entries", json=base_payload)
            base_payload["entry_date"] = "2026-03-01"
            await client.post("/api/v1/entries", json=base_payload)

            # Filter by range
            resp = await client.get(
                "/api/v1/entries",
                params={"start_date": "2026-02-24", "end_date": "2026-02-26"},
            )

        assert resp.status_code == 200
        data = resp.json()
        assert len(data) == 1
        assert data[0]["entry_date"] == "2026-02-25"

    @pytest.mark.asyncio
    async def test_list_entries_start_date_only(self, db_session, base_payload):
        async with AsyncClient(
            transport=ASGITransport(app=app), base_url="http://test"
        ) as client:
            base_payload["entry_date"] = "2026-01-01"
            await client.post("/api/v1/entries", json=base_payload)
            base_payload["entry_date"] = "2026-06-01"
            await client.post("/api/v1/entries", json=base_payload)

            resp = await client.get(
                "/api/v1/entries", params={"start_date": "2026-03-01"}
            )

        assert resp.status_code == 200
        assert len(resp.json()) == 1

    @pytest.mark.asyncio
    async def test_list_entries_ordered_desc(self, db_session, base_payload):
        async with AsyncClient(
            transport=ASGITransport(app=app), base_url="http://test"
        ) as client:
            for d in ["2026-02-20", "2026-02-25", "2026-02-22"]:
                base_payload["entry_date"] = d
                await client.post("/api/v1/entries", json=base_payload)

            resp = await client.get("/api/v1/entries")

        dates = [e["entry_date"] for e in resp.json()]
        assert dates == ["2026-02-25", "2026-02-22", "2026-02-20"]


class TestGetEntry:
    """GET /api/v1/entries/{id}"""

    @pytest.mark.asyncio
    async def test_get_entry_success(self, db_session, base_payload):
        async with AsyncClient(
            transport=ASGITransport(app=app), base_url="http://test"
        ) as client:
            create_resp = await client.post("/api/v1/entries", json=base_payload)
            entry_id = create_resp.json()["id"]

            resp = await client.get(f"/api/v1/entries/{entry_id}")

        assert resp.status_code == 200
        assert resp.json()["id"] == entry_id
        assert resp.json()["description"] == base_payload["description"]

    @pytest.mark.asyncio
    async def test_get_entry_not_found(self, db_session):
        async with AsyncClient(
            transport=ASGITransport(app=app), base_url="http://test"
        ) as client:
            resp = await client.get("/api/v1/entries/9999")
        assert resp.status_code == 404

    @pytest.mark.asyncio
    async def test_get_entry_includes_evaluation_field(self, db_session, base_payload):
        """Evaluation field present (None when no evaluation exists)."""
        async with AsyncClient(
            transport=ASGITransport(app=app), base_url="http://test"
        ) as client:
            create_resp = await client.post("/api/v1/entries", json=base_payload)
            entry_id = create_resp.json()["id"]
            resp = await client.get(f"/api/v1/entries/{entry_id}")

        assert resp.status_code == 200
        assert "evaluation" in resp.json()
        assert resp.json()["evaluation"] is None


class TestUpdateEntryTags:
    """PATCH /api/v1/entries/{id}"""

    @pytest.mark.asyncio
    async def test_update_tags_success(self, db_session, base_payload):
        async with AsyncClient(
            transport=ASGITransport(app=app), base_url="http://test"
        ) as client:
            create_resp = await client.post("/api/v1/entries", json=base_payload)
            entry_id = create_resp.json()["id"]

            resp = await client.patch(
                f"/api/v1/entries/{entry_id}",
                json={"pillar_tags": [2, 4, 5]},
            )

        assert resp.status_code == 200
        assert resp.json()["pillar_tags"] == [2, 4, 5]

    @pytest.mark.asyncio
    async def test_update_tags_not_found(self, db_session):
        async with AsyncClient(
            transport=ASGITransport(app=app), base_url="http://test"
        ) as client:
            resp = await client.patch(
                "/api/v1/entries/9999", json={"pillar_tags": [1]}
            )
        assert resp.status_code == 404

    @pytest.mark.asyncio
    async def test_update_tags_clears_tags(self, db_session, base_payload):
        async with AsyncClient(
            transport=ASGITransport(app=app), base_url="http://test"
        ) as client:
            create_resp = await client.post("/api/v1/entries", json=base_payload)
            entry_id = create_resp.json()["id"]

            resp = await client.patch(
                f"/api/v1/entries/{entry_id}", json={"pillar_tags": []}
            )

        assert resp.status_code == 200
        assert resp.json()["pillar_tags"] == []

    @pytest.mark.asyncio
    async def test_update_does_not_modify_other_fields(self, db_session, base_payload):
        async with AsyncClient(
            transport=ASGITransport(app=app), base_url="http://test"
        ) as client:
            create_resp = await client.post("/api/v1/entries", json=base_payload)
            entry_id = create_resp.json()["id"]
            original = create_resp.json()

            resp = await client.patch(
                f"/api/v1/entries/{entry_id}", json={"pillar_tags": [5]}
            )

        data = resp.json()
        assert data["description"] == original["description"]
        assert data["time_invested_minutes"] == original["time_invested_minutes"]
        assert data["difficulty_rating"] == original["difficulty_rating"]
        assert data["energy_level"] == original["energy_level"]
        assert data["key_takeaway"] == original["key_takeaway"]
