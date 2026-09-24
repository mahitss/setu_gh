"""Voice ingestion (Phase 10): audio -> Google Cloud Speech-to-Text -> transcript.

Graceful degradation: without credentials / library, returns 501 with a clear
message instead of breaking. The transcript feeds the normal text pipeline
(POST /citizen/signals), so classification stays identical for voice and text.

Audio is never stored in the relational DB. If GCS_BUCKET is set, the raw
clip is uploaded to Google Cloud Storage and audio_url returned; otherwise
dev mode returns audio_url=None and only the transcript is kept.
"""
import logging
import os
import uuid
from fastapi import APIRouter, File, Form, HTTPException, UploadFile

log = logging.getLogger("jansetu.voice")
router = APIRouter()

MAX_AUDIO_BYTES = 10 * 1024 * 1024

ALLOWED_MIME = {
    "audio/webm": "webm",
    "audio/ogg": "ogg",
    "audio/wav": "wav",
    "audio/x-wav": "wav",
    "audio/mpeg": "mp3",
    "audio/mp3": "mp3",
    "audio/mp4": "m4a",
    "audio/x-m4a": "m4a",
    "audio/flac": "flac",
}

# BCP-47 codes the API accepts (server-validated; extensible for more languages).
ALLOWED_LANGUAGE_CODES = {"hi-IN", "en-IN", "en-US", "bn-IN", "mr-IN", "kn-IN", "ta-IN", "te-IN"}


def _store_audio(audio: bytes, ext: str) -> str | None:
    bucket_name = os.getenv("GCS_BUCKET", "")
    if not bucket_name:
        return None  # dev mode: no persistent audio storage
    try:
        from google.cloud import storage
        client = storage.Client()
        blob = client.bucket(bucket_name).blob(f"voice/{uuid.uuid4().hex}.{ext}")
        blob.upload_from_string(audio, content_type=f"audio/{ext}")
        return f"gs://{bucket_name}/{blob.name}"
    except Exception as e:
        log.warning("GCS upload failed, continuing without audio_url: %s", e)
        return None


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
    mime = (file.content_type or "").split(";")[0].strip().lower()
    if mime not in ALLOWED_MIME:
        raise HTTPException(status_code=400,
                            detail=f"Unsupported audio format ({mime or 'unknown'}). Use webm, ogg, wav, mp3, m4a, or flac.")
    if language_code not in ALLOWED_LANGUAGE_CODES:
        raise HTTPException(status_code=400, detail=f"Unsupported language_code: {language_code}")
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
    audio_url = _store_audio(audio, ALLOWED_MIME[mime])
    return {"success": True, "transcript": transcript, "language_code": language_code,
            "audio_url": audio_url,
            "storage": "gcs" if audio_url else "dev-mode (transcript only)"}
