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
from app.models.concept import ConceptLink, PillarConcept
from app.models.pillar import Pillar
from app.models.user import User
from app.services.concept_seeder import seed_pillar_concepts

router = APIRouter(prefix="/api/v1/pillars", tags=["concepts"])
link_router = APIRouter(prefix="/api/v1/concepts", tags=["concept-links"])


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


# --- Cross-Pillar Concept Link Endpoints ---

class ConceptLinkPayload(BaseModel):
    concept_id_a: int
    concept_id_b: int
    link_type: str = "related"  # shared_skill, prerequisite, related
    description: Optional[str] = None


class ConceptLinkResponse(BaseModel):
    id: int
    concept_id_a: int
    concept_id_b: int
    concept_a_name: Optional[str]
    concept_b_name: Optional[str]
    pillar_a_name: Optional[str]
    pillar_b_name: Optional[str]
    link_type: str
    description: Optional[str]

    @classmethod
    def from_model(cls, link: ConceptLink, db: Session) -> "ConceptLinkResponse":
        concept_a = db.query(PillarConcept).get(link.concept_id_a)
        concept_b = db.query(PillarConcept).get(link.concept_id_b)
        pillar_a = db.query(Pillar).get(concept_a.pillar_id) if concept_a else None
        pillar_b = db.query(Pillar).get(concept_b.pillar_id) if concept_b else None
        return cls(
            id=link.id,
            concept_id_a=link.concept_id_a,
            concept_id_b=link.concept_id_b,
            concept_a_name=concept_a.name if concept_a else None,
            concept_b_name=concept_b.name if concept_b else None,
            pillar_a_name=pillar_a.name if pillar_a else None,
            pillar_b_name=pillar_b.name if pillar_b else None,
            link_type=link.link_type,
            description=link.description,
        )


VALID_LINK_TYPES = {"shared_skill", "prerequisite", "related"}


@link_router.post("/links/", response_model=ConceptLinkResponse)
def create_concept_link(payload: ConceptLinkPayload, db: Session = Depends(get_db)):
    """Create a link between two concepts (possibly cross-pillar)."""
    if payload.link_type not in VALID_LINK_TYPES:
        raise HTTPException(status_code=422, detail=f"link_type must be one of: {VALID_LINK_TYPES}")

    # Verify both concepts exist
    concept_a = db.query(PillarConcept).filter(PillarConcept.id == payload.concept_id_a).first()
    concept_b = db.query(PillarConcept).filter(PillarConcept.id == payload.concept_id_b).first()
    if not concept_a or not concept_b:
        raise HTTPException(status_code=404, detail="One or both concepts not found")

    if payload.concept_id_a == payload.concept_id_b:
        raise HTTPException(status_code=422, detail="Cannot link a concept to itself")

    # Check for existing link (in either direction)
    existing = (
        db.query(ConceptLink)
        .filter(
            ((ConceptLink.concept_id_a == payload.concept_id_a) & (ConceptLink.concept_id_b == payload.concept_id_b))
            | ((ConceptLink.concept_id_a == payload.concept_id_b) & (ConceptLink.concept_id_b == payload.concept_id_a))
        )
        .first()
    )
    if existing:
        raise HTTPException(status_code=409, detail="Link already exists between these concepts")

    link = ConceptLink(
        concept_id_a=payload.concept_id_a,
        concept_id_b=payload.concept_id_b,
        link_type=payload.link_type,
        description=payload.description,
    )
    db.add(link)
    db.commit()
    db.refresh(link)
    return ConceptLinkResponse.from_model(link, db)


@link_router.get("/{concept_id}/links", response_model=list[ConceptLinkResponse])
def get_concept_links(concept_id: int, db: Session = Depends(get_db)):
    """Get all links for a concept."""
    links = (
        db.query(ConceptLink)
        .filter(
            (ConceptLink.concept_id_a == concept_id) | (ConceptLink.concept_id_b == concept_id)
        )
        .all()
    )
    return [ConceptLinkResponse.from_model(link, db) for link in links]


