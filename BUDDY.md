# BUDDY.md — MyBuddy Project Instructions

> **Permanent source of truth for this project.**
> Every AI coding agent MUST read this file after `AGENTS.md`.
> For task-specific guidance, see `.ai/skills/`.

---

## Documentation Map

```
AGENTS.md           ← Start here: workflow, skill selection
    ↓
BUDDY.md            ← This file: project conventions, memory, ADR
    ↓
.ai/
├── PROJECT.md      ← Product + engineering overview
├── ARCHITECTURE.md ← Codebase structure + rules
├── DESIGN.md       ← Visual identity + design system
├── VOICE.md        ← Voice system specification
├── PROMPTS.md      ← AI prompt system specification
├── DATABASE.md     ← Database engineering specification
├── API.md          ← API contract documentation
├── SECURITY.md     ← Security & privacy specification
├── DECISIONS.md    ← Architecture decisions
├── CHANGELOG.md    ← Change history
├── LESSONS.md      ← Mistakes + rules
└── skills/         ← Reusable engineering skills
    ├── ... (10 skill files)
```

---

## Stack

| Layer       | Technology                                                    |
| ----------- | ------------------------------------------------------------- |
| **Backend** | Fastify 5, TypeScript, Drizzle ORM, TypeBox validation        |
| **Frontend**| React 19, TypeScript, Vite, React Router, Tailwind CSS        |
| **Database**| PostgreSQL                                                    |
| **AI**      | DeepSeek V4 Flash (primary), Ollama (fallback)                |
| **STT**     | AssemblyAI (primary), Groq (fallback)                         |
| **TTS**     | Deepgram (primary)                                            |
| **Package** | pnpm                                                          |

---

## Core Behavior

The AI must behave like an **experienced senior software engineer**.

1. **Read BUDDY.md first** — understand the project before writing code.
2. **State Context Proof** — before responding to any project question or writing code, cite which documentation, skills, and source files you read (see AGENTS.md § Context Proof).
3. **Never skip requested features** — implement everything the user asks for.
3. **Never silently reduce scope** — if blocked, explain the blocker; never pretend it's done.
4. **Never fabricate** — no invented APIs, packages, documentation, or capabilities.
5. **Never leave TODO comments or placeholder implementations.**
6. **Never break existing functionality** when adding new features.
7. **Ask for clarification** if requirements are ambiguous — don't assume.
8. **Production-ready code only** — strong TypeScript typing, proper error handling, no silent failures.
9. **Treat BUDDY.md as the project's permanent memory** — update it when conventions change.

---

## Thinking Strategy

Before writing any code, follow this sequence:

1. **Analyze** — read the relevant code to understand the current architecture.
2. **Search** — find reusable components, services, or patterns already in the project.
3. **Identify** — list every file that will be affected by the change.
4. **Consider** — think through edge cases, error states, and performance implications.
5. **Compare** — evaluate multiple implementation approaches; choose the simplest production-ready solution.
6. **Only then** — begin implementation.

For complex tasks, spend **more time reasoning** before coding. Rushing produces bugs.

---

## Project Philosophy

Every feature and design decision should align with these principles:

- **Fast** — minimal latency, streaming where possible, optimistic UI.
- **Reliable** — graceful error handling, never crash, auto-recovery.
- **Human** — natural language, conversational tone, not robotic.
- **Professional** — clean code, consistent patterns, maintainable.
- **Minimal** — no unnecessary complexity, no bloat, no unused dependencies.
- **Privacy-first** — don't store what isn't needed, delete temporary data.
- **Accessibility-first** — WCAG AA, keyboard navigation, screen readers, ARIA labels.
- **Mobile-first** — responsive layouts, touch targets, compact UI.
- **Scalable** — modular architecture, service abstraction, swappable providers.
- **Maintainable** — single source of truth, DRY, clear naming.

---

## Architecture Decision Records (ADR)

