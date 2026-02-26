"""Tests for SQLAlchemy models."""

import pytest
from datetime import date, datetime
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app.models import (
    Base,
    Pillar,
    User,
    DailyEntry,
    Evaluation,
    PillarScore,
    Streak,
    Milestone,
)
from app.db.seed import seed_pillars, seed_default_user


@pytest.fixture
def db_session():
    """Create a fresh in-memory database for each test."""
    engine = create_engine("sqlite:///:memory:")
    Base.metadata.create_all(engine)
    Session = sessionmaker(bind=engine)
    session = Session()
    yield session
    session.close()


class TestPillar:
    """Tests for Pillar model."""

    def test_seed_pillars(self, db_session):
        """Test that five pillars are seeded correctly."""
        pillars = seed_pillars(db_session)
        assert len(pillars) == 5
        
        # Verify pillar names
        names = [p.name for p in pillars]
        assert "Quantitative Finance" in names
        assert "Machine Learning (Math)" in names
        assert "Public Speaking & Communication" in names

    def test_pillar_uniqueness(self, db_session):
        """Test that pillar names are unique."""
        pillar1 = Pillar(name="Test", short_name="test1", display_order=1)
        db_session.add(pillar1)
        db_session.commit()

        pillar2 = Pillar(name="Test", short_name="test2", display_order=2)
        db_session.add(pillar2)
        with pytest.raises(Exception):  # IntegrityError
            db_session.commit()


class TestUser:
    """Tests for User model."""

    def test_create_user(self, db_session):
        """Test user creation."""
        user = User(name="Test User", email="test@example.com")
        db_session.add(user)
        db_session.commit()

        assert user.id is not None
        assert user.name == "Test User"
        assert user.created_at is not None

    def test_seed_default_user(self, db_session):
        """Test that default user is seeded."""
        user = seed_default_user(db_session)
        assert user.name == "Justin"
        
        # Seeding again should return same user
        user2 = seed_default_user(db_session)
        assert user.id == user2.id


class TestDailyEntry:
    """Tests for DailyEntry model."""

    def test_create_entry(self, db_session):
        """Test entry creation with all fields."""
        user = User(name="Test")
        db_session.add(user)
        db_session.commit()

        entry = DailyEntry(
            user_id=user.id,
            entry_date=date.today(),
            description="Studied stochastic calculus for 2 hours",
            time_invested_minutes=120,
            pillar_tags="1,3",
            difficulty_rating=8,
            energy_level=7,
            key_takeaway="Finally understood Ito's lemma",
        )
        db_session.add(entry)
        db_session.commit()

        assert entry.id is not None
        assert entry.pillar_tag_list == [1, 3]
        assert entry.created_at is not None

    def test_pillar_tag_list_property(self, db_session):
        """Test the pillar_tag_list getter and setter."""
        user = User(name="Test")
        db_session.add(user)
        db_session.commit()

        entry = DailyEntry(
            user_id=user.id,
            entry_date=date.today(),
            description="Test",
            time_invested_minutes=60,
        )
        
        # Test setter
        entry.pillar_tag_list = [1, 2, 5]
        assert entry.pillar_tags == "1,2,5"
        
        # Test getter
        assert entry.pillar_tag_list == [1, 2, 5]
        
        # Test empty
        entry.pillar_tag_list = []
        assert entry.pillar_tags is None
        assert entry.pillar_tag_list == []


