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
    return {"success": True, "signal": sig}
