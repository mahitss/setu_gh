"""Dashboard + hotspots + pulse + recommendations + simulate + policy query.
All aggregations are deterministic (services/hotspot_engine.py); empty DB returns zeros."""
import json
import logging
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from sqlalchemy import func
from typing import Literal, Optional
from ..database import get_db
from ..models import CitizenSignal, Demographic, Infrastructure, Investment, Recommendation
from ..schemas import NLQueryIn, PolicyQueryFilters, SimulateCompareIn, SimulateIn
from ..services.engine import simulate
from ..services.gemini import explain_recommendation, explain_structured
from ..services.recommendation_engine import build_recommendation
from ..services.hotspot_engine import (
    MODEL_NOTE, civic_pulse, hotspot_id, hotspot_rows, parse_hotspot_id, top_categories,
)
from ..services.seed import DATA_SOURCE
from ..services.simulation_engine import ASSUMPTIONS, INTERVENTIONS, LABEL, simulate_district
from ..services.nl_query import parse_question

log = logging.getLogger("jansetu.analytics")
router = APIRouter()

CategoryQ = Literal["healthcare", "education", "roads", "water", "sanitation",
                    "electricity", "public_transport", "digital_infrastructure",
                    "housing", "environment", "other"]
SeverityQ = Literal["low", "medium", "high", "critical"]
PriorityQ = Literal["critical", "high", "medium", "low", "minimal"]


@router.get("/dashboard/summary")
def summary(db: Session = Depends(get_db)):
    total = db.query(func.count(CitizenSignal.id)).scalar() or 0
    rows = hotspot_rows(db)
    pop = db.query(func.sum(Demographic.population)).scalar() or 0
    return {"total_signals": total, "citizen_signals": total,
            "active_hotspots": len([r for r in rows if r["priority_score"] >= 0.5]),
            "high_priority_areas": len([r for r in rows if r["priority_score"] >= 0.7]),
            "population_covered": pop, "population_affected": pop,
            "data_source": DATA_SOURCE, "source_type": "synthetic",
            "top_categories": top_categories(db), "top_hotspots": rows[:10]}


@router.get("/hotspots")
def hotspots(
    db: Session = Depends(get_db),
    state: Optional[str] = Query(default=None, max_length=128),
    district: Optional[str] = Query(default=None, max_length=128),
    category: Optional[CategoryQ] = Query(default=None),
    severity: Optional[SeverityQ] = Query(default=None),
    priority: Optional[PriorityQ] = Query(default=None),
    limit: int = Query(default=50, ge=1, le=100),
):
    """Server-side aggregation + filtering. Never ships raw signals to the browser."""
    rows = hotspot_rows(db)
    if state:
        rows = [r for r in rows if r["state"] == state]
    if district:
        rows = [r for r in rows if r["district"] == district]
    if category:
        rows = [r for r in rows if r["category"] == category]
    if severity:
        keys = set(db.query(CitizenSignal.state, CitizenSignal.district, CitizenSignal.category)
                   .filter(CitizenSignal.severity == severity).distinct().all())
        rows = [r for r in rows if (r["state"], r["district"], r["category"]) in keys]
    if priority:
        rows = [r for r in rows if r["priority_level"] == priority]
    return {"hotspots": rows[:limit], "count": len(rows),
            "data_source": DATA_SOURCE, "source_type": "synthetic"}


def _detail(state: str, district: str, category: str, db: Session) -> dict:
    rows = [r for r in hotspot_rows(db)
            if r["state"] == state and r["district"] == district and r["category"] == category]
    if not rows:
        raise HTTPException(status_code=404, detail="Hotspot not found")
    r = rows[0]
    demo = db.query(Demographic).filter_by(state=state, district=district).first()
    infra = db.query(Infrastructure).filter_by(state=state, district=district, category=category).first()
    active = db.query(func.count(Investment.id)).filter(
        Investment.state == state, Investment.district == district,
        Investment.category == category, Investment.status == "ongoing").scalar() or 0
    evidence = {"signals": r["signals"], "recent_30d": r["recent_30d"], "population": r["population"],
                "gap_index": r["gap_index"], "investment_inr": r["investment_inr"],
                "factors": r["factors"]}
    rec_text, rec_source = explain_recommendation(state, district, category, evidence)
    structured = build_recommendation(state, district, category, r)
    return {
        "location": {"state": state, "district": district},
        "category": category,
        "citizen_demand": {"total_signals": r["signals"], "recent_signals": r["recent_30d"],
                           "trend_percent": r["trend_pct"]},
        "demographics": {"population": r["population"],
                         "population_density": demo.population_density if demo else None},
        "infrastructure": {"facility_count": infra.facility_count if infra else None,
                           "coverage_index": infra.coverage_index if infra else None,
                           "gap_index": r["gap_index"]},
        "investment": {"total": r["investment_inr"], "active_projects": active},
        "priority": {"demand_index": r["demand_index"], "priority_score": r["priority_score"],
                     "level": r["priority_level"], "model_note": MODEL_NOTE},
        "hotspot": r,
        "evidence": evidence,
        "recommendation": rec_text,
        "recommendation_structured": structured,
        "explanation_source": rec_source,
        "note": "Prototype priority analysis. Metrics deterministic; wording explanatory.",
    }