Each major technical decision is recorded here so future AI agents don't undo past design choices.

| Decision | Reason | Alternatives Considered | Status |
|----------|--------|------------------------|--------|
| AssemblyAI for STT | Streaming support, low latency, 50 free hours | Whisper, Google Speech, Azure Speech | Accepted |
| Deepgram for TTS | Free tier with credits, simple HTTP API | ElevenLabs (no credits), Kokoro (local) | Accepted |
| DeepSeek V4 Flash for AI | Cost-effective, streaming, strong reasoning | Ollama (fallback), Anthropic, OpenAI | Accepted |
| Drizzle ORM | Lightweight, TypeScript-native, no codegen | Prisma, Knex, raw SQL | Accepted |
| Tailwind CSS | Utility-first, tree-shakeable, design tokens | CSS Modules, Styled Components | Accepted |
| Lucide icons | Consistent, tree-shakeable, MIT license | Heroicons, Font Awesome, Material | Accepted |
| Centralized AI prompts | Single source of truth for personality | Inline prompts (duplication) | Accepted |
| Voice Session Manager | Orchestrates mic/STT/AI/TTS/player | Direct coupling between services | Accepted |

---

## File Structure

```
mybuddy/
├── BUDDY.md                          ← THIS FILE — project-wide instructions
├── README.md
├── docker-compose.yml
├── .github/workflows/ci.yml          ← CI pipeline
│
├── fastify/                          ← Backend
│   ├── .env / .env.example           ← Environment variables (NEVER commit .env)
│   ├── .pnpmrc                       ← allow-build=esbuild
│   ├── drizzle.config.ts
│   ├── package.json
│   ├── src/
│   │   ├── server.ts                 ← Entry point
│   │   ├── app.ts                    ← Plugin registration (load-bearing order)
│   │   ├── config.ts                 ← All env config (typebox-validated)
│   │   ├── db/
│   │   │   ├── client.ts             ← Database connection
│   │   │   └── schema.ts             ← Drizzle schema (all tables)
│   │   ├── ai/prompts/               ← Centralized AI prompts
│   │   │   ├── index.ts              ← buildFullSystemPrompt()
│   │   │   ├── buddySystemPrompt.ts  ← Buddy personality
│   │   │   ├── speechPrompt.ts       ← TTS formatting
│   │   │   ├── documentAnalysisPrompt.ts
│   │   │   ├── translationPrompt.ts
│   │   │   ├── financialAssistantPrompt.ts
│   │   │   └── codingAssistantPrompt.ts
│   │   ├── modules/                  ← Feature modules (routes per domain)
│   │   │   ├── chat/aiService.ts      ← DeepSeek + Ollama streaming
│   │   │   ├── chat/routes.ts        ← POST /api/chat, GET /api/chat/history
│   │   │   ├── voice/routes.ts       ← POST /api/voice/transcribe + /tts
│   │   │   ├── feedback/routes.ts    ← POST + DELETE /api/feedback
│   │   │   ├── budgets/routes.ts
│   │   │   ├── documents/routes.ts
│   │   │   └── ...                   ← auth, upload, transactions, etc.
│   │   ├── services/tts/             ← TTS service layer
│   │   │   ├── ttsRoutes.ts          ← POST /api/voice/tts/speak
│   │   │   ├── deepgramService.ts    ← Deepgram API client
│   │   │   ├── speechFormatter.ts    ← Text → speech-optimized text
│   │   │   └── audioCache.ts         ← In-memory TTS cache
│   │   └── plugins/                  ← Error handler, auth, swagger, etc.
│   └── tests/
│
├── vitejs/                           ← Frontend
│   ├── .env / .env.example
│   ├── .pnpmrc
│   ├── vite.config.ts                ← Proxy /api → :3000
│   ├── package.json
│   ├── src/
│   │   ├── main.tsx                  ← DOM mount + provider tree
│   │   ├── App.tsx                   ← Router
│   │   ├── api.ts                    ← SINGLE API wrapper (never fetch direct)
│   │   ├── auth.ts                   ← JWT auth module
│   │   ├── index.css                 ← Design tokens + Tailwind
│   │   ├── pages/Chat.tsx            ← Main chat page
│   │   ├── components/
│   │   │   ├── Layout.tsx
│   │   │   ├── Toast.tsx             ← Toast provider (useToast hook)
│   │   │   └── chat/
│   │   │       ├── MessageActions.tsx ← Copy/Like/Dislike/Retry/Read/Share
│   │   │       ├── SpeechControls.tsx ← Per-message Read Aloud
│   │   │       ├── CopyButton.tsx
│   │   │       ├── FeedbackDialog.tsx
│   │   │       └── VoiceCallModal.tsx ← Full voice call screen
│   │   └── voice/                    ← Voice services (pure, no React)
│   │       ├── voiceState.ts         ← State machine types
│   │       ├── voiceRecorder.ts      ← Mic capture + VAD
│   │       └── voicePlayer.ts        ← Audio playback
│   └── tests/
│
├── whisper-stt/                      ← Self-hosted STT (Faster-Whisper, optional)
├── kokoro-tts/                       ← Self-hosted TTS (Kokoro-82M, optional)
└── scripts/                          ← Dev scripts, CI helpers
    └── dev.ps1                       ← Starts both servers
```

