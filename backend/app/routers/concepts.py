"""Pillar Concept Tree API endpoints (P5-2).

CRUD for concept trees — each pillar has 40-80 concepts in 5 tiers.
Seed endpoint triggers LLM generation from Vision context.
"""

import json
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.db.database import get_db
from app.models.concept import PillarConcept
from app.models.user import User
from app.services.concept_seeder import seed_pillar_concepts

router = APIRouter(prefix="/api/v1/pillars", tags=["concepts"])


# --- Schemas ---

class ConceptResponse(BaseModel):
    id: int
    pillar_id: int
    name: str
    tier: int
    description: Optional[str]
    prerequisites: Optional[list[str]]
    status: str
    notes: Optional[str]
    key_resources: Optional[str]
    sort_order: int

    @classmethod
    def from_model(cls, c: PillarConcept) -> "ConceptResponse":
        prereqs = None
        if c.prerequisites:
            try:
                prereqs = json.loads(c.prerequisites)
            except (json.JSONDecodeError, TypeError):
                prereqs = None
        return cls(
            id=c.id,
            pillar_id=c.pillar_id,
            name=c.name,
            tier=c.tier,
            description=c.description,
            prerequisites=prereqs,
            status=c.status,
            notes=c.notes,
            key_resources=c.key_resources,
            sort_order=c.sort_order,
        )


class TierGroup(BaseModel):
    tier: int
    tier_name: str
    concepts: list[ConceptResponse]


class ConceptTreeResponse(BaseModel):
    pillar_id: int
    total: int
    mastered: int
    in_progress: int
    tiers: list[TierGroup]


class ConceptCreatePayload(BaseModel):
    name: str
    tier: int  # 1-5
    description: Optional[str] = None
    prerequisites: Optional[list[str]] = None
    key_resources: Optional[str] = None
    sort_order: Optional[int] = 0


class ConceptUpdatePayload(BaseModel):
    name: Optional[str] = None
    tier: Optional[int] = None
    description: Optional[str] = None
    prerequisites: Optional[list[str]] = None
    status: Optional[str] = None  # not_started, in_progress, mastered
    notes: Optional[str] = None
    key_resources: Optional[str] = None
    sort_order: Optional[int] = None


TIER_NAMES = {
    1: "Foundation",
    2: "Core",
    3: "Advanced",
    4: "Expert",
    5: "Frontier",
}

VALID_STATUSES = {"not_started", "in_progress", "mastered"}


# --- Endpoints ---

@router.get("/{pillar_id}/concepts", response_model=ConceptTreeResponse)
def get_concepts(pillar_id: int, db: Session = Depends(get_db)):
    """Get all concepts for a pillar, grouped by tier."""
    user = db.query(User).first()
    if not user:
        raise HTTPException(status_code=404, detail="No user found")

    concepts = (
        db.query(PillarConcept)
        .filter(
            PillarConcept.pillar_id == pillar_id,
            PillarConcept.user_id == user.id,
        )
        .order_by(PillarConcept.tier, PillarConcept.sort_order, PillarConcept.id)
        .all()
    )

    # Group by tier
    tier_map: dict[int, list[ConceptResponse]] = {}
    for c in concepts:
        resp = ConceptResponse.from_model(c)
        tier_map.setdefault(c.tier, []).append(resp)

    tiers = []
    for t in range(1, 6):
        tiers.append(TierGroup(
            tier=t,
            tier_name=TIER_NAMES[t],
            concepts=tier_map.get(t, []),
        ))

    total = len(concepts)
    mastered = sum(1 for c in concepts if c.status == "mastered")
    in_progress = sum(1 for c in concepts if c.status == "in_progress")

    return ConceptTreeResponse(
        pillar_id=pillar_id,
        total=total,
        mastered=mastered,
        in_progress=in_progress,
        tiers=tiers,
    )


class SeedMode(BaseModel):
    mode: str = "quick"  # "quick" or "research"


