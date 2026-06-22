# PROJECT.md — Buddy Project Overview

> **High-level product and engineering overview.** Read before any medium or large task.
> For detailed conventions, see `BUDDY.md`. For architecture decisions, see `.ai/DECISIONS.md`.

---

## 1. Product Overview

**Buddy** is a personal AI assistant designed for small business owners, entrepreneurs, and individuals in Southeast Asia — particularly Brunei and Malaysia. Buddy helps users manage finances, scan documents, create budgets, and have natural conversations through text or voice.

**What Buddy feels like:**
- A knowledgeable, patient friend — not a corporate chatbot.
- Warm and conversational, using natural contractions and varied openings.
- Professionally helpful without being formal.
- Honest — admits uncertainty instead of fabricating answers.

**Core value proposition:** One assistant that handles chat, voice conversations, document scanning, budgeting, and transaction tracking — all in a single app with local language support (English, Bahasa Melayu, Mandarin).

---

## 2. Tech Stack

| Layer | Technology | Notes |
|---|---|---|
| **Frontend** | React 19, TypeScript, Vite 6 | SPA with React Router v7 |
| **Backend** | Fastify 5, TypeScript, Node 20+ | ESM modules |
| **Database** | PostgreSQL | Via Drizzle ORM |
| **ORM** | Drizzle ORM v0.44 | pg-core with drizzle-kit for migrations |
| **Validation** | TypeBox (@sinclair/typebox) | Schema-based request validation |
| **Auth** | JWT (shared secret) | Via @fastify/jwt + jose |
| **AI Provider** | DeepSeek V4 Flash (primary), Ollama (fallback) | Streaming via SSE |
| **STT Provider** | AssemblyAI (primary), Groq (fallback) | Audio → text |
| **TTS Provider** | Deepgram (primary) | Text → speech |
| **Styling** | Tailwind CSS v4 | Centralized tokens in `vitejs/src/index.css` |
| **Icons** | Lucide React v1.21 | No other icon library |
| **Package Manager** | pnpm v11 | |
| **Containerization** | Docker + Docker Compose | Production deployment |
| **CI/CD** | GitHub Actions | TypeScript checks, ESLint, Prettier, secret scanning |

---

## 3. Major Features

| Feature | Status | Description |
|---|---|---|
| **Chat** | Implemented | Text chat with streaming AI responses via SSE |
| **Voice Conversation** | Implemented | Continuous two-way voice calls with barge-in |
| **One-shot Microphone** | Implemented | Record → transcribe → paste into input |
| **Document Analysis** | Implemented | Upload images, AI describes and classifies them |
| **Budgeting** | Implemented | AI-generated budgets with editable line items |
| **Transactions** | Implemented | Track sales, expenses, refunds; auto-parsed from chat |
| **PDF Generation** | Implemented | Generate PDF documents from AI summaries |
| **Response Actions** | Implemented | Copy, Like/Dislike, Retry, Read Aloud, Share on every AI message |
| **Feedback System** | Implemented | Rate AI responses; detailed feedback form for bad responses |
| **Text-to-Speech** | Implemented | Per-message Read Aloud via Deepgram with speech formatting |
| **User Settings** | Implemented | AI persona customization (name, language, tone, dialect) |
| **Billing** | Implemented | Stripe integration for token purchases |
| **Token System** | Implemented | 200 free tokens, -1 per chat message |

---

## 4. System Architecture

```
┌──────────┐     ┌──────────────┐     ┌─────────────┐     ┌────────────┐
│  Browser  │────▶│  Fastify API  │────▶│  PostgreSQL  │     │  DeepSeek   │
│ (Vite/SPA)│◀────│  (Port 3000)  │◀────│  (Database)   │     │  (AI Chat)  │
└──────────┘     └──────┬───────┘     └─────────────┘     └────────────┘
                        │
          ┌─────────────┼─────────────┬────────────────┐
          ▼             ▼             ▼                ▼
    ┌──────────┐ ┌───────────┐ ┌───────────┐  ┌───────────┐
    │AssemblyAI│ │  Deepgram │ │   Stripe  │  │   Ollama  │
    │  (STT)   │ │   (TTS)   │ │ (Payments)│  │ (Fallback)│
    └──────────┘ └───────────┘ └───────────┘  └───────────┘
```