---

## AI Pipeline

Every AI request MUST go through the centralized prompt system. **Never hardcode prompts.**

```
src/ai/prompts/
├── index.ts                   ← buildFullSystemPrompt(persona, task?)
├── buddySystemPrompt.ts       ← Buddy's personality (SINGLE SOURCE OF TRUTH)
├── speechPrompt.ts            ← TTS formatting rules
├── documentAnalysisPrompt.ts  ← Document/image analysis
├── translationPrompt.ts       ← Translation tasks
├── financialAssistantPrompt.ts ← Budget/finance tasks
└── codingAssistantPrompt.ts   ← Coding tasks
```

**Required flow:**
1. Every chat request calls `buildFullSystemPrompt({ persona, task })`.
2. The system prompt always includes Buddy's personality as the base layer.
3. An optional `task` parameter adds domain-specific instructions on top.
4. To change Buddy's personality, edit **ONLY** `buddySystemPrompt.ts`.
5. To add a new task type: (a) create prompt file, (b) add to `TaskType` union, (c) add case to `buildTaskPrompt()`.

---

## Voice Pipeline

All voice features must route through the Voice Session Manager pattern.
**Do not bypass it.**

```
Microphone (PCM audio)
    ↓
VoiceActivityDetection (silence detection)
    ↓
AssemblyAI (Speech-to-Text, streaming)
    ↓
DeepSeek V4 Flash (AI response, streaming)
    ↓
SpeechFormatter (clean text for speech)
    ↓
Deepgram TTS (Text-to-Speech)
    ↓
VoicePlayer (audio playback)
    ↓
Loop back to listening (if continuous mode)
```

**Voice services** (`vitejs/src/voice/` — pure TypeScript, no React):
- `voiceState.ts` — State machine types, labels, `isCallActive()` helper
- `voiceRecorder.ts` — Microphone capture with real AudioContext VAD, silence detection
- `voicePlayer.ts` — Audio playback with proper cleanup

**Voice UI** (`vitejs/src/components/chat/`):
- `VoiceCallModal.tsx` — Full-screen continuous voice conversation
- `SpeechControls.tsx` — Per-message Read Aloud (play/pause/stop)
- `MessageActions.tsx` — Action row (Copy, Like, Dislike, Retry, Read, Share)

**Backend TTS** (`fastify/src/services/tts/`):
- `ttsRoutes.ts` — `POST /api/voice/tts/speak`
- `deepgramService.ts` — Deepgram API client
- `speechFormatter.ts` — Strips markdown, code blocks, expands abbreviations
- `audioCache.ts` — In-memory cache (50 entries max)

