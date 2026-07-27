"""Whoop API integration — pulls recovery, sleep, strain, workout, HR zones.

Full data from all endpoints, auto-refreshes tokens.
"""

import json
import logging
from datetime import date, timedelta
from typing import Any, Optional

import httpx
from sqlalchemy.orm import Session

from app.models.workout import WhoopSnapshot
from app.services import oauth

logger = logging.getLogger(__name__)

WHOOP_API_BASE = "https://api.prod.whoop.com/developer/v2"
PROVIDER = "whoop"


class WhoopUnavailableError(Exception):
    pass


async def _api_get(path: str, user_id: int, db: Session, access_token: str) -> tuple[dict[str, Any], str]:
    """GET a Whoop endpoint; on 401 refresh the user's token once and retry.

    Returns (json, access_token) so the (possibly refreshed) token is reused.
    """
    async with httpx.AsyncClient(timeout=15.0) as client:
        headers = {"Authorization": f"Bearer {access_token}"}
        resp = await client.get(f"{WHOOP_API_BASE}{path}", headers=headers)
        if resp.status_code == 401:
            refreshed = await oauth.refresh_and_store(db, user_id, PROVIDER)
            if not refreshed:
                raise WhoopUnavailableError("Whoop token refresh failed")
            access_token = refreshed
            resp = await client.get(f"{WHOOP_API_BASE}{path}", headers={"Authorization": f"Bearer {access_token}"})
        if resp.status_code != 200:
            raise WhoopUnavailableError(f"Whoop API {resp.status_code}: {resp.text}")
        return resp.json(), access_token


async def fetch_whoop_data(user_id: int, db: Session) -> dict[str, Any]:
    """Fetch comprehensive Whoop data for a connected user.

    Raises WhoopUnavailableError if the user hasn't connected Whoop.
    Returns a rich dict with all available metrics.
    """
    access_token = await oauth.valid_access_token(db, user_id, PROVIDER)
    if not access_token:
        raise WhoopUnavailableError("Whoop not connected")

    recovery_data, access_token = await _api_get("/recovery?limit=1", user_id, db, access_token)
    sleep_data, access_token = await _api_get("/activity/sleep?limit=1", user_id, db, access_token)
    cycle_data, access_token = await _api_get("/cycle?limit=1", user_id, db, access_token)
    workout_data, access_token = await _api_get("/activity/workout?limit=3", user_id, db, access_token)

    result: dict[str, Any] = {
        # Recovery
        "recovery_score": None,
        "hrv": None,
        "resting_hr": None,
        "spo2": None,
        "skin_temp_celsius": None,

        # Sleep
        "sleep_score": None,
        "sleep_consistency": None,
        "sleep_efficiency": None,
        "respiratory_rate": None,
        "total_sleep_minutes": None,
        "rem_minutes": None,
        "deep_sleep_minutes": None,
        "light_sleep_minutes": None,
        "awake_minutes": None,
        "sleep_cycles": None,
        "disturbances": None,
        "sleep_needed_minutes": None,
        "sleep_debt_minutes": None,

        # Strain / Cycle
        "strain_score": None,
        "calories": None,
        "avg_hr": None,
        "max_hr": None,

        # Latest workout
        "workout_strain": None,
        "workout_sport": None,
        "workout_duration_minutes": None,
        "workout_avg_hr": None,
        "workout_max_hr": None,
        "workout_calories": None,
        "workout_hr_zones": None,  # dict of zone durations

        # Recent workouts list
        "recent_workouts": [],
    }

    # --- Recovery ---
    if recovery_data.get("records"):
        rec = recovery_data["records"][0].get("score", {})
        result["recovery_score"] = rec.get("recovery_score")
        result["hrv"] = rec.get("hrv_rmssd_milli")
        result["resting_hr"] = rec.get("resting_heart_rate")
        result["spo2"] = rec.get("spo2_percentage")
        result["skin_temp_celsius"] = rec.get("skin_temp_celsius")

    # --- Sleep ---
    if sleep_data.get("records"):
        sleep_rec = sleep_data["records"][0]
        sleep = sleep_rec.get("score", {})
        stages = sleep.get("stage_summary", {})

        result["sleep_score"] = sleep.get("sleep_performance_percentage")
        result["sleep_consistency"] = sleep.get("sleep_consistency_percentage")
        result["sleep_efficiency"] = sleep.get("sleep_efficiency_percentage")
        result["respiratory_rate"] = sleep.get("respiratory_rate")

        # Convert millis to minutes
        total_sleep = (
            stages.get("total_light_sleep_time_milli", 0)
            + stages.get("total_slow_wave_sleep_time_milli", 0)
            + stages.get("total_rem_sleep_time_milli", 0)
        )
        result["total_sleep_minutes"] = round(total_sleep / 60000)
        result["rem_minutes"] = round(stages.get("total_rem_sleep_time_milli", 0) / 60000)
        result["deep_sleep_minutes"] = round(stages.get("total_slow_wave_sleep_time_milli", 0) / 60000)
        result["light_sleep_minutes"] = round(stages.get("total_light_sleep_time_milli", 0) / 60000)
        result["awake_minutes"] = round(stages.get("total_awake_time_milli", 0) / 60000)
        result["sleep_cycles"] = stages.get("sleep_cycle_count")
        result["disturbances"] = stages.get("disturbance_count")

        # Sleep need
        need = sleep.get("sleep_needed", {})
        baseline = need.get("baseline_milli", 0)
        debt = need.get("need_from_sleep_debt_milli", 0)
        result["sleep_needed_minutes"] = round(baseline / 60000)
        result["sleep_debt_minutes"] = round(debt / 60000)

    # --- Cycle (daily strain) ---
    if cycle_data.get("records"):
        cycle = cycle_data["records"][0].get("score", {})
        result["strain_score"] = cycle.get("strain")
        result["calories"] = round(cycle.get("kilojoule", 0) / 4.184)  # kJ to kcal
        result["avg_hr"] = cycle.get("average_heart_rate")
        result["max_hr"] = cycle.get("max_heart_rate")

    # --- Workouts ---
    if workout_data.get("records"):
        workouts = workout_data["records"]

        # Most recent workout
        latest = workouts[0]
        score = latest.get("score", {})
        zones = score.get("zone_durations", {})

        start_ts = latest.get("start", "")
        end_ts = latest.get("end", "")
        duration_min = None
        if start_ts and end_ts:
            from datetime import datetime
            try:
                s = datetime.fromisoformat(start_ts.replace("Z", "+00:00"))
                e = datetime.fromisoformat(end_ts.replace("Z", "+00:00"))
                duration_min = round((e - s).total_seconds() / 60)
            except Exception:
                pass

        result["workout_strain"] = score.get("strain")
        result["workout_sport"] = latest.get("sport_name")
        result["workout_duration_minutes"] = duration_min
        result["workout_avg_hr"] = score.get("average_heart_rate")
        result["workout_max_hr"] = score.get("max_heart_rate")
        result["workout_calories"] = round(score.get("kilojoule", 0) / 4.184)

        # HR zone durations in minutes
        result["workout_hr_zones"] = {
            "zone_0_min": round(zones.get("zone_zero_milli", 0) / 60000, 1),
            "zone_1_min": round(zones.get("zone_one_milli", 0) / 60000, 1),
            "zone_2_min": round(zones.get("zone_two_milli", 0) / 60000, 1),
            "zone_3_min": round(zones.get("zone_three_milli", 0) / 60000, 1),
            "zone_4_min": round(zones.get("zone_four_milli", 0) / 60000, 1),
            "zone_5_min": round(zones.get("zone_five_milli", 0) / 60000, 1),
        }

        # All recent workouts
        result["recent_workouts"] = [
            {
                "sport": w.get("sport_name"),
                "strain": w.get("score", {}).get("strain"),
                "avg_hr": w.get("score", {}).get("average_heart_rate"),
                "max_hr": w.get("score", {}).get("max_heart_rate"),
                "calories": round(w.get("score", {}).get("kilojoule", 0) / 4.184),
                "start": w.get("start"),
                "end": w.get("end"),
            }
            for w in workouts
        ]

    return result