### Chat Pipeline
```
User message → POST /api/chat → buildFullSystemPrompt() → DeepSeek SSE → stream to frontend → display
```

### Voice Pipeline
```
Mic → VoiceRecorder (VAD) → AssemblyAI → DeepSeek → SpeechFormatter → Deepgram TTS → VoicePlayer → loop
```

### Document Analysis Pipeline
```
Upload image → POST /api/upload/image → POST /api/documents/:id/analyze → analyzeImage() → DeepSeek Vision → save summary
```

### Feedback Pipeline
```
Like/Dislike → POST /api/feedback → feedback table → [Bad] FeedbackDialog → detailed reasons → POST /api/feedback
```

### Auth Pipeline
```
Login → POST /api/auth/login → JWT issued → stored in localStorage → Bearer header on all requests → auto-refresh
```

---

## 5. Repository Structure

```
mybuddy/
├── AGENTS.md              ← AI workflow + skill selection
├── BUDDY.md               ← Project conventions + memory
├── README.md              ← Getting started
├── docker-compose.yml     ← Production deployment
│
├── fastify/               ← Backend (Node + Fastify)
│   ├── src/
│   │   ├── server.ts           ← Entry: build + listen
│   │   ├── app.ts              ← Plugin registration
│   │   ├── config.ts           ← TypeBox-validated env config
│   │   ├── db/schema.ts        ← Drizzle schema (7 tables)
│   │   ├── ai/prompts/         ← Centralized AI prompts (7 files)
│   │   ├── modules/            ← Feature modules (12 domains)
│   │   ├── services/tts/       ← TTS service layer
│   │   └── plugins/            ← Auth, error handler, swagger
│   └── tests/
│
├── vitejs/                ← Frontend (React + Vite)
│   ├── src/
│   │   ├── main.tsx            ← DOM mount + providers
│   │   ├── App.tsx             ← Router
│   │   ├── api.ts              ← Single API wrapper
│   │   ├── auth.ts             ← JWT auth module
│   │   ├── index.css           ← Design tokens
│   │   ├── pages/              ← 8 pages
│   │   ├── components/chat/    ← Chat + voice components
│   │   └── voice/              ← Voice services
│   └── tests/
│
├── .ai/                   ← AI Operating System
│   ├── skills/            ← 10 engineering skill files
│   ├── DECISIONS.md       ← Architecture Decision Records
│   ├── CHANGELOG.md       ← Project change history
│   ├── LESSONS.md         ← Recurring mistakes
│   └── PROJECT.md         ← This file
│
├── whisper-stt/           ← Self-hosted STT (optional)
├── kokoro-tts/            ← Self-hosted TTS (optional)
└── scripts/               ← Dev + CI scripts
```

---

## 6. AI Architecture

- **Centralized prompts** in `fastify/src/ai/prompts/`.
- `buddySystemPrompt.ts` is the single source of truth for personality.
- `buildFullSystemPrompt(persona, task?)` constructs the full system message.
- Task prompts (document, financial, coding, translation) layer on top of personality.
- **DeepSeek V4 Flash** is primary (`deepseek-chat` model via HTTP API).
- **Ollama** is local fallback (Gemma model via `OLLAMA_URL`).
- Streaming via SSE — server sends `data: { type: "text", content: "..." }\n\n`.
- Budget and transaction JSON blocks auto-extracted from AI responses.
- Speech formatting via `speechFormatter.ts` before TTS.

---

## 7. Voice Architecture

- **AssemblyAI** for STT — upload → transcribe → poll.
- **Deepgram** for TTS — POST `/api/voice/tts/speak` → MP3 audio.
- **Voice Services** (`vitejs/src/voice/`): `voiceState.ts`, `voiceRecorder.ts`, `voicePlayer.ts`.
- **Voice UI**: `VoiceCallModal.tsx` (continuous), `SpeechControls.tsx` (per-message).
- **VAD**: AudioContext analyser with 1.5s silence detection.
- **Barge-in**: Stop playback on new speech, reset to listening.
- **Waveform**: Real-time `requestAnimationFrame` with actual audio levels.
- **Input bar**: `[Camera] [Message] [Mic] [Phone]` — Mic is one-shot, Phone is continuous.

---

## 8. Data Architecture

