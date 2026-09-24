"""Deterministic hotspot engine — prototype prioritization model.

NOT scientifically validated. Do not present scores as official statistics.
Model: group citizen signals by (state, district, category), then combine
normalized demand + infrastructure gap + population impact + trend, adjusted
for existing investment (see services/engine.py weights). Every factor is
returned alongside the score so the UI can show its evidence.
"""
import base64
from datetime import datetime, timedelta
from sqlalchemy import func
from sqlalchemy.orm import Session
from ..models import CitizenSignal, Demographic, Infrastructure, Investment
from .engine import priority_score, population_impact, investment_gap, trend_score

MODEL_NOTE = "Prototype prioritization model — deterministic, not scientifically validated."


def hotspot_id(state: str, district: str, category: str) -> str:
    raw = f"{state}\n{district}\n{category}".encode("utf-8")
    return base64.urlsafe_b64encode(raw).decode("ascii")


def parse_hotspot_id(hid: str) -> tuple[str, str, str] | None:
    try:
        padded = hid + "=" * (-len(hid) % 4)
        parts = base64.urlsafe_b64decode(padded).decode("utf-8").split("\n")
        if len(parts) != 3 or not all(parts):
            return None
        return parts[0], parts[1], parts[2]
    except Exception:
        return None


def priority_level(score: float) -> str:
    if score >= 0.85:
        return "critical"
    if score >= 0.7:
        return "high"
    if score >= 0.5:
        return "medium"
    if score >= 0.3:
        return "low"
    return "minimal"


def trend_percent(recent: int, previous: int) -> float | None:
    """None when there is no previous-period history (insufficient data)."""
    if previous <= 0:
        return None
    return round(((recent - previous) / previous) * 100, 1)


def hotspot_rows(db: Session) -> list[dict]:
    signals = (db.query(CitizenSignal.state, CitizenSignal.district, CitizenSignal.category,
                        func.count().label("n"),
                        func.avg(CitizenSignal.latitude).label("lat"),
                        func.avg(CitizenSignal.longitude).label("lon"))
               .group_by(CitizenSignal.state, CitizenSignal.district, CitizenSignal.category).all())
    max_n = max([r.n for r in signals], default=1)
    max_pop = db.query(func.max(Demographic.population)).scalar() or 1
    avg_inv = db.query(func.avg(Investment.amount)).scalar() or 1
    cutoff = datetime.utcnow() - timedelta(days=30)
    out = []
    for r in signals:
        infra = db.query(Infrastructure).filter_by(state=r.state, district=r.district, category=r.category).first()
        demo = db.query(Demographic).filter_by(state=r.state, district=r.district).first()
        inv = db.query(func.sum(Investment.amount)).filter_by(state=r.state, district=r.district, category=r.category).scalar() or 0
        recent = db.query(func.count()).filter(CitizenSignal.state == r.state, CitizenSignal.district == r.district,
                                               CitizenSignal.category == r.category,
                                               CitizenSignal.created_at >= cutoff).scalar() or 0
        prior = max(0, r.n - recent)
        demand_index = round(r.n / max_n, 4)
        score, factors = priority_score(demand_index, infra.gap_index if infra else 0.5,
                                        population_impact(demo.population if demo else 0, max_pop),
                                        investment_gap(inv, avg_inv), trend_score(recent, prior))
        out.append({"id": hotspot_id(r.state, r.district, r.category),
                    "state": r.state, "district": r.district, "category": r.category,
                    "signals": r.n, "signal_count": r.n, "recent_30d": recent,
                    "demand_index": demand_index,
                    "demand_trend": trend_percent(recent, prior),
                    "trend_pct": trend_percent(recent, prior),
                    "priority_level": priority_level(score),
                    "latitude": round(r.lat, 4) if r.lat is not None else None,
                    "longitude": round(r.lon, 4) if r.lon is not None else None,
                    "population": demo.population if demo else 0,
                    "population_affected": demo.population if demo else 0,
                    "gap_index": infra.gap_index if infra else None,
                    "infrastructure_gap": infra.gap_index if infra else None,
                    "investment_inr": inv, "investment": inv,
                    "priority_score": score, "factors": factors})
    return sorted(out, key=lambda x: x["priority_score"], reverse=True)


def pulse_rows(db: Session) -> list[dict]:
    """Current = last 30 days, previous = 30-60 days ago. Timestamp-driven, never hard-coded."""
    now = datetime.utcnow()
    cur_start = now - timedelta(days=30)
    prev_start = now - timedelta(days=60)
    out = []
    for (cat,) in db.query(CitizenSignal.category).distinct().all():
        recent = db.query(func.count()).filter(CitizenSignal.category == cat,
                                               CitizenSignal.created_at >= cur_start).scalar() or 0
        previous = db.query(func.count()).filter(CitizenSignal.category == cat,
                                                 CitizenSignal.created_at >= prev_start,
                                                 CitizenSignal.created_at < cur_start).scalar() or 0
        tp = trend_percent(recent, previous)
        out.append({"category": cat, "current_count": recent, "previous_count": previous,
                    "trend_percent": tp, "status": "ok" if tp is not None else "insufficient_data",
                    "recent_30d": recent, "prior": previous, "growth_pct": tp})
    return sorted(out, key=lambda x: (x["trend_percent"] is not None, x["trend_percent"] or 0), reverse=True)


def top_categories(db: Session, limit: int = 5) -> list[dict]:
    counts = (db.query(CitizenSignal.category, func.count().label("n"))
              .group_by(CitizenSignal.category).order_by(func.count().desc()).limit(limit).all())
    trends = {p["category"]: p["trend_percent"] for p in pulse_rows(db)}
    return [{"category": c, "count": n, "trend_percent": trends.get(c)} for c, n in counts]