@router.post("/{pillar_id}/concepts/seed", response_model=ConceptTreeResponse)
async def seed_concepts(
    pillar_id: int,
    payload: Optional[SeedMode] = None,
    db: Session = Depends(get_db),
):
    """Seed (or re-seed) concepts for a pillar using LLM.

    Deletes all existing concepts for this pillar and regenerates from scratch.

    Modes:
    - "quick": Vision-only context, single LLM call (~15s)
    - "research": Full pipeline — Notion KB scan + web research + Vision (~60s)
    """
    mode = payload.mode if payload else "quick"
    if mode not in ("quick", "research"):
        raise HTTPException(status_code=422, detail="Mode must be 'quick' or 'research'")

    try:
        await seed_pillar_concepts(pillar_id, db, mode=mode)
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Seeding failed: {e}")

    # Return the fresh tree
    return get_concepts(pillar_id, db)


@router.post("/{pillar_id}/concepts", response_model=ConceptResponse)
def add_concept(pillar_id: int, payload: ConceptCreatePayload, db: Session = Depends(get_db)):
    """Add a custom concept to a pillar."""
    user = db.query(User).first()
    if not user:
        raise HTTPException(status_code=404, detail="No user found")

    if not 1 <= payload.tier <= 5:
        raise HTTPException(status_code=422, detail="Tier must be 1-5")

    concept = PillarConcept(
        pillar_id=pillar_id,
        user_id=user.id,
        name=payload.name,
        tier=payload.tier,
        description=payload.description,
        prerequisites=json.dumps(payload.prerequisites) if payload.prerequisites else None,
        key_resources=payload.key_resources,
        sort_order=payload.sort_order or 0,
        status="not_started",
    )
    db.add(concept)
    db.commit()
    db.refresh(concept)
    return ConceptResponse.from_model(concept)


@router.put("/{pillar_id}/concepts/{concept_id}", response_model=ConceptResponse)
def update_concept(
    pillar_id: int,
    concept_id: int,
    payload: ConceptUpdatePayload,
    db: Session = Depends(get_db),
):
    """Update a concept (status, notes, name, description, etc.)."""
    concept = (
        db.query(PillarConcept)
        .filter(PillarConcept.id == concept_id, PillarConcept.pillar_id == pillar_id)
        .first()
    )
    if not concept:
        raise HTTPException(status_code=404, detail="Concept not found")

    if payload.name is not None:
        concept.name = payload.name[:200]
    if payload.tier is not None:
        if not 1 <= payload.tier <= 5:
            raise HTTPException(status_code=422, detail="Tier must be 1-5")
        concept.tier = payload.tier
    if payload.description is not None:
        concept.description = payload.description
    if payload.prerequisites is not None:
        concept.prerequisites = json.dumps(payload.prerequisites)
    if payload.status is not None:
        if payload.status not in VALID_STATUSES:
            raise HTTPException(status_code=422, detail=f"Status must be one of: {VALID_STATUSES}")
        concept.status = payload.status
    if payload.notes is not None:
        concept.notes = payload.notes
    if payload.key_resources is not None:
        concept.key_resources = payload.key_resources
    if payload.sort_order is not None:
        concept.sort_order = payload.sort_order

    db.commit()
    db.refresh(concept)
    return ConceptResponse.from_model(concept)


@router.delete("/{pillar_id}/concepts/{concept_id}")
def delete_concept(pillar_id: int, concept_id: int, db: Session = Depends(get_db)):
    """Delete a concept (hard delete — concepts are user-customizable)."""
    concept = (
        db.query(PillarConcept)
        .filter(PillarConcept.id == concept_id, PillarConcept.pillar_id == pillar_id)
        .first()
    )
    if not concept:
        raise HTTPException(status_code=404, detail="Concept not found")

    db.delete(concept)
    db.commit()
    return {"detail": "Concept deleted", "id": concept_id}