class TestEvaluation:
    """Tests for Evaluation model."""

    def test_create_evaluation(self, db_session):
        """Test evaluation creation."""
        user = User(name="Test")
        db_session.add(user)
        db_session.commit()

        entry = DailyEntry(
            user_id=user.id,
            entry_date=date.today(),
            description="Deep work on derivatives",
            time_invested_minutes=180,
        )
        db_session.add(entry)
        db_session.commit()

        evaluation = Evaluation(
            entry_id=entry.id,
            depth_score=85,
            relevance_score=90,
            consistency_multiplier=1.2,
            one_percent_better=True,
            verdict_explanation="Genuine struggle with hard material.",
            commentary="This is real progress. You tackled Black-Scholes proofs.",
        )
        db_session.add(evaluation)
        db_session.commit()

        assert evaluation.id is not None
        assert evaluation.combined_score == pytest.approx((85 + 90) / 2 * 1.2)

    def test_evaluation_entry_relationship(self, db_session):
        """Test one-to-one relationship with entry."""
        user = User(name="Test")
        db_session.add(user)
        db_session.commit()

        entry = DailyEntry(
            user_id=user.id,
            entry_date=date.today(),
            description="Test",
            time_invested_minutes=60,
        )
        db_session.add(entry)
        db_session.commit()

        evaluation = Evaluation(
            entry_id=entry.id,
            depth_score=50,
            relevance_score=60,
            one_percent_better=False,
            verdict_explanation="Surface level work.",
            commentary="You read notes you already know.",
        )
        db_session.add(evaluation)
        db_session.commit()

        # Test relationship
        assert entry.evaluation.id == evaluation.id
        assert evaluation.entry.id == entry.id


class TestStreak:
    """Tests for Streak model."""

    def test_streak_update_first_activity(self, db_session):
        """Test first activity creates streak of 1."""
        seed_pillars(db_session)
        user = seed_default_user(db_session)

        streak = Streak(user_id=user.id, pillar_id=1)
        db_session.add(streak)
        db_session.commit()

        streak.update_streak(date(2024, 1, 1))
        assert streak.current_streak == 1
        assert streak.last_activity_date == date(2024, 1, 1)

    def test_streak_consecutive_days(self, db_session):
        """Test consecutive days extend streak."""
        seed_pillars(db_session)
        user = seed_default_user(db_session)

        streak = Streak(user_id=user.id, pillar_id=1)
        db_session.add(streak)
        db_session.commit()

        streak.update_streak(date(2024, 1, 1))
        streak.update_streak(date(2024, 1, 2))
        streak.update_streak(date(2024, 1, 3))
        
        assert streak.current_streak == 3
        assert streak.longest_streak == 3

    def test_streak_break(self, db_session):
        """Test streak resets after gap."""
        seed_pillars(db_session)
        user = seed_default_user(db_session)

        streak = Streak(user_id=user.id, pillar_id=1)
        db_session.add(streak)
        db_session.commit()

        streak.update_streak(date(2024, 1, 1))
        streak.update_streak(date(2024, 1, 2))
        streak.update_streak(date(2024, 1, 3))
        
        # Gap of 2 days
        streak.update_streak(date(2024, 1, 6))
        
        assert streak.current_streak == 1
        assert streak.longest_streak == 3
        assert streak.days_since_break == 3


class TestMilestone:
    """Tests for Milestone model."""

    def test_create_milestone(self, db_session):
        """Test milestone creation."""
        seed_pillars(db_session)
        user = seed_default_user(db_session)

        milestone = Milestone(
            user_id=user.id,
            pillar_id=1,
            title="First derivatives model built",
            description="Implemented Black-Scholes pricing in Python",
            achieved_date=date(2024, 3, 15),
        )
        db_session.add(milestone)
        db_session.commit()

        assert milestone.id is not None
        assert milestone.pillar.name == "Quantitative Finance"


class TestFullHistory:
    """Tests for append-only history requirement (D-005)."""

    def test_entries_are_append_only(self, db_session):
        """Verify entries support full history queries."""
        user = User(name="Test")
        db_session.add(user)
        db_session.commit()

        # Create multiple entries
        for i in range(5):
            entry = DailyEntry(
                user_id=user.id,
                entry_date=date(2024, 1, i + 1),
                description=f"Day {i + 1} work",
                time_invested_minutes=60 + i * 10,
            )
            db_session.add(entry)
        db_session.commit()

        # Query all entries
        entries = db_session.query(DailyEntry).filter(
            DailyEntry.user_id == user.id
        ).order_by(DailyEntry.entry_date).all()

        assert len(entries) == 5
        assert entries[0].entry_date == date(2024, 1, 1)
        assert entries[4].entry_date == date(2024, 1, 5)
