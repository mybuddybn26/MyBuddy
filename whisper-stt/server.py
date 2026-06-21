"""
Faster-Whisper Speech-to-Text Service
=====================================
Self-hosted STT microservice using Faster-Whisper (CTranslate2 backend).
Accepts audio uploads via multipart/form-data and returns JSON transcriptions.

Usage:
    python server.py
    uvicorn server:app --host 127.0.0.1 --port 8002

Environment variables:
    WHISPER_MODEL      - Model size: base, small, medium, large-v3 (default: base)
    WHISPER_DEVICE     - cpu or cuda (default: cpu)
    WHISPER_COMPUTE_TYPE - float32, float16, int8 (default: float32)
"""

import io
import os
import tempfile
import time
import uuid
from pathlib import Path
from typing import Optional

from fastapi import FastAPI, File, HTTPException, Query, UploadFile
from fastapi.responses import JSONResponse
from pydantic import BaseModel

# ─────────────────────────────────────────────────────────────────────
# Configuration
# ─────────────────────────────────────────────────────────────────────

MODEL_SIZE = os.getenv("WHISPER_MODEL", "base")
DEVICE = os.getenv("WHISPER_DEVICE", "cpu")
COMPUTE_TYPE = os.getenv("WHISPER_COMPUTE_TYPE", "float32")
MAX_FILE_SIZE_MB = int(os.getenv("WHISPER_MAX_FILE_SIZE_MB", "25"))

SUPPORTED_MODELS = {"tiny", "base", "small", "medium", "large-v3"}
SUPPORTED_FORMATS = {
    "audio/m4a", "audio/mp4", "audio/mpeg", "audio/mp3",
    "audio/wav", "audio/x-wav", "audio/webm", "audio/ogg",
    "audio/flac", "audio/aac",
}

if MODEL_SIZE not in SUPPORTED_MODELS:
    raise ValueError(
        f"Unsupported WHISPER_MODEL '{MODEL_SIZE}'. "
        f"Choose from: {', '.join(sorted(SUPPORTED_MODELS))}"
    )

# ─────────────────────────────────────────────────────────────────────
# Lazy model loader (loaded once at startup, kept warm in memory)
# ─────────────────────────────────────────────────────────────────────

_model = None


def get_model():
    """Return the loaded Faster-Whisper model. Downloads on first call."""
    global _model
    if _model is not None:
        return _model

    from faster_whisper import WhisperModel

    print(f"[whisper-stt] Loading model '{MODEL_SIZE}' on {DEVICE} ({COMPUTE_TYPE})...")
    start = time.time()
    _model = WhisperModel(
        MODEL_SIZE,
        device=DEVICE,
        compute_type=COMPUTE_TYPE,
    )
    elapsed = time.time() - start
    print(f"[whisper-stt] Model loaded in {elapsed:.1f}s")
    return _model


# ─────────────────────────────────────────────────────────────────────
# App
# ─────────────────────────────────────────────────────────────────────

app = FastAPI(
    title="Faster-Whisper STT",
    version="1.0.0",
    description="Self-hosted speech-to-text using Faster-Whisper (CTranslate2)",
)


class TranscriptionResponse(BaseModel):
    text: str
    language: str
    duration_seconds: float
    model: str


@app.on_event("startup")
async def startup():
    """Preload the model so first request is fast."""
    get_model()


# ─────────────────────────────────────────────────────────────────────
# Routes
# ─────────────────────────────────────────────────────────────────────


@app.get("/health")
async def health():
    """Health check — confirms the service is alive and model is loaded."""
    return {
        "status": "ok",
        "model": MODEL_SIZE,
        "device": DEVICE,
        "compute_type": COMPUTE_TYPE,
    }


@app.get("/models")
async def list_models():
    """Return available model sizes."""
    return {"available": sorted(SUPPORTED_MODELS), "current": MODEL_SIZE}


