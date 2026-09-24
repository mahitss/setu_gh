"""Citizen signal ingestion (Phase 3/5). Gemini extraction wired in Phase 4 (fallback active)."""
from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from ..database import get_db
from ..schemas import SignalIn, SignalOut
from ..models import CitizenSignal
from ..services.gemini import extract_signal

router = APIRouter()


@router.post("/citizen/signals", response_model=SignalOut)
def create_signal(payload: SignalIn, db: Session = Depends(get_db)):
    extracted = extract_signal(payload.raw_text)
    sig = CitizenSignal(
        raw_text=payload.raw_text,
        language=payload.language or extracted.get("language", "en"),
        category=extracted["category"],
        sub_category=extracted.get("sub_category"),
        severity=extracted.get("severity", "medium"),
        summary=extracted.get("summary"),
        state=payload.state or "Uttar Pradesh",
        district=payload.district or "Lucknow",
        locality=payload.locality,
        latitude=payload.latitude,
        longitude=payload.longitude,
        ai_confidence=extracted.get("confidence", 0.0),
    )
    db.add(sig)
    db.commit()
    db.refresh(sig)
    return sig