- **PostgreSQL** accessed via Drizzle ORM (`pg-core`).
- **7 tables**: `users`, `conversations`, `transactions`, `documents`, `token_ledger`, `budgets`, `feedback`.
- All tables use UUID primary keys with `defaultRandom()`.
- Foreign keys cascade on delete.
- Timestamps with timezone, defaulting to `now()`.
- JSONB for flexible data: `ai_persona`, `line_items`, `reasons`.
- Migrations via `drizzle-kit push` (development).
- Token system: 200 free tokens per user, -1 per chat message, tracked in `token_ledger`.

---

## 9. UI Architecture

- **Design tokens** centered in `vitejs/src/index.css` (Tailwind v4 @theme).
- **Colors**: Primary blue palette (`--color-primary-50` to `--color-primary-900`), with success/warning/danger/surface scales.
- **Icons**: Lucide only — `lucide-react` v1.21.
- **Components**: React functional components with hooks, context for shared state.
- **Toast**: `useToast()` from `components/Toast.tsx` (info/success/warning/error).
- **Provider tree**: ThemeProvider → ToastProvider → ConfirmProvider.
- **Routing**: React Router v7 with 8 pages.
- **Layout**: Sidebar navigation + content area.
- **Accessibility**: WCAG AA, keyboard navigation, ARIA labels on icon buttons.
- **Dark mode**: Supported via CSS variables, toggled by `data-theme`.

---

## 10. Development Workflow

```bash
# Backend
cd fastify
pnpm dev                  # Start dev server (port 3000)
pnpm typecheck            # TypeScript check (tsc --noEmit)
pnpm build                # Compile to dist/
pnpm test                 # Run tests
pnpm db:push              # Apply schema changes

# Frontend
cd vitejs
pnpm dev                  # Start dev server (port 5173, proxies /api to :3000)
pnpm typecheck            # TypeScript check
pnpm build                # Production build
pnpm test                 # Run tests

# Both (from mybuddy/)
.\scripts\dev.ps1         # Start both servers
```

**Verification before commits:**
```bash
cd fastify && pnpm typecheck   # 0 errors
cd vitejs && pnpm typecheck    # 0 errors
```

---

## 11. External Services

| Service | Purpose | Config Key | Status |
|---|---|---|---|
| **DeepSeek** | AI chat (LLM) | `DEEPSEEK_API_KEY`, `DEEPSEEK_MODEL` | Configured |
| **AssemblyAI** | Speech-to-text | `ASSEMBLYAI_API_KEY` | Configured |
| **Deepgram** | Text-to-speech | `DEEPGRAM_API_KEY` | Configured |
| **Groq** | STT fallback | `GROQ_API_KEY` | Configured |
| **ElevenLabs** | TTS (deprecated) | `ELEVENLABS_API_KEY` | Deprecated — replaced by Deepgram |
| **Ollama** | Local AI fallback | `OLLAMA_URL`, `OLLAMA_MODEL` | Optional |
| **Stripe** | Payments | `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET` | Configured |
| **Kokoro TTS** | Self-hosted TTS | `KOKORO_TTS_URL` | Optional |
| **Whisper STT** | Self-hosted STT | `WHISPER_STT_URL` | Optional |

---

## 12. Important Project Rules

1. **Never hardcode AI prompts** — use `buildFullSystemPrompt()` from `src/ai/prompts/`.
2. **Never expose API keys** — `.env` is gitignored, use `config.KEY_NAME`.
3. **Use Lucide icons only** — no emojis, Material, Font Awesome.
4. **Use centralized theme tokens** — no raw hex values in components.
5. **API calls through `vitejs/src/api.ts`** — no inline `fetch` in components.
6. **All backend routes use TypeBox validation**.
7. **Error responses use `{ detail, request_id }` format**.
8. **Run `pnpm typecheck` in both directories before committing.**
9. **Update `.ai/CHANGELOG.md` after major changes.**
10. **Update `.ai/LESSONS.md` when a recurring mistake is discovered.**
11. **State Context Proof before implementing anything.**

---

## 13. Unknowns

- **Production deployment target** — Unknown. Docker Compose is configured but hosting provider is not documented.
- **User base** — Unknown. The app appears designed for small business owners in Brunei/Malaysia.
- **Mobile app plans** — Unknown. No React Native or mobile-specific code present.
- **Scaling strategy** — Unknown. Current architecture is single-instance.
