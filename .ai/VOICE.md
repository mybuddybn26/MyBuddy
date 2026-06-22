# VOICE.md — Buddy Voice System Specification

> **Permanent engineering specification for Buddy's voice system.**
> Every voice feature must follow this document.
> The standard is real-time conversational AI similar to ChatGPT Voice.

---

## 1. Voice Philosophy

Buddy Voice should feel like a **natural phone conversation**, not a push-button dictation tool.

- **Natural** — the user speaks, Buddy listens, Buddy responds. No manual steps.
- **Fast** — target under 2 seconds from end of speech to beginning of response.
- **Conversational** — continuous loop, not one-shot interactions.
- **Human-like** — Buddy's spoken responses sound warm and natural, not robotic.
- **Reliable** — graceful error recovery, never silently fails.
- **Interruption-friendly** — barge-in works instantly, like talking to a person.

**Anti-patterns (what voice should NOT feel like):**
- Press button → wait → receive audio file.
- Disconnected pipeline where mic and speaker can't coexist.
- Fake waveforms that don't represent real audio.

---

## 2. Voice Modes

### Mic Button (One-Shot STT)

- **Purpose**: Convert speech to text, paste into input.
- **Flow**: Press Mic → Record → STT → Insert into chat input → User decides to send.
- **Rules**: Do NOT auto-send. Do NOT trigger TTS. Behaves like ChatGPT's microphone button.
- **UI**: Red recording bar with waveform, timer, cancel (✕) and confirm (✓) buttons.

### PhoneCall Button (Continuous Voice Conversation)

- **Purpose**: Live two-way voice conversation.
- **Flow**: Press PhoneCall → Enter VoiceCallModal → Continuous loop (listen → transcribe → think → speak → listen).
- **Rules**: No manual send. Automatic listening. Automatic responses. Barge-in supported.

---

## 3. Voice Session Manager

The Voice Session Manager is the central orchestrator. **All voice features must go through it.**

```
                    ┌──────────────────────┐
                    │  Voice Session Manager │
                    │  (VoiceCallModal.tsx)  │
                    └──┬───────┬───────┬────┘
                       │       │       │
              ┌────────▼──┐ ┌──▼────┐ ┌▼────────┐
              │ Recorder  │ │ AI    │ │ Player  │
              │ (mic+VAD) │ │ (API) │ │ (audio) │
              └───────────┘ └───────┘ └─────────┘
```

**Never bypass the orchestrator.** Components must not directly call AssemblyAI, DeepSeek, or TTS APIs.

### Responsibilities
- Session lifecycle (start → conversation loop → end).
- Audio routing (mic → STT, AI → TTS → speaker).
- State management (idle, listening, thinking, speaking, etc.).
- Interruption handling (barge-in).
- Resource cleanup (release mic, stop playback, dispose timers).
- Error recovery (reconnect, retry, graceful degradation).

### Implementation
- `VoiceCallModal.tsx` orchestrates the session using `VoiceRecorder` and `VoicePlayer`.
- `VoiceRecorder` handles mic capture, AudioContext, VAD.
- `VoicePlayer` handles audio playback with proper cleanup.

---

## 4. Voice State Machine

| State | When | Allowed Transitions |
|---|---|---|
| `idle` | No call in progress | → `connecting` |
| `connecting` | Initializing services, checking mic | → `listening`, → `disconnected` |
| `listening` | Mic active, waiting for speech | → `thinking` (speech detected), → `disconnected` |
| `thinking` | Sending to DeepSeek, awaiting response | → `speaking`, → `disconnected` |
| `speaking` | Playing TTS audio | → `listening` (playback done), → `interrupted` (barge-in) |
| `interrupted` | User spoke during playback | → `listening` (auto-resume after 200ms) |
| `disconnected` | Error or network loss | → `connecting` (reconnect), → `idle` (end call) |
| `ending` | User pressed End Call | → `idle` (cleanup complete) |

**Recovery**: On error, transition to `disconnected` with descriptive message. Auto-reconnect where possible. Always offer manual reconnect.

