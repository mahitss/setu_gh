"""Citizen signal ingestion (Phase 3/5). Gemini extraction (Phase 4)."""
import logging
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from sqlalchemy.exc import SQLAlchemyError
from ..database import get_db
from ..schemas import SignalIn, SignalResponse
from ..models import CitizenSignal
from ..services.gemini import extract_signal

log = logging.getLogger("jansetu.signals")
router = APIRouter()


@router.post("/citizen/signals", response_model=SignalResponse)
def create_signal(payload: SignalIn, db: Session = Depends(get_db)):
    text = payload.text or ""
    try:
        extracted = extract_signal(
            text, state=payload.state, district=payload.district,
            locality=payload.locality,
        )
    except Exception:
        log.exception("Extraction failed; using minimal record")
        extracted = {"category": "other", "sub_category": "other_access",
                     "severity": "medium", "summary": text[:160],
                     "language": "en", "confidence": 0.0, "extractor": "error_fallback"}
    sig = CitizenSignal(
        raw_text=text,
        language=payload.resolved_language() or extracted.get("language", "en"),
        category=extracted["category"],
        sub_category=extracted.get("sub_category"),
        severity=extracted.get("severity", "medium"),
        summary=extracted.get("summary"),
        state=payload.state or extracted.get("state") or "Uttar Pradesh",
        district=payload.district or extracted.get("district") or "Lucknow",
        locality=payload.locality,
        latitude=payload.latitude,
        longitude=payload.longitude,
        ai_confidence=extracted.get("confidence", 0.0),
    )
    try:
        db.add(sig)
        db.commit()
        db.refresh(sig)
    except SQLAlchemyError:
        db.rollback()
        log.exception("Database persistence failed")
        raise HTTPException(status_code=500, detail="Could not save your request. Please try again.")
    sig.extractor = extracted.get("extractor", "unknown")  # transient, never persisted
    return {"success": True, "signal": sig}


@router.get("/signals/recent")
def recent_signals(limit: int = 10, db: Session = Depends(get_db)):
    """Latest citizen signals for the dashboard. Aggregates only — no bulk export."""
    if limit < 1 or limit > 50:
        raise HTTPException(status_code=422, detail="limit must be between 1 and 50")
    rows = (db.query(CitizenSignal).order_by(CitizenSignal.id.desc()).limit(limit).all())
    return {"signals": [
        {"id": r.id, "category": r.category, "severity": r.severity,
         "summary": r.summary, "language": r.language, "state": r.state,
         "district": r.district, "created_at": r.created_at.isoformat() if r.created_at else None}
        for r in rows]}