@app.post("/transcribe", response_model=TranscriptionResponse)
async def transcribe(
    file: UploadFile = File(..., description="Audio file to transcribe"),
    language: Optional[str] = Query(
        None,
        description="Language code hint (e.g. en, ms, zh). Leave empty for auto-detect.",
    ),
    task: str = Query(
        "transcribe",
        description="Task: 'transcribe' or 'translate' (to English).",
    ),
):
    """
    Transcribe an uploaded audio file.

    Accepts: m4a, mp3, mp4, wav, webm, ogg, flac, aac.

    Returns:
        { text, language, duration_seconds, model }
    """
    # ── Validate ──
    if not file.filename:
        raise HTTPException(status_code=400, detail="No filename provided")

    content_type = file.content_type or "audio/wav"
    if content_type not in SUPPORTED_FORMATS:
        # Be lenient — some clients send generic types
        print(f"[whisper-stt] Unrecognized content type: {content_type}, proceeding anyway")

    if task not in ("transcribe", "translate"):
        raise HTTPException(
            status_code=400,
            detail=f"Invalid task '{task}'. Use 'transcribe' or 'translate'.",
        )

    # ── Read file ──
    contents = await file.read()
    file_size_mb = len(contents) / (1024 * 1024)

    if file_size_mb > MAX_FILE_SIZE_MB:
        raise HTTPException(
            status_code=413,
            detail=f"File too large ({file_size_mb:.1f} MB). Max: {MAX_FILE_SIZE_MB} MB.",
        )

    if len(contents) < 100:
        raise HTTPException(
            status_code=400,
            detail="Audio file is too short. Must be at least 100 bytes.",
        )

    print(
        f"[whisper-stt] Transcribing '{file.filename}' "
        f"({file_size_mb:.1f} MB, type={content_type})"
    )

    # ── Write to temp file (Faster-Whisper needs a file path) ──
    suffix = Path(file.filename).suffix or ".wav"
    tmp_path = Path(tempfile.gettempdir()) / f"whisper_{uuid.uuid4().hex}{suffix}"

    try:
        tmp_path.write_bytes(contents)

        # ── Transcribe ──
        model = get_model()
        start = time.time()

        segments, info = model.transcribe(
            str(tmp_path),
            language=language,
            task=task,
            beam_size=5,
            vad_filter=True,
        )

        # Collect all segment text
        text_parts = []
        for segment in segments:
            text_parts.append(segment.text.strip())

        full_text = " ".join(text_parts).strip()
        elapsed = time.time() - start

        print(
            f"[whisper-stt] Done in {elapsed:.1f}s "
            f"(lang={info.language}, prob={info.language_probability:.2f}, "
            f"text_len={len(full_text)})"
        )

        if not full_text:
            raise HTTPException(
                status_code=422,
                detail="No speech detected in the audio file.",
            )

        return TranscriptionResponse(
            text=full_text,
            language=info.language,
            duration_seconds=round(info.duration, 2),
            model=MODEL_SIZE,
        )

    except HTTPException:
        raise
    except Exception as exc:
        print(f"[whisper-stt] Transcription failed: {exc}")
        raise HTTPException(
            status_code=500,
            detail=f"Transcription failed: {str(exc)}",
        )
    finally:
        # Clean up temp file
        try:
            tmp_path.unlink(missing_ok=True)
        except Exception:
            pass


@app.post("/transcribe/batch")
async def transcribe_batch(
    files: list[UploadFile] = File(..., description="Multiple audio files"),
    language: Optional[str] = Query(None),
):
    """
    Batch transcribe multiple audio files.

    Returns:
        { results: [{ filename, text, language, duration_seconds }] }
    """
    results = []
    errors = []

    for f in files:
        try:
            # Reuse the single-file transcribe logic inline
            contents = await f.read()
            suffix = Path(f.filename or "audio.wav").suffix or ".wav"
            tmp_path = Path(tempfile.gettempdir()) / f"whisper_batch_{uuid.uuid4().hex}{suffix}"
            tmp_path.write_bytes(contents)

            model = get_model()
            segments, info = model.transcribe(str(tmp_path), language=language, beam_size=5)

            text_parts = [seg.text.strip() for seg in segments]
            full_text = " ".join(text_parts).strip()

            results.append({
                "filename": f.filename,
                "text": full_text,
                "language": info.language,
                "duration_seconds": round(info.duration, 2),
            })

            tmp_path.unlink(missing_ok=True)
        except Exception as exc:
            errors.append({"filename": f.filename, "error": str(exc)})

    return JSONResponse({"results": results, "errors": errors})


# ─────────────────────────────────────────────────────────────────────
# Entry point
# ─────────────────────────────────────────────────────────────────────

if __name__ == "__main__":
    import uvicorn

    port = int(os.getenv("WHISPER_PORT", "8002"))
    print(f"[whisper-stt] Starting on http://127.0.0.1:{port}")
    print(f"[whisper-stt] Model: {MODEL_SIZE}, Device: {DEVICE}, Compute: {COMPUTE_TYPE}")
    uvicorn.run(app, host="127.0.0.1", port=port)
