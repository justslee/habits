"""Tests for the progressive overload engine."""

from datetime import date, timedelta

from app.models.user import User
from app.models.workout import ExerciseLog, ExerciseProfile, WorkoutSession
from app.services.progressive_overload import (
    calculate_warmup_sets,
    estimate_1rm,
    get_next_session_targets,
    update_profile_after_session,
)


class TestEstimate1RM:
    def test_epley_basic(self):
        # 225 × 5 → ~262.5
        result = estimate_1rm(225, 5)
        assert 260 <= result <= 265

    def test_epley_single(self):
        # 1 rep = just the weight
        result = estimate_1rm(300, 1)
        assert result == 310.0  # 300 × (1 + 1/30)

    def test_epley_zero(self):
        assert estimate_1rm(0, 5) == 0
        assert estimate_1rm(100, 0) == 0

class TestWarmupSets:
    def test_warmup_for_165(self):
        sets = calculate_warmup_sets(165)
        assert len(sets) >= 2
        assert all(s["is_warmup"] for s in sets)
        assert sets[0]["weight"] == 45  # bar
        assert sets[-1]["weight"] < 165

    def test_warmup_for_light_weight(self):
        sets = calculate_warmup_sets(65)
        # No bar warmup since working weight is low
        assert all(s["weight"] < 65 for s in sets)

    def test_warmup_zero(self):
        assert calculate_warmup_sets(0) == []


class TestGetNextSessionTargets:
    def test_no_working_weight(self, db_session):
        user = db_session.query(User).first()
        profile = ExerciseProfile(
            user_id=user.id,
            exercise_name="Bench Press",
            muscle_group="push",
        )
        db_session.add(profile)
        db_session.commit()

        result = get_next_session_targets(profile, db_session)
        assert result["weight"] is None
        assert "BASELINE DISCOVERY" in result["rationale"]
        assert result.get("is_baseline") is True

    def test_no_history(self, db_session):
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

        result = get_next_session_targets(profile, db_session)
        assert result["weight"] == 165
        assert len(result["warmup_sets"]) > 0

    def test_all_reps_hit_progresses(self, db_session):
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
        db_session.flush()

        # Create a session where all sets hit target
        session = WorkoutSession(
            user_id=user.id,
            session_date=date.today() - timedelta(days=2),
            day_type="push",
        )
        db_session.add(session)
        db_session.flush()

        for i in range(1, 5):
            db_session.add(ExerciseLog(
                session_id=session.id,
                exercise_name="Bench Press",
                set_number=i,
                weight=165,
                reps=5,
            ))
        db_session.commit()

        result = get_next_session_targets(profile, db_session)
        assert result["weight"] == 170  # +5 lbs

    def test_missed_reps_stays(self, db_session):
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
        db_session.flush()

        session = WorkoutSession(
            user_id=user.id,
            session_date=date.today() - timedelta(days=2),
            day_type="push",
        )
        db_session.add(session)
        db_session.flush()

        # Hit 5, 5, 4, 3 — didn't make all reps
        for i, reps in enumerate([5, 5, 4, 3], 1):
            db_session.add(ExerciseLog(
                session_id=session.id,
                exercise_name="Bench Press",
                set_number=i,
                weight=165,
                reps=reps,
            ))
        db_session.commit()

        result = get_next_session_targets(profile, db_session)
        assert result["weight"] == 165  # stays

    def test_stall_detection(self, db_session):
        user = db_session.query(User).first()
        profile = ExerciseProfile(
            user_id=user.id,
            exercise_name="Bench Press",
            muscle_group="push",
            current_working_weight=165,
            current_rep_target=5,
            current_set_target=4,
            sessions_at_current_weight=3,
        )
        db_session.add(profile)
        db_session.flush()

        session = WorkoutSession(
            user_id=user.id,
            session_date=date.today() - timedelta(days=2),
            day_type="push",
        )
        db_session.add(session)
        db_session.flush()

        for i, reps in enumerate([5, 5, 4, 3], 1):
            db_session.add(ExerciseLog(
                session_id=session.id,
                exercise_name="Bench Press",
                set_number=i,
                weight=165,
                reps=reps,
            ))
        db_session.commit()

        result = get_next_session_targets(profile, db_session)
        assert "Stalled" in result["rationale"]
        assert "stall_recommendation" in result

    def test_deload_when_due(self, db_session):
        user = db_session.query(User).first()
        profile = ExerciseProfile(
            user_id=user.id,
            exercise_name="Bench Press",
            muscle_group="push",
            current_working_weight=165,
            current_rep_target=5,
            current_set_target=4,
            mesocycle_week=4,
            mesocycle_phase="accumulation",
        )
        db_session.add(profile)
        db_session.commit()

        result = get_next_session_targets(profile, db_session)
        assert result["weight"] < 165  # deload weight
        assert "Deload" in result["rationale"]


class TestUpdateProfileAfterSession:
    def test_progress_on_all_reps_hit(self, db_session):
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
        db_session.flush()

        logs = []
        for i in range(1, 5):
            logs.append(ExerciseLog(
                session_id=1,  # dummy
                exercise_name="Bench Press",
                set_number=i,
                weight=165,
                reps=5,
            ))

        updated = update_profile_after_session(profile, logs, db_session)
        assert updated.current_working_weight == 170
        assert updated.progression_status == "progressing"
        assert updated.sessions_at_current_weight == 0

    def test_maintain_on_missed_reps(self, db_session):
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
        db_session.flush()

        logs = []
        for i, reps in enumerate([5, 5, 4, 3], 1):
            logs.append(ExerciseLog(
                session_id=1,
                exercise_name="Bench Press",
                set_number=i,
                weight=165,
                reps=reps,
            ))

        updated = update_profile_after_session(profile, logs, db_session)
        assert updated.current_working_weight == 165  # no change
        assert updated.sessions_at_current_weight == 1
        assert updated.progression_status == "maintaining"

    def test_e1rm_updated(self, db_session):
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
        db_session.flush()

        logs = [ExerciseLog(
            session_id=1,
            exercise_name="Bench Press",
            set_number=1,
            weight=165,
            reps=5,
        )]

        updated = update_profile_after_session(profile, logs, db_session)
        assert updated.estimated_1rm is not None
        assert updated.estimated_1rm > 165
