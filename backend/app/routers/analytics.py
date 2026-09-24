"""Dashboard + hotspots + pulse + recommendations + simulate.
Deterministic aggregations over seeded/demo data (Phase 6/7/9/11/12 fleshed out later)."""
from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session
from sqlalchemy import func
from datetime import datetime, timedelta
from typing import Literal, Optional
from ..database import get_db
from ..models import CitizenSignal, Demographic, Infrastructure, Investment
from ..schemas import SimulateIn
from ..services.engine import priority_score, population_impact, investment_gap, trend_score, simulate

router = APIRouter()


def _hotspot_rows(db: Session):
    signals = (db.query(CitizenSignal.state, CitizenSignal.district, CitizenSignal.category,
                        func.count().label("n"),
                        func.avg(CitizenSignal.latitude).label("lat"),
                        func.avg(CitizenSignal.longitude).label("lon"))
               .group_by(CitizenSignal.state, CitizenSignal.district, CitizenSignal.category).all())
    max_n = max([r.n for r in signals], default=1)
    max_pop = db.query(func.max(Demographic.population)).scalar() or 1
    avg_inv = db.query(func.avg(Investment.amount)).scalar() or 1
    out = []
    for r in signals:
        infra = db.query(Infrastructure).filter_by(state=r.state, district=r.district, category=r.category).first()
        demo = db.query(Demographic).filter_by(state=r.state, district=r.district).first()
        inv = db.query(func.sum(Investment.amount)).filter_by(state=r.state, district=r.district, category=r.category).scalar() or 0
        cutoff = datetime.utcnow() - timedelta(days=30)
        recent = db.query(func.count()).filter(CitizenSignal.state == r.state, CitizenSignal.district == r.district,
                                               CitizenSignal.category == r.category,
                                               CitizenSignal.created_at >= cutoff).scalar() or 0
        prior = max(0, r.n - recent)
        score, factors = priority_score(r.n / max_n, infra.gap_index if infra else 0.5,
                                        population_impact(demo.population if demo else 0, max_pop),
                                        investment_gap(inv, avg_inv), trend_score(recent, prior))
        out.append({"state": r.state, "district": r.district, "category": r.category,
                    "signals": r.n, "recent_30d": recent,
                    "latitude": round(r.lat, 4) if r.lat is not None else None,
                    "longitude": round(r.lon, 4) if r.lon is not None else None,
                    "population": demo.population if demo else 0,
                    "gap_index": infra.gap_index if infra else None,
                    "investment_inr": inv, "priority_score": score, "factors": factors})
    return sorted(out, key=lambda x: x["priority_score"], reverse=True)


@router.get("/dashboard/summary")
def summary(db: Session = Depends(get_db)):
    total = db.query(func.count(CitizenSignal.id)).scalar() or 0
    rows = _hotspot_rows(db)
    pop = db.query(func.sum(Demographic.population)).scalar() or 0
    return {"total_signals": total, "active_hotspots": len([r for r in rows if r["priority_score"] >= 0.5]),
            "high_priority_areas": len([r for r in rows if r["priority_score"] >= 0.7]),
            "population_covered": pop, "top_hotspots": rows[:10]}


@router.get("/hotspots")
def hotspots(db: Session = Depends(get_db)):
    return {"hotspots": _hotspot_rows(db)[:50]}


@router.get("/hotspots/{state}/{district}/{category}")
def hotspot_detail(state: str, district: str, category: str, db: Session = Depends(get_db)):
    rows = [r for r in _hotspot_rows(db) if r["state"] == state and r["district"] == district and r["category"] == category]
    if not rows:
        return {"error": "not found"}
    r = rows[0]
    evidence = {"signals": r["signals"], "recent_30d": r["recent_30d"], "population": r["population"],
                "gap_index": r["gap_index"], "investment_inr": r["investment_inr"], "factors": r["factors"]}
    rec = f"Prioritize {category} in {district}, {state}: {r['signals']} signals, gap {r['gap_index']}."
    return {"hotspot": r, "evidence": evidence, "recommendation": rec,
            "note": "Metrics deterministic; wording explanatory."}


@router.get("/civic-pulse")
def pulse(db: Session = Depends(get_db)):
    cutoff = datetime.utcnow() - timedelta(days=30)
    cats = db.query(CitizenSignal.category).distinct().all()
    out = []
    for (cat,) in cats:
        recent = db.query(func.count()).filter(CitizenSignal.category == cat, CitizenSignal.created_at >= cutoff).scalar() or 0
        prior = db.query(func.count()).filter(CitizenSignal.category == cat, CitizenSignal.created_at < cutoff).scalar() or 0
        growth = round(((recent - prior) / max(1, prior)) * 100, 1)
        out.append({"category": cat, "recent_30d": recent, "prior": prior, "growth_pct": growth})
    return {"pulse": sorted(out, key=lambda x: x["growth_pct"], reverse=True)}


@router.get("/recommendations")
def recommendations(db: Session = Depends(get_db)):
    rows = _hotspot_rows(db)[:10]
    return {"recommendations": [
        {"state": r["state"], "district": r["district"], "category": r["category"],
         "evidence": {"signals": r["signals"], "population": r["population"], "gap_index": r["gap_index"],
                      "investment_inr": r["investment_inr"], "factors": r["factors"]},
         "recommendation": f"Improve {r['category']} access in {r['district']}.",
         "priority_score": r["priority_score"]} for r in rows]}


@router.post("/simulate")
def simulate_ep(payload: SimulateIn, db: Session = Depends(get_db)):
    rows = _hotspot_rows(db)
    cat_rows = [r for r in rows if r["category"] == payload.sector.lower()]
    hi = [r for r in cat_rows if (r["gap_index"] or 0) >= 0.5]
    avg_pop = int(sum(r["population"] for r in hi) / max(1, len(hi))) if hi else 100000
    return simulate(payload.sector, payload.budget_cr, len(hi), avg_pop)


# --- Natural-language-policy-query backend (allowlisted; LLM never touches SQL) ---
CategoryQ = Literal["healthcare", "education", "roads", "water", "sanitation",
                    "electricity", "public_transport", "digital_infrastructure",
                    "housing", "environment", "other"]


@router.get("/policy-query")
def policy_query(
    db: Session = Depends(get_db),
    category: Optional[CategoryQ] = Query(default=None),
    min_gap: float = Query(default=0.0, ge=0.0, le=1.0),
    min_signals: int = Query(default=0, ge=0),
    max_investment_cr: Optional[float] = Query(default=None, gt=0),
):
    """E.g. high healthcare demand + low investment. All params allowlisted/validated."""
    rows = _hotspot_rows(db)
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
