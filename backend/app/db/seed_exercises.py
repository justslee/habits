"""Seed exercise profiles from Notion Lift Log data.

Based on Justin's actual working weights as of 2026-02-04.
"""

from sqlalchemy.orm import Session

from app.models.workout import ExerciseProfile

# Exercises from Notion Lift Log + standard pull/legs exercises at estimated baselines
EXERCISE_SEEDS = [
    # Push (from Notion data)
    {"exercise_name": "Bench Press", "muscle_group": "push", "current_working_weight": 135, "current_rep_target": 5, "current_set_target": 3},
    {"exercise_name": "OHP", "muscle_group": "push", "current_working_weight": 40, "current_rep_target": 8, "current_set_target": 3},
    {"exercise_name": "Incline DB Press", "muscle_group": "push", "current_working_weight": 50, "current_rep_target": 8, "current_set_target": 3},
    {"exercise_name": "Tricep Pushdowns", "muscle_group": "push", "current_working_weight": 30, "current_rep_target": 12, "current_set_target": 3},
    {"exercise_name": "Lateral Raises", "muscle_group": "push", "current_working_weight": 12.5, "current_rep_target": 12, "current_set_target": 3},
    {"exercise_name": "Overhead Tricep Extension", "muscle_group": "push", "current_working_weight": 20, "current_rep_target": 10, "current_set_target": 3},

    # Pull (no Notion data — baseline discovery mode)
    {"exercise_name": "Barbell Row", "muscle_group": "pull", "current_working_weight": None, "current_rep_target": 8, "current_set_target": 4},
    {"exercise_name": "Pull-ups", "muscle_group": "pull", "current_working_weight": None, "current_rep_target": 6, "current_set_target": 3},
    {"exercise_name": "Seated Cable Row", "muscle_group": "pull", "current_working_weight": None, "current_rep_target": 10, "current_set_target": 3},
    {"exercise_name": "Barbell Curl", "muscle_group": "pull", "current_working_weight": None, "current_rep_target": 10, "current_set_target": 3},
    {"exercise_name": "Face Pulls", "muscle_group": "pull", "current_working_weight": None, "current_rep_target": 15, "current_set_target": 3},

    # Legs (no Notion data — baseline discovery mode)
    {"exercise_name": "Squat", "muscle_group": "legs", "current_working_weight": None, "current_rep_target": 5, "current_set_target": 4},
    {"exercise_name": "RDL", "muscle_group": "legs", "current_working_weight": None, "current_rep_target": 8, "current_set_target": 3},
    {"exercise_name": "Leg Press", "muscle_group": "legs", "current_working_weight": None, "current_rep_target": 10, "current_set_target": 3},
    {"exercise_name": "Walking Lunges", "muscle_group": "legs", "current_working_weight": None, "current_rep_target": 10, "current_set_target": 3},
    {"exercise_name": "Calf Raises", "muscle_group": "legs", "current_working_weight": None, "current_rep_target": 15, "current_set_target": 3},
]


def seed_exercise_profiles(user_id: int, db: Session) -> None:
    """Seed exercise profiles for a user. Skips existing profiles."""
    for seed in EXERCISE_SEEDS:
        existing = (
            db.query(ExerciseProfile)
            .filter(
                ExerciseProfile.user_id == user_id,
                ExerciseProfile.exercise_name == seed["exercise_name"],
            )
            .first()
        )
        if existing:
            continue

        profile = ExerciseProfile(
            user_id=user_id,
            **seed,
        )
        db.add(profile)

    db.commit()
