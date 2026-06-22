# BUDDY.md — MyBuddy Project Instructions

> Read this file before making any code changes. Follow every instruction unless explicitly overridden by the user.

---

## Stack

| Layer | Technology |
| ----- | ---------- |
| **Backend** | Fastify 5, TypeScript, Drizzle ORM, TypeBox validation |
| **Frontend** | React 19, TypeScript, Vite, React Router, Tailwind CSS |
| **Database** | PostgreSQL |
| **AI** | DeepSeek V4 Flash (primary), Ollama (fallback) |
| **STT** | AssemblyAI (primary), Groq (fallback) |
| **TTS** | Deepgram (primary) |
| **Package manager** | pnpm |

---

## Core Rules

1. **Never skip requested features** — implement everything the user asks for.
2. **Never leave TODO comments or placeholder implementations.**
3. **Never break existing functionality** when adding new features.
4. **Always verify** — run `pnpm typecheck` on both `fastify/` and `vitejs/` before reporting success.
5. **Production-ready code only** — strong typing, proper error handling, no silent failures.
6. **Ask for clarification** if requirements are ambiguous — don't assume.

---

## AI Pipeline

All AI requests must go through the centralized prompt system:

```
src/ai/prompts/
├── index.ts                   ← buildFullSystemPrompt(persona, task?)
├── buddySystemPrompt.ts       ← Buddy's personality (single source of truth)
├── speechPrompt.ts            ← TTS formatting rules
├── documentAnalysisPrompt.ts  ← Document/image analysis
├── translationPrompt.ts       ← Translation tasks
├── financialAssistantPrompt.ts ← Budget/finance tasks
└── codingAssistantPrompt.ts   ← Coding tasks
```

**Rules:**
- Never hardcode prompts in API routes or chat handlers.
- Every AI call must include the Buddy system prompt via `buildFullSystemPrompt()`.
- Task prompts are additive — they layer on top of Buddy's personality.
- To change Buddy's personality, edit ONLY `buddySystemPrompt.ts`.

---

## Voice Pipeline

```
Mic → VoiceRecorder (VAD) → AssemblyAI → DeepSeek → SpeechFormatter → Deepgram TTS → VoicePlayer
```

**Voice services** (`vitejs/src/voice/`):
- `voiceState.ts` — State machine types
- `voiceRecorder.ts` — Audio capture with real AudioContext VAD
- `voicePlayer.ts` — Audio playback

**Voice UI** (`vitejs/src/components/chat/`):
- `VoiceCallModal.tsx` — Full voice call screen (continuous two-way conversation)
- `SpeechControls.tsx` — Per-message Read Aloud button
- `MessageActions.tsx` — Copy, Like, Dislike, Retry, Read, Share

**Backend TTS** (`fastify/src/services/tts/`):
- `speechFormatter.ts` — Cleans AI text for speech
- `deepgramService.ts` — Calls Deepgram API
- `audioCache.ts` — In-memory cache
- `ttsRoutes.ts` — `POST /api/voice/tts/speak`

---

## UI Conventions

- **Icons**: Lucide only. Never emojis, Material, Font Awesome, or Heroicons.
- **Styling**: Tailwind CSS with centralized theme tokens in `vitejs/src/index.css`.
- **Colors**: Use `--color-primary-*`, `--color-success`, `--color-danger`, `--color-warning`, `--color-surface-*`.
- **API calls**: Always go through `vitejs/src/api.ts`. Never inline `fetch` in components.
- **Toast notifications**: Use `useToast()` from `components/Toast.tsx`.
- **Input bar layout**: `[Camera] [Message] [Mic] [Phone]`

---

## Backend Conventions

- **Error shape**: `{ detail, request_id }` — centralized in `fastify/src/plugins/error-handler.ts`.
- **Config**: All env vars in `fastify/src/config.ts`. Keys go in `.env`, template in `.env.example`.
- **Routes**: Use `fp` (fastify-plugin) pattern. Register in `fastify/src/app.ts`.
- **Schema**: Drizzle with pg-core in `fastify/src/db/schema.ts`. Use `drizzle-kit push` for migrations.
- **API keys**: Never hardcode. Always via `config.KEY_NAME`.

---

## File Structure (key paths)

```
mybuddy/
├── fastify/
│   ├── src/
│   │   ├── app.ts                  ← Plugin registration
│   │   ├── config.ts               ← Env config
│   │   ├── ai/prompts/             ← Centralized AI prompts
│   │   ├── db/schema.ts            ← Drizzle schema
│   │   ├── modules/                ← Feature modules
│   │   │   ├── chat/               ← Chat (claude.ts + routes.ts)
│   │   │   ├── voice/              ← Voice transcription + TTS
│   │   │   ├── feedback/           ← Feedback (POST + DELETE)
│   │   │   ├── budgets/            ← Budgets
│   │   │   ├── documents/          ← Documents
│   │   │   └── ...                 ← Other modules
│   │   ├── services/tts/           ← TTS services
│   │   └── plugins/                ← Error handler, auth, etc.
│   └── .env / .env.example
├── vitejs/
│   ├── src/
│   │   ├── api.ts                  ← Single API wrapper
│   │   ├── auth.ts                 ← JWT auth module
│   │   ├── index.css               ← Design tokens
│   │   ├── pages/Chat.tsx          ← Main chat page
│   │   ├── components/
│   │   │   ├── chat/               ← Chat components
│   │   │   └── Toast.tsx           ← Toast provider
│   │   └── voice/                  ← Voice services
│   └── .env / .env.example
├── whisper-stt/                    ← Self-hosted STT (Faster-Whisper)
├── kokoro-tts/                     ← Self-hosted TTS (Kokoro-82M)
├── docker-compose.yml
└── scripts/
```

---

## Quality Gates

Before committing or reporting completion:

```bash
cd fastify && pnpm typecheck   # 0 errors
cd vitejs && pnpm typecheck    # 0 errors
```

---

## Lessons Learned

1. **pnpm workspace conflicts** — `pnpm-workspace.yaml` files break standalone installs. Removed and added to `.gitignore`.
2. **AudioContext must be resumed** — `new AudioContext()` creates a suspended context on modern browsers. Always call `audioCtx.resume()`.
3. **Don't revoke cached URLs** — `URL.revokeObjectURL()` on cached blob URLs breaks replay. Let browser GC handle them.
4. **Lockfile mismatch** — `pnpm.overrides` in `package.json` must match the lockfile. Remove overrides or regenerate lockfile.
5. **API endpoint conflicts** — New endpoints must use distinct paths. `/api/voice/tts` exists for the old route; `/api/voice/tts/speak` is the new one.
6. **Git identity** — Commits must use `MyBuddy <MyBuddybn26@gmail.com>`. Configured in both global and repo git config.
7. **Never share API keys** — Keys exposed in chat must be rotated immediately.
8. **TypeScript strict** — Unused imports/variables cause compile errors. Remove unused code before committing.
9. **useCallback deps** — React hooks must list all referenced variables in deps arrays. Missing deps cause stale closures.
10. **Voice Recorder lifecycle** — Always dispose recorder and player before creating new ones to prevent duplicate streams.
