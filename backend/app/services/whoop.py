"""Whoop API integration service — read-only (D-014).

Pulls recovery, sleep, strain data and caches locally.
Handles token refresh and graceful fallback.
"""

import json
import logging
import os
from datetime import date, timedelta
from pathlib import Path
from typing import Any, Optional

import httpx
from sqlalchemy.orm import Session

from app.models.workout import WhoopSnapshot

logger = logging.getLogger(__name__)

WHOOP_API_BASE = "https://api.prod.whoop.com/developer/v2"
TOKEN_PATH = Path.home() / ".config" / "whoop" / "tokens.json"


class WhoopUnavailableError(Exception):
    """Raised when Whoop API is unreachable or auth fails."""
    pass


def _load_tokens() -> dict[str, Any]:
    """Load tokens from disk."""
    if not TOKEN_PATH.exists():
        raise WhoopUnavailableError("No Whoop token file found")
    return json.loads(TOKEN_PATH.read_text())


def _save_tokens(tokens: dict[str, Any]) -> None:
    """Save tokens to disk."""
    TOKEN_PATH.parent.mkdir(parents=True, exist_ok=True)
    TOKEN_PATH.write_text(json.dumps(tokens, indent=2))


WHOOP_CLIENT_ID = os.getenv("WHOOP_CLIENT_ID", "")
WHOOP_CLIENT_SECRET = os.getenv("WHOOP_CLIENT_SECRET", "")


async def _refresh_token(tokens: dict[str, Any]) -> dict[str, Any]:
    """Attempt to refresh the access token."""
    client_id = tokens.get("client_id", WHOOP_CLIENT_ID)
    client_secret = tokens.get("client_secret", WHOOP_CLIENT_SECRET)

    async with httpx.AsyncClient(timeout=15.0) as client:
        resp = await client.post(
            "https://api.prod.whoop.com/oauth/oauth2/token",
            data={
                "grant_type": "refresh_token",
                "refresh_token": tokens["refresh_token"],
                "client_id": client_id,
                "client_secret": client_secret,
            },
        )
        if resp.status_code != 200:
            raise WhoopUnavailableError(f"Token refresh failed: {resp.text}")

        new_data = resp.json()
        tokens["access_token"] = new_data["access_token"]
        if "refresh_token" in new_data:
            tokens["refresh_token"] = new_data["refresh_token"]
        _save_tokens(tokens)
        return tokens


async def _api_get(path: str, tokens: dict[str, Any]) -> dict[str, Any]:
    """Make authenticated GET request to Whoop API."""
    headers = {"Authorization": f"Bearer {tokens['access_token']}"}
    async with httpx.AsyncClient(timeout=15.0) as client:
        resp = await client.get(f"{WHOOP_API_BASE}{path}", headers=headers)
        if resp.status_code == 401:
            # Try refresh
            tokens = await _refresh_token(tokens)
            headers = {"Authorization": f"Bearer {tokens['access_token']}"}
            resp = await client.get(f"{WHOOP_API_BASE}{path}", headers=headers)
        if resp.status_code != 200:
            raise WhoopUnavailableError(f"Whoop API error {resp.status_code}: {resp.text}")
        return resp.json()


async def fetch_whoop_data() -> dict[str, Any]:
    """Fetch latest Whoop recovery, sleep, and strain data.

    Returns dict with: recovery_score, hrv, resting_hr, sleep_score, strain_score
    Raises WhoopUnavailableError if API unreachable.
    """
    tokens = _load_tokens()

    recovery_data = await _api_get("/recovery?limit=1", tokens)
    sleep_data = await _api_get("/activity/sleep?limit=1", tokens)

    result: dict[str, Any] = {
        "recovery_score": None,
        "hrv": None,
        "resting_hr": None,
        "sleep_score": None,
        "strain_score": None,
    }

    if recovery_data.get("records"):
        rec = recovery_data["records"][0].get("score", {})
        result["recovery_score"] = rec.get("recovery_score")
        result["hrv"] = rec.get("hrv_rmssd_milli")
        result["resting_hr"] = rec.get("resting_heart_rate")

    if sleep_data.get("records"):
        sleep = sleep_data["records"][0].get("score", {})
        result["sleep_score"] = sleep.get("sleep_performance_percentage")

    return result


def cache_whoop_snapshot(
    user_id: int, data: dict[str, Any], db: Session, snapshot_date: Optional[date] = None
) -> WhoopSnapshot:
    """Cache Whoop data as a snapshot for trend analysis."""
    d = snapshot_date or date.today()

    # Upsert: check if today's snapshot exists
    existing = (
        db.query(WhoopSnapshot)
        .filter(WhoopSnapshot.user_id == user_id, WhoopSnapshot.snapshot_date == d)
        .first()
    )
    if existing:
        existing.recovery_score = data.get("recovery_score")
        existing.hrv = data.get("hrv")
        existing.resting_hr = data.get("resting_hr")
        existing.sleep_score = data.get("sleep_score")
        existing.strain_score = data.get("strain_score")
        db.commit()
        return existing

    snapshot = WhoopSnapshot(
        user_id=user_id,
        snapshot_date=d,
        recovery_score=data.get("recovery_score"),
        hrv=data.get("hrv"),
        resting_hr=data.get("resting_hr"),
        sleep_score=data.get("sleep_score"),
        strain_score=data.get("strain_score"),
    )
    db.add(snapshot)
    db.commit()
    db.refresh(snapshot)
    return snapshot


def detect_declining_recovery(user_id: int, db: Session, weeks: int = 2) -> bool:
    """Detect if recovery has been declining for `weeks` consecutive weeks (AC-P2-5.6)."""
    since = date.today() - timedelta(days=weeks * 7)
    snapshots = (
        db.query(WhoopSnapshot)
        .filter(WhoopSnapshot.user_id == user_id, WhoopSnapshot.snapshot_date >= since)
        .order_by(WhoopSnapshot.snapshot_date)
        .all()
    )

    if len(snapshots) < 7:  # Need at least a week of data
        return False

    scores = [s.recovery_score for s in snapshots if s.recovery_score is not None]
    if len(scores) < 7:
        return False

    # Compare first half avg vs second half avg
    mid = len(scores) // 2
    first_avg = sum(scores[:mid]) / mid
    second_avg = sum(scores[mid:]) / (len(scores) - mid)

    return second_avg < first_avg - 10  # Declining by 10+ points


def get_recovery_adjustment(recovery_score: Optional[float]) -> dict[str, Any]:
    """Get workout adjustment based on Whoop recovery score."""
    if recovery_score is None:
        return {
            "level": "standard",
            "note": "No Whoop data available — running standard intensity.",
            "volume_modifier": 1.0,
            "weight_modifier": 1.0,
        }

    if recovery_score >= 85:
        return {
            "level": "green",
            "note": "Recovery is excellent. Full send — progress as programmed.",
            "volume_modifier": 1.1,
            "weight_modifier": 1.0,
        }
    elif recovery_score >= 67:
        return {
            "level": "yellow",
            "note": "Standard recovery. Hit the plan, don't exceed it.",
            "volume_modifier": 1.0,
            "weight_modifier": 1.0,
        }
    elif recovery_score >= 34:
        return {
            "level": "yellow_low",
            "note": "Recovery is below average. Reducing volume 20-30%. Dropping accessories.",
            "volume_modifier": 0.75,
            "weight_modifier": 0.92,
        }
    else:
        return {
            "level": "red",
            "note": "Recovery is critically low. Active recovery only — no lifting today.",
            "volume_modifier": 0,
            "weight_modifier": 0,
        }