def cache_whoop_snapshot(
    user_id: int, data: dict[str, Any], db: Session, snapshot_date: Optional[date] = None
) -> WhoopSnapshot:
    """Cache Whoop data as a snapshot for trend analysis."""
    d = snapshot_date or date.today()
    full_json = json.dumps(data)

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
        existing.full_data = full_json
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
        full_data=full_json,
    )
    db.add(snapshot)
    db.commit()
    db.refresh(snapshot)
    return snapshot


def get_whoop_snapshot_by_date(
    user_id: int, snapshot_date: date, db: Session
) -> Optional[dict[str, Any]]:
    """Get cached Whoop data for a specific date."""
    snapshot = (
        db.query(WhoopSnapshot)
        .filter(WhoopSnapshot.user_id == user_id, WhoopSnapshot.snapshot_date == snapshot_date)
        .first()
    )
    if not snapshot:
        return None
    if snapshot.full_data:
        return json.loads(snapshot.full_data)
    # Fallback to basic fields if full_data not available
    return {
        "recovery_score": snapshot.recovery_score,
        "hrv": snapshot.hrv,
        "resting_hr": snapshot.resting_hr,
        "sleep_score": snapshot.sleep_score,
        "strain_score": snapshot.strain_score,
    }


def detect_declining_recovery(user_id: int, db: Session, weeks: int = 2) -> bool:
    since = date.today() - timedelta(days=weeks * 7)
    snapshots = (
        db.query(WhoopSnapshot)
        .filter(WhoopSnapshot.user_id == user_id, WhoopSnapshot.snapshot_date >= since)
        .order_by(WhoopSnapshot.snapshot_date)
        .all()
    )
    if len(snapshots) < 7:
        return False
    scores = [s.recovery_score for s in snapshots if s.recovery_score is not None]
    if len(scores) < 7:
        return False
    mid = len(scores) // 2
    first_avg = sum(scores[:mid]) / mid
    second_avg = sum(scores[mid:]) / (len(scores) - mid)
    return second_avg < first_avg - 10


def get_recovery_adjustment(recovery_score: Optional[float]) -> dict[str, Any]:
    if recovery_score is None:
        return {"level": "standard", "note": "No Whoop data — standard intensity.", "volume_modifier": 1.0, "weight_modifier": 1.0}
    if recovery_score >= 85:
        return {"level": "green", "note": "Recovery excellent. Full send.", "volume_modifier": 1.1, "weight_modifier": 1.0}
    elif recovery_score >= 67:
        return {"level": "yellow", "note": "Standard recovery. Hit the plan.", "volume_modifier": 1.0, "weight_modifier": 1.0}
    elif recovery_score >= 34:
        return {"level": "yellow_low", "note": "Below average recovery. Reducing volume.", "volume_modifier": 0.75, "weight_modifier": 0.92}
    else:
        return {"level": "red", "note": "Recovery critically low. Active recovery only.", "volume_modifier": 0, "weight_modifier": 0}