---

## 5. Complete Voice Pipeline

```
User Speech
    ↓
Microphone Capture (getUserMedia, echo cancellation, noise suppression, AGC)
    ↓
Audio Processing (AudioContext + AnalyserNode for real VAD)
    ↓
Voice Activity Detection (silence threshold > 10, 1.5s timeout)
    ↓
AssemblyAI Streaming STT (HTTP upload → transcript poll)
    ↓
Transcript (displayed as "You" in modal)
    ↓
Conversation Context (last 12 messages from conversationHistoryRef)
    ↓
Buddy Prompt System (buildFullSystemPrompt with persona)
    ↓
DeepSeek V4 Flash (streaming via SSE, aiService.ts)
    ↓
Streaming Response (collected, stripped of code blocks)
    ↓
Speech Formatter (speechFormatter.ts: remove markdown, code, URLs)
    ↓
Deepgram TTS (POST /api/voice/tts/speak → MP3 audio)
    ↓
Audio Playback (VoicePlayer: play → onended → cleanup)
    ↓
Return to Listening (startRecognizing → new MediaRecorder)
```

**Never skip stages.** Each stage has error handling that surfaces descriptive messages.

---

## 6. Microphone Rules

```typescript
const stream = await navigator.mediaDevices.getUserMedia({
  audio: {
    echoCancellation: true,
    noiseSuppression: true,
    autoGainControl: true,
  },
});
```

- **Request permission** — handle both grant and denial gracefully.
- **Denial**: Show "Microphone access denied. Please allow microphone access to use voice input."
- **Devices**: Support built-in mic, Bluetooth headsets, wired headsets.
- **Noise suppression** and **echo cancellation** enabled by default.
- **AGC** (automatic gain control) enabled.
- **Release**: Stop all tracks when recording ends (`stream.getTracks().forEach(t => t.stop())`).

---

## 7. Waveform Rules

Waveforms must represent **real audio**, not fake animations.

### User Speaking (VoiceRecorder)
```typescript
const data = new Uint8Array(analyser.frequencyBinCount);
analyser.getByteFrequencyData(data);
const level = Math.min(100, Math.max(0, avg));
```
- 5 animated bars, green during listening.
- Height: 4-40px, driven by real `level` value.
- Smooth via `requestAnimationFrame`.