@link_router.delete("/links/{link_id}")
def delete_concept_link(link_id: int, db: Session = Depends(get_db)):
    """Remove a concept link."""
    link = db.query(ConceptLink).filter(ConceptLink.id == link_id).first()
    if not link:
        raise HTTPException(status_code=404, detail="Link not found")
    db.delete(link)
    db.commit()
    return {"detail": "Link deleted", "id": link_id}


@link_router.get("/progress/overview")
def concept_progress_overview(db: Session = Depends(get_db)):
    """Get mastery map overview: per-pillar concept counts and progress."""
    from app.models.concept_touch import ConceptTouch
    from sqlalchemy import func

    user = db.query(User).first()
    if not user:
        return []

    pillars = db.query(Pillar).order_by(Pillar.display_order).all()
    result = []
    for p in pillars:
        concepts = (
            db.query(PillarConcept)
            .filter(PillarConcept.pillar_id == p.id, PillarConcept.user_id == user.id)
            .all()
        )
        total = len(concepts)
        mastered = sum(1 for c in concepts if c.status == "mastered")
        in_progress = sum(1 for c in concepts if c.status == "in_progress")

        # Recently touched (last 7 days)
        from datetime import date, timedelta
        week_ago = date.today() - timedelta(days=7)
        concept_ids = [c.id for c in concepts]
        recently_touched = 0
        if concept_ids:
            recently_touched = (
                db.query(func.count(func.distinct(ConceptTouch.concept_id)))
                .filter(
                    ConceptTouch.concept_id.in_(concept_ids),
                    ConceptTouch.touch_date >= week_ago,
                )
                .scalar()
            ) or 0

        result.append({
            "pillar_id": p.id,
            "pillar_name": p.name,
            "total_concepts": total,
            "mastered": mastered,
            "in_progress": in_progress,
            "not_started": total - mastered - in_progress,
            "recently_touched": recently_touched,
            "mastery_pct": round(mastered / max(total, 1) * 100, 1),
        })
    return result


@link_router.get("/{concept_id}/progress")
def concept_detail_progress(concept_id: int, db: Session = Depends(get_db)):
    """Get detailed progress for a single concept: touch history and stats."""
    from app.models.concept_touch import ConceptTouch

    concept = db.query(PillarConcept).filter(PillarConcept.id == concept_id).first()
    if not concept:
        raise HTTPException(status_code=404, detail="Concept not found")

    touches = (
        db.query(ConceptTouch)
        .filter(ConceptTouch.concept_id == concept_id)
        .order_by(ConceptTouch.touch_date.desc())
        .limit(20)
        .all()
    )

    touch_count = len(touches)
    avg_depth = None
    if touches:
        depths = [t.depth_score for t in touches if t.depth_score is not None]
        if depths:
            avg_depth = round(sum(depths) / len(depths), 1)

    # Get entry descriptions for context
    from app.models.daily_entry import DailyEntry
    touch_history = []
    for t in touches:
        entry = db.query(DailyEntry).filter(DailyEntry.id == t.entry_id).first()
        touch_history.append({
            "date": t.touch_date.isoformat(),
            "depth_score": t.depth_score,
            "description": entry.description[:100] if entry else None,
        })

    return {
        "concept_id": concept.id,
        "name": concept.name,
        "tier": concept.tier,
        "status": concept.status,
        "touch_count": touch_count,
        "avg_depth": avg_depth,
        "last_touched": touches[0].touch_date.isoformat() if touches else None,
        "history": touch_history,
    }


@link_router.get("/cross-pillar", response_model=list[ConceptLinkResponse])
def get_cross_pillar_links(db: Session = Depends(get_db)):
    """Get all cross-pillar concept links (for graph view)."""
    user = db.query(User).first()
    if not user:
        return []

    # Get all links where the two concepts belong to different pillars
    links = db.query(ConceptLink).all()
    cross_links = []
    for link in links:
        concept_a = db.query(PillarConcept).get(link.concept_id_a)
        concept_b = db.query(PillarConcept).get(link.concept_id_b)
        if concept_a and concept_b and concept_a.pillar_id != concept_b.pillar_id:
            cross_links.append(ConceptLinkResponse.from_model(link, db))
    return cross_links
