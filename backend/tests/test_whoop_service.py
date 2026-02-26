"""Tests for Whoop integration service."""

from datetime import date, timedelta

from app.models.user import User
from app.models.workout import WhoopSnapshot
from app.services.whoop import (
    cache_whoop_snapshot,
    detect_declining_recovery,
    get_recovery_adjustment,
)


class TestRecoveryAdjustment:
    def test_green_recovery(self):
        adj = get_recovery_adjustment(90)
        assert adj["level"] == "green"
        assert adj["volume_modifier"] > 1.0

    def test_yellow_recovery(self):
        adj = get_recovery_adjustment(75)
        assert adj["level"] == "yellow"
        assert adj["volume_modifier"] == 1.0

    def test_yellow_low_recovery(self):
        adj = get_recovery_adjustment(50)
        assert adj["level"] == "yellow_low"
        assert adj["volume_modifier"] < 1.0

    def test_red_recovery(self):
        adj = get_recovery_adjustment(20)
        assert adj["level"] == "red"
        assert adj["volume_modifier"] == 0

    def test_no_data(self):
        adj = get_recovery_adjustment(None)
        assert adj["level"] == "standard"
        assert adj["volume_modifier"] == 1.0


class TestCacheSnapshot:
    def test_cache_new(self, db_session):
        user = db_session.query(User).first()
        data = {"recovery_score": 74, "hrv": 68, "resting_hr": 52, "sleep_score": 85}
        snap = cache_whoop_snapshot(user.id, data, db_session)
        assert snap.recovery_score == 74
        assert snap.snapshot_date == date.today()

    def test_upsert_existing(self, db_session):
        user = db_session.query(User).first()
        data1 = {"recovery_score": 74, "hrv": 68}
        cache_whoop_snapshot(user.id, data1, db_session)

        data2 = {"recovery_score": 80, "hrv": 72}
        snap = cache_whoop_snapshot(user.id, data2, db_session)
        assert snap.recovery_score == 80

        # Should still be just one snapshot
        count = db_session.query(WhoopSnapshot).filter(
            WhoopSnapshot.snapshot_date == date.today()
        ).count()
        assert count == 1


class TestDecliningRecovery:
    def test_no_data(self, db_session):
        user = db_session.query(User).first()
        assert detect_declining_recovery(user.id, db_session) is False

    def test_stable_recovery(self, db_session):
        user = db_session.query(User).first()
        for i in range(14):
            db_session.add(WhoopSnapshot(
                user_id=user.id,
                snapshot_date=date.today() - timedelta(days=14 - i),
                recovery_score=75,
            ))
        db_session.commit()
        assert detect_declining_recovery(user.id, db_session) is False

    def test_declining_recovery(self, db_session):
        user = db_session.query(User).first()
        # First week: high recovery
        for i in range(7):
            db_session.add(WhoopSnapshot(
                user_id=user.id,
                snapshot_date=date.today() - timedelta(days=14 - i),
                recovery_score=85,
            ))
        # Second week: low recovery
        for i in range(7):
            db_session.add(WhoopSnapshot(
                user_id=user.id,
                snapshot_date=date.today() - timedelta(days=7 - i),
                recovery_score=55,
            ))
        db_session.commit()
        assert detect_declining_recovery(user.id, db_session) is True
