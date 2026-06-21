from fastapi import FastAPI, HTTPException
from fastapi.responses import Response
from pydantic import BaseModel
import io
import base64

app = FastAPI(title="Kokoro TTS", version="1.0.0")

SUPPORTED_LANGS = {
    "en": "a",
    "mandarin": "z",
    "ja": "j",
    "ko": "k",
    "fr": "f",
    "es": "e",
    "pt": "p",
    "it": "i",
    "hi": "h",
}

DEFAULT_VOICES = {
    "a": "af_heart",
    "z": "zf_xiaobei",
    "j": "jf_alpha",
    "k": "kf_heart",
    "f": "ff_siwis",
    "e": "ef_dora",
    "p": "pf_dora",
    "i": "if_sara",
    "h": "hf_alpha",
}


class TTSRequest(BaseModel):
    text: str
    lang_code: str = "a"
    voice: str = ""


@app.post("/tts")
async def tts(req: TTSRequest):
    from kokoro import KPipeline

    lang = req.lang_code or "a"
    if lang not in DEFAULT_VOICES:
        lang = "a"

    voice = req.voice or DEFAULT_VOICES[lang]
    pipeline = KPipeline(lang_code=lang)

    generator = pipeline(req.text, voice=voice)
    audio_segments = []
    for _gs, _ps, audio in generator:
        audio_segments.append(audio)

    if not audio_segments:
        raise HTTPException(status_code=500, detail="TTS generation produced no audio")

    import numpy as np
    import soundfile as sf

    combined = np.concatenate(audio_segments)
    buf = io.BytesIO()
    sf.write(buf, combined, 24000, format="WAV")
    buf.seek(0)

    return Response(content=buf.read(), media_type="audio/wav")


@app.get("/health")
async def health():
    return {"status": "ok", "model": "Kokoro-82M"}


@app.get("/voices")
async def voices():
    result = {}
    for code, name in DEFAULT_VOICES.items():
        result[code] = {"default_voice": name}
    return result


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="127.0.0.1", port=8001)