@router.get("/hotspots/by-id/{hotspot_id}")
def hotspot_by_id(hotspot_id: str, db: Session = Depends(get_db)):
    parsed = parse_hotspot_id(hotspot_id)
    if not parsed:
        raise HTTPException(status_code=404, detail="Hotspot not found")
    return _detail(*parsed, db)


@router.get("/hotspots/{state}/{district}/{category}")
def hotspot_detail(state: str, district: str, category: str, db: Session = Depends(get_db)):
    return _detail(state, district, category, db)


@router.get("/hotspots/{hotspot_id}")
def hotspot_by_short_id(hotspot_id: str, db: Session = Depends(get_db)):
    """Literal /hotspots/{id} lookup (stable base64 id from the hotspot list)."""
    parsed = parse_hotspot_id(hotspot_id)
    if not parsed:
        raise HTTPException(status_code=404, detail="Hotspot not found")
    return _detail(*parsed, db)


@router.get("/hotspots/{hotspot_id}/recommendation")
def hotspot_recommendation(hotspot_id: str, db: Session = Depends(get_db)):
    """Deterministic recommendation + evidence; Gemini explains only."""
    parsed = parse_hotspot_id(hotspot_id)
    if not parsed:
        raise HTTPException(status_code=404, detail="Hotspot not found")
    state, district, category = parsed
    rows = [r for r in hotspot_rows(db)
            if r["state"] == state and r["district"] == district and r["category"] == category]
    if not rows:
        raise HTTPException(status_code=404, detail="Hotspot not found")
    structured = build_recommendation(state, district, category, rows[0])
    explanation, source = explain_structured({
        "category": category, "signal_count": structured["evidence"]["citizen_signals"],
        "population": structured["evidence"]["population_affected"],
        "infrastructure_gap": structured["evidence"]["infrastructure_gap"],
        "trend": structured["evidence"]["demand_trend"],
        "investment": structured["evidence"]["existing_investment"]})
    return {"recommendation": {"intervention": structured["intervention"],
                               "confidence": structured["confidence"],
                               "confidence_label": structured["confidence_label"]},
            "reasoning": structured["reasoning"],
            "evidence": structured["evidence"],
            "explanation": explanation, "explanation_source": source}


@router.get("/civic-pulse")
def pulse(db: Session = Depends(get_db)):
    return {**civic_pulse(db), "data_source": DATA_SOURCE, "source_type": "synthetic"}


@router.get("/recommendations")
def recommendations(db: Session = Depends(get_db)):
    """Top-10 computed live AND persisted (upsert) to the recommendations table."""
    rows = hotspot_rows(db)[:10]
    out = []
    for r in rows:
        ev = {"signals": r["signals"], "population": r["population"], "gap_index": r["gap_index"],
              "investment_inr": r["investment_inr"], "factors": r["factors"]}
        rec_text, _ = explain_recommendation(r["state"], r["district"], r["category"], ev)
        existing = db.query(Recommendation).filter_by(
            state=r["state"], district=r["district"], category=r["category"]).first()
        if existing:
            existing.evidence = json.dumps(ev)
            existing.recommendation = rec_text
            existing.population_affected = r["population"]
            existing.confidence = r["priority_score"]
            rec_id = existing.id
        else:
            rec = Recommendation(state=r["state"], district=r["district"], category=r["category"],
                                 evidence=json.dumps(ev), recommendation=rec_text,
                                 population_affected=r["population"], confidence=r["priority_score"])
            db.add(rec)
            db.flush()
            rec_id = rec.id
        out.append({"id": rec_id, "state": r["state"], "district": r["district"], "category": r["category"],
                    "evidence": ev, "recommendation": rec_text, "priority_score": r["priority_score"]})
    db.commit()
    return {"recommendations": out}


