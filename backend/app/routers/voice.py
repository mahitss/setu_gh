"""Voice ingestion (Phase 10): audio -> Google Cloud Speech-to-Text -> transcript.

Graceful degradation: without credentials / library, returns 501 with a clear
message instead of breaking. The transcript feeds the normal text pipeline
(POST /citizen/signals), so classification stays identical for voice and text.
"""
import logging
from fastapi import APIRouter, File, Form, HTTPException, UploadFile

log = logging.getLogger("jansetu.voice")
router = APIRouter()

MAX_AUDIO_BYTES = 10 * 1024 * 1024


def _transcribe(audio: bytes, language_code: str) -> str:
    try:
        from google.cloud import speech
    except ImportError as e:
        raise RuntimeError("speech library not installed") from e
    client = speech.SpeechClient()  # raises if no credentials
    resp = client.recognize(
        config=speech.RecognitionConfig(
            language_code=language_code,
            enable_automatic_punctuation=True,
        ),
        audio=speech.RecognitionAudio(content=audio),
    )
    transcript = " ".join(r.alternatives[0].transcript for r in resp.results if r.alternatives).strip()
    if not transcript:
        raise ValueError("no speech recognized")
    return transcript


@router.post("/citizen/voice")
async def voice_signal(file: UploadFile = File(...), language_code: str = Form(default="hi-IN")):
    audio = await file.read()
    if not audio:
        raise HTTPException(status_code=400, detail="Empty audio file. Please record again.")
    if len(audio) > MAX_AUDIO_BYTES:
        raise HTTPException(status_code=400, detail="Audio too large (max 10 MB).")
    try:
        transcript = _transcribe(audio, language_code)
    except ValueError as e:
        raise HTTPException(status_code=422, detail=f"Could not understand the audio: {e}")
    except Exception as e:
        log.warning("Speech-to-Text unavailable: %s", e)
        raise HTTPException(
            status_code=501,
            detail="Voice transcription is not configured on this server. Please type your request instead.")
    return {"success": True, "transcript": transcript, "language_code": language_code}
