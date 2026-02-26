"""Tests for Phase 3 run tracking models."""

from datetime import date

from app.models.run import PersonalRecord, RunSession, RunSplit, RunningProfile
from app.models.user import User


class TestRunSession:
    def test_create_run(self, db_session):
        user = db_session.query(User).first()
        run = RunSession(
            user_id=user.id,
            run_date=date.today(),
            distance_miles=3.1,
            duration_seconds=1860,  # 31 min
            avg_pace_seconds=600,
            run_type="easy",
        )
        db_session.add(run)
        db_session.commit()
        assert run.id is not None
        assert run.avg_pace_formatted == "10:00"
        assert run.duration_formatted == "31:00"

    def test_run_with_splits(self, db_session):
        user = db_session.query(User).first()
        run = RunSession(
            user_id=user.id,
            run_date=date.today(),
            distance_miles=3.0,
            duration_seconds=1800,
        )
        db_session.add(run)
        db_session.flush()

        for i in range(1, 4):
            db_session.add(RunSplit(
                run_id=run.id,
                mile_number=i,
                pace_seconds=600,
            ))
        db_session.commit()
        assert len(run.splits) == 3

    def test_duration_formatted_hours(self, db_session):
        user = db_session.query(User).first()
        run = RunSession(
            user_id=user.id,
            run_date=date.today(),
            distance_miles=13.1,
            duration_seconds=7200,  # 2 hours
        )
        assert run.duration_formatted == "2:00:00"


class TestRunSplit:
    def test_pace_formatted(self, db_session):
        user = db_session.query(User).first()
        run = RunSession(
            user_id=user.id,
            run_date=date.today(),
            distance_miles=1.0,
            duration_seconds=510,
        )
        db_session.add(run)
        db_session.flush()

        split = RunSplit(run_id=run.id, mile_number=1, pace_seconds=510)
        assert split.pace_formatted == "8:30"


class TestRunningProfile:
    def test_create_profile(self, db_session):
        user = db_session.query(User).first()
        profile = RunningProfile(
            user_id=user.id,
            goal_type="base_building",
            target_weekly_miles=15.0,
        )
        db_session.add(profile)
        db_session.commit()
        assert profile.plan_week == 1
        assert profile.is_deload_week is False


class TestPersonalRecord:
    def test_create_pr(self, db_session):
        user = db_session.query(User).first()
        pr = PersonalRecord(
            user_id=user.id,
            distance_label="mile",
            time_seconds=420,
            record_date=date.today(),
        )
        db_session.add(pr)
        db_session.commit()
        assert pr.time_formatted == "7:00"

    def test_pr_hours(self, db_session):
        user = db_session.query(User).first()
        pr = PersonalRecord(
            user_id=user.id,
            distance_label="half_marathon",
            time_seconds=6600,  # 1:50:00
            record_date=date.today(),
        )
        assert pr.time_formatted == "1:50:00"
