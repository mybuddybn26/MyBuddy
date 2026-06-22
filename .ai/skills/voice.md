# Voice

## Pipeline

```
Microphone → VoiceRecorder (VAD) → AssemblyAI (STT) → DeepSeek (AI) → SpeechFormatter → Deepgram (TTS) → VoicePlayer
```

## Services

**Frontend** (`vitejs/src/voice/` — pure TypeScript, no React):
- `voiceState.ts` — State machine: idle → connecting → listening → thinking → speaking → listening (loop)
- `voiceRecorder.ts` — Mic capture with real AudioContext VAD, silence detection at 1.5s
- `voicePlayer.ts` — Audio playback with cleanup

**UI** (`vitejs/src/components/chat/`):
- `VoiceCallModal.tsx` — Full-screen continuous conversation
- `SpeechControls.tsx` — Per-message Read Aloud (play/pause/stop)
- `MessageActions.tsx` — Action row (includes Read button)

**Backend** (`fastify/src/services/tts/`):
- `ttsRoutes.ts` — `POST /api/voice/tts/speak`
- `deepgramService.ts` — Deepgram API client
- `speechFormatter.ts` — Text cleaning for speech
- `audioCache.ts` — In-memory TTS cache (50 entries)

## Input Bar
- **Mic** — One-shot STT: record → transcribe → paste into input (does NOT auto-send)
- **Phone** — Opens VoiceCallModal for continuous conversation

## Key Rules

- Never bypass the Voice Session Manager pattern.
- Always call `audioCtx.resume()` after `new AudioContext()`.
- Dispose recorder and player before creating new instances.
- Cache TTS audio during session — re-fetching wastes API calls.
- Stop playback immediately on interruption (barge-in).

## Common Mistakes

- Creating AudioContext without resuming it (produces zeros).
- Revoking cached blob URLs (breaks replay).
- Duplicate stream instances causing resource leaks.
- Silent failure on TTS errors — always surface the error.

## Verification

- [ ] AudioContext is resumed after creation
- [ ] Recorder and player are properly disposed
- [ ] TTS cache is used for repeated text
- [ ] Barge-in stops playback immediately
- [ ] Errors surface via toast or inline message