### Buddy Speaking (VoiceCallModal)
- Blue animated bars.
- Driven by a constant level during playback (TTS doesn't expose real-time amplitude).

### Idle
- Bars at minimum height (4px), nearly flat.

**Forbidden**: `Math.sin(Date.now() / 200 + i) * 8` used as the SOLE animation source. Sinusoidal variation is acceptable layered on top of real levels for visual polish, but the base amplitude must come from `getByteFrequencyData`.

---

## 8. Speech-to-Text Rules

**Provider**: AssemblyAI

- **Endpoint**: `POST https://api.assemblyai.com/v2/upload` → `POST /v2/transcript` → poll `GET /v2/transcript/{id}`.
- **Backend**: `fastify/src/modules/voice/routes.ts` — `POST /api/voice/transcribe`.
- **Timeout**: Polls up to 30 attempts (1s intervals, 30s max).
- **Fallback**: Groq Whisper (if `GROQ_API_KEY` is configured).
- **Error handling**: Returns `{ detail: "Voice transcription failed" }` with status 502.

### Requirements
- [x] Streaming transcription (current: batch upload → poll — adequate for VAD-based flow).
- [ ] Real-time streaming WebSocket transcription (future optimization).
- [x] Error reporting with descriptive messages.
- [x] Reconnect handling (frontend catches errors, offers reconnect).

---

## 9. AI Response Rules

**Provider**: DeepSeek V4 Flash (primary), Ollama (fallback).

- **Endpoint**: `POST https://api.deepseek.com/v1/chat/completions` (streaming).
- **Backend**: `fastify/src/modules/chat/aiService.ts` — `streamChat()`.
- **Prompt**: Always includes `buildFullSystemPrompt({ persona })`.
- **Streaming**: SSE — `data: { type: "text", content: "..." }\n\n`.

### Requirements
- [x] Buddy system prompt injected automatically.
- [x] Conversation history included (last 12 messages).
- [x] Streaming response.
- [x] Provider abstraction (aiService.ts handles fallback chain).

---

## 10. Speech Formatting

Before TTS, run `speechFormatter.ts`:

- Remove code blocks (fenced + inline).
- Remove markdown formatting (`**bold**`, `*italic*`, headings, links).
- Convert list markers to pauses.
- Replace URLs with "I've included the link in the chat."
- Expand abbreviations (e.g. → for example).
- Remove emojis and special Unicode.
- Normalize whitespace and punctuation.

**Location**: `fastify/src/services/tts/speechFormatter.ts`.

---

## 11. Text-to-Speech Rules

**Current Provider**: Deepgram (configured and working).
**Target Provider**: ElevenLabs (API key configured, awaiting credits).

### Deepgram (Current)
- **Endpoint**: `POST https://api.deepgram.com/v1/speak?model=aura-asteria-en`.
- **Backend**: `fastify/src/services/tts/deepgramService.ts` → `POST /api/voice/tts/speak`.
- **Caching**: In-memory cache (50 entries, LRU eviction) via `audioCache.ts`.
- **Errors**: 401 → "Invalid API key", 402 → "No credits remaining", 429 → "Rate limited".

### ElevenLabs (Target)
- **Endpoint**: `POST https://api.elevenlabs.io/v1/text-to-speech/{voice_id}`.
- **Voice**: Rachel (`21m00Tcm4TlvDq8ikWAM`) — warm, natural.
- **Model**: `eleven_multilingual_v2`.
- **Note**: API key exists in config but account lacks credits. Switch to ElevenLabs when credits are added.

### Requirements
- [x] Streaming audio (current: full buffer — adequate for short responses).
- [ ] True streaming playback (future: begin playback before full audio received).
- [x] Cancellation support (AbortController).
- [x] Playback control (play, pause, stop via VoicePlayer).
- [x] Session caching (avoid duplicate API calls for identical text).

---

## 12. Interruptions (Barge-In)

```
User speaks while Buddy is speaking
    ↓
Immediately:
1. Abort TTS request (AbortController)
2. Stop audio playback (VoicePlayer.stop())
3. Set state to "interrupted"
4. After 200ms delay, start listening again
```

- **UI**: "Tap to interrupt" button visible during speaking state.
- **Implementation**: `VoiceCallModal.tsx` → `interrupt()` callback.
- **Behavior**: Similar to ChatGPT Voice — instant, responsive.

---

## 13. Latency Rules

**Target**: Voice response begins **under 2 seconds** from end of user speech.

**Optimizations**:
- Silence detection at 1.5s (configurable).
- AssemblyAI processes short audio clips quickly (no long silences).
- DeepSeek streaming begins immediately.
- TTS cached for repeated text.
- Audio playback begins as soon as blob is received.

**Current bottlenecks** (documented for future work):
- AssemblyAI uses HTTP upload + poll (not WebSocket streaming).
- TTS returns full audio buffer (not chunked streaming).
- DeepSeek streams text, but TTS waits for full response.

---

## 14. Voice UI Rules

Follow `.ai/DESIGN.md` for all visual decisions.

### Required Elements
- Buddy avatar (centered, primary-colored circle with robot emoji).
- Real waveform (5 animated bars, green=listening, blue=speaking).
- Status indicator (green dot + state label in header).
- Live transcripts (user in white card, Buddy in blue-tinted card).
- Mute button (toggles audio track).
- End call button (red, PhoneOff icon).
- Duration timer (MM:SS in header).
- Interrupt button (when speaking).

### Icons (Lucide only)
| Purpose | Icon |
|---|---|
| Start call | `PhoneCall` |
| End call | `PhoneOff` |
| Mic active | `Mic` |
| Mic muted | `MicOff` |
| Volume | `Volume2` |
| Settings | `Settings` |

---

## 15. Voice Error Handling

| Failure | Behavior |
|---|---|
| Microphone unavailable | "Microphone access denied." → idle state |
| AssemblyAI failed | "Transcription failed." → disconnected state + reconnect |
| DeepSeek timeout | "AI is unavailable." → disconnected state + reconnect |
| TTS failed | "Speech unavailable. Continuing in chat." → skip TTS, continue loop |
| Network offline | Auto-detect → disconnected state |

- **Never silently fail** — every error surfaces via console log (`[VoiceRecorder]`, `[VoicePlayer]`, `[VoiceCall]`) and user-visible message.
- Log prefix convention: `[VoiceRecorder]`, `[VoicePlayer]`, `[VoiceCall]`.

---

## 16. Privacy Rules

- **Do not store** microphone recordings unless user explicitly enables it.
- **Delete temporary audio** after processing (blob URLs are revoked, stream tracks stopped).
- **Protect transcripts** — not logged to persistent storage beyond conversation history (same as text chat).
- **API keys** never exposed to frontend (all external API calls go through backend).

---

## 17. Debugging (Development)

Console log prefixes for debugging:
```
[VoiceRecorder]   ← Mic capture, VAD, silence detection
[VoicePlayer]     ← Audio playback, stop
[VoiceCall]       ← State transitions, transcription, AI calls
[Voice]           ← One-shot mic in Chat.tsx
```

### Ideal Future Debug Panel
- Current state
- Microphone status (connected/disconnected)
- Audio level (real-time dB)
- AssemblyAI status (connected/transcribing/error)
- DeepSeek status (streaming/complete/error)
- TTS status (generating/playing/cached/error)
- Latency (last response time)
- Reconnect attempts

---

## 18. Voice Verification Checklist

Before claiming voice is complete:

- [x] Microphone captures real audio (AudioContext resumed, analyser working).
- [x] Waveform reacts to real microphone amplitude.
- [x] AssemblyAI receives audio and returns transcripts.
- [x] Transcript displayed in UI.
- [x] DeepSeek receives transcript and generates response.
- [x] Buddy responds with streaming text.
- [x] Speech Formatter runs before TTS.
- [x] TTS generates audio (Deepgram configured and working).
- [x] Audio plays successfully.
- [x] Interruptions work (barge-in stops playback).
- [x] Voice conversation loops (listen → speak → listen).
- [x] Resources cleaned up on call end.
- [x] TypeScript passes in both projects.
- [ ] True streaming TTS (full audio received before playback — future optimization).
- [ ] WebSocket-based STT (batch upload used currently — future optimization).
- [ ] ElevenLabs credits (Deepgram used as fallback — switch when credits available).

---

## 19. File Map

| File | Role |
|---|---|
| `vitejs/src/voice/voiceState.ts` | State machine types, labels |
| `vitejs/src/voice/voiceRecorder.ts` | Mic capture, AudioContext, VAD |
| `vitejs/src/voice/voicePlayer.ts` | Audio playback, cleanup |
| `vitejs/src/components/chat/VoiceCallModal.tsx` | Session orchestrator, UI |
| `vitejs/src/components/chat/SpeechControls.tsx` | Per-message Read Aloud |
| `vitejs/src/pages/Chat.tsx` | One-shot mic + PhoneCall button |
| `fastify/src/modules/voice/routes.ts` | `POST /api/voice/transcribe` |
| `fastify/src/services/tts/ttsRoutes.ts` | `POST /api/voice/tts/speak` |
| `fastify/src/services/tts/deepgramService.ts` | Deepgram API client |
| `fastify/src/services/tts/speechFormatter.ts` | Text → speech-optimized |
| `fastify/src/services/tts/audioCache.ts` | In-memory TTS cache |
| `fastify/src/modules/chat/aiService.ts` | DeepSeek/Ollama streaming |
| `fastify/src/ai/prompts/buddySystemPrompt.ts` | Buddy personality |