**Input bar layout:** `[Camera] [___Message___] [Mic] [Phone]`
- Camera — Upload images/documents
- Mic — One-shot STT (records, transcribes, pastes into input — does NOT auto-send)
- Phone — Opens VoiceCallModal for continuous conversation

---

## UI & UX Standards

**Icons:** Lucide only. Never emojis (as UI elements), Material, Font Awesome, or Heroicons.

**Styling:** Tailwind CSS with centralized theme tokens in `vitejs/src/index.css`.
- Colors: `--color-primary-*`, `--color-success`, `--color-danger`, `--color-warning`, `--color-surface-*`
- No hardcoded colors or raw hex values.
- Rounded corners (xl/2xl), soft shadows, smooth transitions (<250ms).
- Consistent spacing, responsive layouts, mobile-first design.
- Dark mode support via CSS variables.

**API calls:** Always through `vitejs/src/api.ts`. **Never inline `fetch`** in components except in isolated voice services.

**Toast notifications:** Use `useToast()` from `components/Toast.tsx`.

**Accessibility:** WCAG AA contrast, keyboard navigation, `aria-label` on icon-only buttons, visible focus rings, semantic HTML.

**Component patterns:**
- Prefer reusable components over duplication.
- Use React hooks (useState, useCallback, useRef) — no class components.
- Memoization for expensive computations.
- Cleanup in useEffect return and useCallback disposal.

---

## Backend Standards

- **Error shape:** `{ detail, request_id }` — centralized in `plugins/error-handler.ts`.
- **Config:** All env vars in `config.ts` (TypeBox-validated). Keys in `.env`, template in `.env.example`.
- **Routes:** Use `fp` (fastify-plugin) pattern. Register in `app.ts` after auth plugins.
- **Schema:** Drizzle with pg-core in `db/schema.ts`. Use `drizzle-kit push` for migrations.
- **API keys:** Never hardcode. Always read via `config.KEY_NAME`.
- **Validation:** Use TypeBox schemas on all route inputs.
- **Logging:** Use Fastify/pino logger (`request.log.info/warn/error`).
- **Never expose secrets** in logs or error responses.
- **Never trust client input** — validate everything.
- **Keep routes thin** — business logic in services, not route handlers.

---

## Frontend Standards

- **API layer:** `src/api.ts` is the single fetch wrapper. Add new endpoints there.
- **Auth:** `src/auth.ts` handles JWT, token refresh, and logout.
- **State:** React Context for shared state (Toast, Theme). No Redux.
- **Hooks:** `useCallback` with correct deps arrays. No missing deps (causes stale closures).
- **Naming:** PascalCase for components, camelCase for functions/variables.
- **Imports:** Always use relative paths from the current file's location.
- **Cleanup:** useEffect returns must clean up listeners, timers, and streams.

---

## Performance Standards

- **Streaming:** Use SSE for AI responses, stream audio where possible.
- **Caching:** Cache TTS audio during session. Don't re-fetch identical text.
- **Resource cleanup:** Dispose audio contexts, media streams, and timers on unmount.
- **Cancel pending requests** when starting new ones (AbortController).
- **Prevent memory leaks** — no lingering event listeners or intervals.
- **Avoid unnecessary re-renders** — use `useCallback`/`useMemo` appropriately.

---

## Security Standards

- **Environment variables only** for secrets and API keys.
- **Never commit `.env` files.** `.env.example` is the template.
- **Validate uploads** — file size, type, and content.
- **Sanitize user input** before storing or displaying.
- **Delete temporary audio files** after processing.
- **Respect user privacy** — don't log PII or conversation content.
- **Gitignore:** `.env`, `pnpm-workspace.yaml`, `node_modules/`, `dist/`, `coverage/`.

---

## Error Handling

Every feature must handle these states:

| State | Requirement |
|-------|-------------|
| **Loading** | Show spinner or skeleton UI |
| **Empty** | Show helpful message, not blank screen |
| **Success** | Confirm action where appropriate |
| **Failure** | Show descriptive error, provide retry |
| **Disconnected** | Auto-reconnect where possible |

- Never silently fail — log the error and surface a message to the user.
- Backend errors must include `{ detail, request_id }`.
- Frontend errors should show via toast or inline message.

---

## Quality Gates

Before reporting any task as complete:

```bash
cd fastify && pnpm typecheck   # MUST be 0 errors
cd vitejs && pnpm typecheck    # MUST be 0 errors
```

Also verify:
- Imports resolve correctly
- No unused files remain
- No duplicate code or business logic
- Existing functionality still works
- No broken references

---

## Definition of Done

A task is NOT complete until ALL of these are true:

- [ ] Every requested feature implemented
- [ ] Existing functionality still works
- [ ] `pnpm typecheck` passes in both fastify/ and vitejs/
- [ ] No TODO comments
- [ ] No placeholder implementations
- [ ] No duplicate code
- [ ] No broken imports
- [ ] No unused files
- [ ] No hardcoded values or prompts
- [ ] UI matches project design (Lucide icons, Tailwind tokens)
- [ ] Error handling implemented for all states
- [ ] Loading states implemented
- [ ] Resources cleaned up (listeners, streams, timers)
- [ ] API keys are in .env, not in code
- [ ] New endpoints registered in app.ts
- [ ] New API methods added to vitejs/src/api.ts
- [ ] Voice features go through Voice Session Manager
- [ ] AI prompts centralized in src/ai/prompts/

---

## Lessons Learned

*Document recurring mistakes here so they are not repeated.*

1. **pnpm workspace conflicts** — `pnpm-workspace.yaml` files break standalone installs. Removed and added to `.gitignore`. Never recreate them.

2. **AudioContext must be resumed** — Browsers create AudioContext in a suspended state. Always `await audioCtx.resume()` before using.

3. **Don't revoke cached blob URLs** — `URL.revokeObjectURL()` on cached audio URLs poisons the cache. Let browser GC handle them.

4. **Lockfile mismatch** — `pnpm.overrides` in `package.json` must match `pnpm-lock.yaml`. Remove the `overrides` field and regenerate the lockfile if they diverge.

5. **API endpoint naming** — `/api/voice/tts` is the legacy route. `/api/voice/tts/speak` is the current one. Don't add competing routes.

6. **Git identity** — Commits must use `MyBuddy <MyBuddybn26@gmail.com>`. Set in both global (`~/.gitconfig`) and repo config.

7. **Never expose API keys** — Shared keys must be rotated immediately. `.env` is gitignored; never paste keys in chat.

8. **TypeScript strict checks** — Unused imports and variables cause compile errors. Remove all unused code before pushing.

9. **React useCallback deps** — Every variable referenced inside a callback must be in the deps array. Missing deps cause stale closures and subtle bugs.

10. **Voice Recorder lifecycle** — Always dispose the recorder and player before creating new instances. Duplicate streams cause resource leaks.

11. **pnpm action hash** — CI workflow must use valid commit hashes for GitHub Actions. Invalid hashes cause CI failures. Use version tags (`@v4`) when possible.

12. **ESLint unused variables** — The `no-unused-vars` rule catches dead code. Remove unused refs, imports, and variables before pushing.

13. **Endpoint response shape** — All API responses use `{ detail }` for errors. Never return raw error strings.

14. **Component import paths** — Files in `components/chat/` import from `../../api` and `../../auth` (two levels up to `src/`).

---

## Completion Rules

- Do NOT stop after creating files.
- Do NOT stop after writing code.
- Do NOT stop after fixing one issue.
- Continue until every acceptance criterion is satisfied.
- If blocked, explain the blocker clearly instead of pretending completion.
- Only report "done" after all Definition of Done items are checked.
