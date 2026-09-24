import os
from fastapi import APIRouter
from sqlalchemy import text
from ..database import SessionLocal

router = APIRouter()


@router.get("/health")
def health():
    try:
        db = SessionLocal()
        db.execute(text("SELECT 1"))
        db.close()
        database = "up"
    except Exception:
        database = "down"
    return {"status": "ok", "service": "jansetu-backend", "database": database,
            "ai_configured": bool(os.getenv("GEMINI_API_KEY", "")),
            "voice_configured": bool(os.getenv("GOOGLE_APPLICATION_CREDENTIALS", ""))}
