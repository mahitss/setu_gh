from fastapi import APIRouter
router = APIRouter()


@router.post("/citizen/voice")
def voice_stub():
    return {"status": "pending", "note": "Phase 10: Speech-to-Text wired here."}
