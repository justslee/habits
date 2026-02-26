"""Seed the database with initial data."""

from sqlalchemy.orm import Session

from app.models import Pillar, User


PILLARS = [
    {
        "name": "Quantitative Finance",
        "short_name": "quant",
        "description": "Stochastic calculus, derivatives pricing, portfolio theory, risk modeling, statistical arbitrage, volatility surfaces, factor models, market microstructure",
        "depth_target": "PhD / CQF-level",
        "display_order": 1,
    },
    {
        "name": "Macro & Qualitative Investing",
        "short_name": "macro",
        "description": "Economics (macro/micro), monetary policy, fiscal policy, geopolitics, political risk, global trade flows, sector dynamics, behavioral finance, narrative analysis",
        "depth_target": "Elite generalist",
        "display_order": 2,
    },
    {
        "name": "Machine Learning (Math)",
        "short_name": "ml_math",
        "description": "Linear algebra, optimization, probability theory, statistical learning theory, deep learning foundations, kernel methods, information theory, Bayesian inference",
        "depth_target": "Research-level",
        "display_order": 3,
    },
    {
        "name": "AI Engineering & Deployment",
        "short_name": "ai_eng",
        "description": "ML systems design, model training/fine-tuning, inference optimization, MLOps/pipelines, LLM application development, agentic workflows, data engineering at scale",
        "depth_target": "Production-grade",
        "display_order": 4,
    },
    {
        "name": "Public Speaking & Communication",
        "short_name": "speaking",
        "description": "Persuasive storytelling, executive presence, pitch delivery, debate, long-form writing, media fluency, teaching ability",
        "depth_target": "Keynote-caliber",
        "display_order": 5,
    },
]


def seed_pillars(db: Session) -> list[Pillar]:
    """Seed the five pillars if they don't exist."""
    existing = db.query(Pillar).count()
    if existing > 0:
        return db.query(Pillar).order_by(Pillar.display_order).all()

    pillars = []
    for pillar_data in PILLARS:
        pillar = Pillar(**pillar_data)
        db.add(pillar)
        pillars.append(pillar)

    db.commit()
    return pillars


def seed_default_user(db: Session) -> User:
    """Seed the default user (Justin) if not exists."""
    user = db.query(User).filter(User.name == "Justin").first()
    if user:
        return user

    user = User(name="Justin", email="justin@example.com")
    db.add(user)
    db.commit()
    return user


def seed_all(db: Session) -> dict:
    """Run all seed functions."""
    pillars = seed_pillars(db)
    user = seed_default_user(db)
    return {
        "pillars": pillars,
        "user": user,
    }


if __name__ == "__main__":
    from app.db.database import SessionLocal

    db = SessionLocal()
    try:
        result = seed_all(db)
        print(f"Seeded {len(result['pillars'])} pillars")
        print(f"Default user: {result['user'].name}")
    finally:
        db.close()