@router.post("/simulate")
def simulate_ep(payload: SimulateIn, db: Session = Depends(get_db)):
    if payload.district:
        if payload.category not in INTERVENTIONS:
            raise HTTPException(status_code=422, detail=f"Unsupported category: {payload.category}")
        if payload.intervention and payload.intervention not in INTERVENTIONS[payload.category]:
            raise HTTPException(status_code=400,
                                detail=f"Unsupported intervention for {payload.category}: {payload.intervention}")
        out = simulate_district(db, payload.state or "", payload.district, payload.category,
                                payload.budget_inr(), payload.intervention)
        if out is None:
            raise HTTPException(status_code=404, detail="No baseline data for this location/sector")
        return out
    rows = hotspot_rows(db)
    cat_rows = [r for r in rows if r["category"] == (payload.sector or "").lower()]
    hi = [r for r in cat_rows if (r["gap_index"] or 0) >= 0.5]
    avg_pop = int(sum(r["population"] for r in hi) / max(1, len(hi))) if hi else 100000
    return simulate(payload.sector or "other", (payload.budget_inr() / 1e7), len(hi), avg_pop)


@router.get("/simulate/interventions")
def simulate_interventions():
    """Allowlisted category -> intervention mapping (LLM may not invent these)."""
    return {"interventions": {c: sorted(v) for c, v in INTERVENTIONS.items()}}


@router.post("/simulate/compare")
def simulate_compare(payload: SimulateCompareIn, db: Session = Depends(get_db)):
    """Same deterministic engine across budgets — comparison table."""
    if payload.category not in INTERVENTIONS:
        raise HTTPException(status_code=422, detail=f"Unsupported category: {payload.category}")
    if payload.intervention and payload.intervention not in INTERVENTIONS[payload.category]:
        raise HTTPException(status_code=400, detail="Unsupported intervention for this category")
    for b in payload.budgets_cr:
        if b <= 0:
            raise HTTPException(status_code=422, detail="Budgets must be positive")
    rows = []
    for b in payload.budgets_cr:
        out = simulate_district(db, payload.state, payload.district, payload.category,
                                b * 1e7, payload.intervention)
        if out is None:
            raise HTTPException(status_code=404, detail="No baseline data for this location/sector")
        e = out["estimate"]
        rows.append({"budget_cr": b, "population_reached": e["population_reached"],
                     "coverage_improvement": e["coverage_improvement"],
                     "gap_reduction": e["gap_reduction"]})
    return {"label": LABEL, "scenario": out["scenario"], "baseline": out["baseline"],
            "comparison": rows, "assumptions": ASSUMPTIONS}


@router.get("/policy-query")
def policy_query(
    db: Session = Depends(get_db),
    category: Optional[CategoryQ] = Query(default=None),
    min_gap: float = Query(default=0.0, ge=0.0, le=1.0),
    min_signals: int = Query(default=0, ge=0),
    max_investment_cr: Optional[float] = Query(default=None, gt=0),
):
    """E.g. high healthcare demand + low investment. All params allowlisted/validated."""
    rows = hotspot_rows(db)
    out = []
    for r in rows:
        if category and r["category"] != category:
            continue
        if (r["gap_index"] or 0) < min_gap:
            continue
        if r["signals"] < min_signals:
            continue
        if max_investment_cr is not None and r["investment_inr"] > max_investment_cr * 1e7:
            continue
        out.append(r)
    return {"matches": out[:50], "count": len(out)}


def _apply_policy_filters(db: Session, f: PolicyQueryFilters) -> list[dict]:
    rows = hotspot_rows(db)
    out = []
    for r in rows:
        if f.category and r["category"] != f.category:
            continue
        if f.state and r["state"] != f.state:
            continue
        if f.district and r["district"] != f.district:
            continue
        if (r["gap_index"] or 0) < f.min_gap:
            continue
        if r["signals"] < f.min_signals:
            continue
        if f.max_investment_cr is not None and r["investment_inr"] > f.max_investment_cr * 1e7:
            continue
        out.append({"id": hotspot_id(r["state"], r["district"], r["category"]),
                    "state": r["state"], "district": r["district"], "category": r["category"],
                    "signals": r["signals"], "gap_index": r["gap_index"],
                    "investment_inr": r["investment_inr"], "priority_score": r["priority_score"],
                    "priority_level": r["priority_level"]})
    return out


@router.post("/policy-query/nl")
def policy_query_nl(payload: NLQueryIn, db: Session = Depends(get_db)):
    """Policymaker asks in English; backend parses to allowlisted filters and executes."""
    parsed = parse_question(payload.question, db)
    try:
        filters = PolicyQueryFilters(**parsed["filters"])
    except Exception:
        log.warning("NL filters failed validation, using empty filter")
        filters = PolicyQueryFilters()
    matches = _apply_policy_filters(db, filters)
    return {"question": payload.question, "filters": filters.model_dump(exclude_none=True),
            "source": parsed["source"], "matches": matches[:20], "count": len(matches)}
