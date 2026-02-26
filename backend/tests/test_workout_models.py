"""Tests for Phase 2 workout models."""

from datetime import date

from app.models.user import User
from app.models.workout import (
    ExerciseLog,
    ExerciseProfile,
    WhoopSnapshot,
    WorkoutSession,
)


class TestWorkoutSession:
    def test_create_session(self, db_session):
        user = db_session.query(User).first()
        session = WorkoutSession(
            user_id=user.id,
            session_date=date.today(),
            day_type="push",
            status="planned",
        )
        db_session.add(session)
        db_session.commit()
        assert session.id is not None
        assert session.day_type == "push"

    def test_session_with_exercises(self, db_session):
        user = db_session.query(User).first()
        session = WorkoutSession(
            user_id=user.id,
            session_date=date.today(),
            day_type="push",
        )
        db_session.add(session)
        db_session.flush()

        log = ExerciseLog(
            session_id=session.id,
            exercise_name="Bench Press",
            set_number=1,
            weight=165,
            reps=5,
        )
        db_session.add(log)
        db_session.commit()

        assert len(session.exercises) == 1
        assert session.exercises[0].volume_load == 825

    def test_session_with_whoop(self, db_session):
        user = db_session.query(User).first()
        session = WorkoutSession(
            user_id=user.id,
            session_date=date.today(),
            day_type="push",
            whoop_recovery_score=78,
            whoop_hrv=68,
            whoop_resting_hr=52,
            whoop_sleep_score=85,
        )
        db_session.add(session)
        db_session.commit()
        assert session.whoop_recovery_score == 78


class TestExerciseProfile:
    def test_create_profile(self, db_session):
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
        assert profile.progression_status == "progressing"
        assert profile.mesocycle_phase == "accumulation"

    def test_default_values(self, db_session):
        user = db_session.query(User).first()
        profile = ExerciseProfile(
            user_id=user.id,
            exercise_name="OHP",
            muscle_group="push",
        )
        db_session.add(profile)
        db_session.commit()
        assert profile.stall_count == 0
        assert profile.sessions_at_current_weight == 0
        assert profile.mesocycle_week == 1


class TestWhoopSnapshot:
    def test_create_snapshot(self, db_session):
        user = db_session.query(User).first()
        snap = WhoopSnapshot(
            user_id=user.id,
            snapshot_date=date.today(),
            recovery_score=74,
            hrv=71,
            resting_hr=50,
            sleep_score=84,
            strain_score=12.5,
        )
        db_session.add(snap)
        db_session.commit()
        assert snap.recovery_score == 74


class TestExerciseLog:
    def test_volume_load(self, db_session):
        user = db_session.query(User).first()
        session = WorkoutSession(
            user_id=user.id,
            session_date=date.today(),
            day_type="push",
        )
        db_session.add(session)
        db_session.flush()

        log = ExerciseLog(
            session_id=session.id,
            exercise_name="Bench Press",
            set_number=1,
            weight=165,
            reps=5,
        )
        assert log.volume_load == 825

    def test_warmup_flag(self, db_session):
        user = db_session.query(User).first()
        session = WorkoutSession(
            user_id=user.id,
            session_date=date.today(),
            day_type="push",
        )
        db_session.add(session)
        db_session.flush()

        warmup = ExerciseLog(
            session_id=session.id,
            exercise_name="Bench Press",
            set_number=1,
            weight=95,
            reps=10,
            is_warmup=True,
        )
        db_session.add(warmup)
        db_session.commit()
        assert warmup.is_warmup is True

    def test_cardio_fields(self, db_session):
        user = db_session.query(User).first()
        session = WorkoutSession(
            user_id=user.id,
            session_date=date.today(),
            day_type="cardio",
        )
        db_session.add(session)
        db_session.flush()

        log = ExerciseLog(
            session_id=session.id,
            exercise_name="Easy Jog",
            set_number=1,
            duration_minutes=15,
            distance_miles=1.5,
        )
        db_session.add(log)
        db_session.commit()
        assert log.duration_minutes == 15
        assert log.distance_miles == 1.5
