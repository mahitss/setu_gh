"""Dashboard + hotspots + pulse + recommendations + simulate + policy query.
All aggregations are deterministic (services/hotspot_engine.py); empty DB returns zeros."""
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from sqlalchemy import func
from typing import Literal, Optional
from ..database import get_db
from ..models import CitizenSignal, Demographic
from ..schemas import SimulateIn
from ..services.engine import simulate
from ..services.hotspot_engine import (
    MODEL_NOTE, hotspot_rows, parse_hotspot_id, pulse_rows, top_categories,
)

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
    return {"hotspots": rows[:limit], "count": len(rows)}


def _detail(state: str, district: str, category: str, db: Session) -> dict:
    rows = [r for r in hotspot_rows(db)
            if r["state"] == state and r["district"] == district and r["category"] == category]
    if not rows:
        raise HTTPException(status_code=404, detail="Hotspot not found")
    r = rows[0]
    demo = db.query(Demographic).filter_by(state=state, district=district).first()
    from ..models import Infrastructure, Investment
    infra = db.query(Infrastructure).filter_by(state=state, district=district, category=category).first()
    active = db.query(func.count(Investment.id)).filter(
        Investment.state == state, Investment.district == district,
        Investment.category == category, Investment.status == "ongoing").scalar() or 0
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
        "evidence": {"signals": r["signals"], "recent_30d": r["recent_30d"], "population": r["population"],
                     "gap_index": r["gap_index"], "investment_inr": r["investment_inr"],
                     "factors": r["factors"]},
        "recommendation": f"Prioritize {category} in {district}, {state}: "
                          f"{r['signals']} signals, gap {r['gap_index']}.",
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


@router.get("/civic-pulse")
def pulse(db: Session = Depends(get_db)):
    return {"pulse": pulse_rows(db)}


@router.get("/recommendations")
def recommendations(db: Session = Depends(get_db)):
    rows = hotspot_rows(db)[:10]
    return {"recommendations": [
        {"state": r["state"], "district": r["district"], "category": r["category"],
         "evidence": {"signals": r["signals"], "population": r["population"], "gap_index": r["gap_index"],
                      "investment_inr": r["investment_inr"], "factors": r["factors"]},
         "recommendation": f"Improve {r['category']} access in {r['district']}.",
         "priority_score": r["priority_score"]} for r in rows]}


@router.post("/simulate")
def simulate_ep(payload: SimulateIn, db: Session = Depends(get_db)):
    rows = hotspot_rows(db)
    cat_rows = [r for r in rows if r["category"] == payload.sector.lower()]
    hi = [r for r in cat_rows if (r["gap_index"] or 0) >= 0.5]
    avg_pop = int(sum(r["population"] for r in hi) / max(1, len(hi))) if hi else 100000
    return simulate(payload.sector, payload.budget_cr, len(hi), avg_pop)


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
