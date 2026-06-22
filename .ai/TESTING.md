# TESTING.md — Buddy Verification Specification

> **Permanent testing and verification specification for Buddy.**
> Code is not complete until it has been verified. This document defines how.

---

## 1. Testing Philosophy

Buddy features are not complete when code is written. They are complete when:

- **Functionality** — the feature actually works as described.
- **TypeScript correctness** — `pnpm typecheck` returns 0 errors in both projects.
- **Runtime behavior** — no console errors, no crashes, no silent failures.
- **UI states** — loading, empty, error, and success states all handled.
- **API behavior** — endpoints respond correctly, errors are consistent.
- **Security boundaries** — auth works, ownership checked, no secrets leaked.
- **Performance basics** — no memory leaks, resources cleaned up, streaming works.

---

## 2. Verification Levels

| Level | Command | Status |
|---|---|---|
| **TypeScript** | `pnpm typecheck` in both `fastify/` and `vitejs/` | Required — 0 errors |
| **Lint** | `pnpm lint` (eslint) in both projects | Available — not enforced |
| **Build** | `pnpm build` in both projects | Available |
| **Unit/Integration** | `pnpm test` (vitest) in both projects | Available — limited coverage |
| **Manual** | Browser testing at `http://localhost:5173` | Primary verification method |

---

## 3. Commands

### Fastify (Backend)
```bash
cd fastify
pnpm dev              # Start dev server (:3000)
pnpm typecheck        # tsc --noEmit
pnpm build            # tsc -p tsconfig.build.json → dist/
pnpm test             # vitest run --coverage
pnpm test:watch       # vitest in watch mode
pnpm lint             # eslint --fix src/ tests/
pnpm format           # prettier --write .
pnpm db:push          # Apply schema changes
```

### Vitejs (Frontend)
```bash
cd vitejs
pnpm dev              # Start dev server (:5173), proxies /api → :3000
pnpm typecheck        # tsc --noEmit
pnpm build            # vite build → dist/
pnpm test             # vitest run --coverage
pnpm test:watch       # vitest in watch mode
pnpm lint             # eslint 'src/**/*.{ts,tsx}'
pnpm lint:fix         # eslint --fix
pnpm format           # prettier --write
pnpm format:check     # prettier --check
```

### Root
```bash
.\scripts\dev.ps1     # Start both servers
```

---

## 4. Frontend Testing

### Automated Tests
- **Framework**: Vitest + React Testing Library + jsdom.
- **Location**: `vitejs/tests/` (mirrors `src/`).
- **Coverage**: 8 test files — components (Layout, Toast, ConfirmDialog, ErrorBoundary, ErrorScaffold) + pages (NotFound, App).

### Manual Verification
Before claiming a frontend task is complete:

- [ ] Page loads without console errors
- [ ] Navigation between pages works
- [ ] Forms submit correctly
- [ ] Loading states appear during async operations
- [ ] Empty states show helpful messages
- [ ] Error states surface via toast or inline messages
- [ ] Responsive layout works on mobile and desktop
- [ ] Light mode renders correctly
- [ ] Interactive elements have visible focus rings
- [ ] Icon buttons have `aria-label`

---

## 5. Backend Testing

### Automated Tests
- **Framework**: Vitest with real PostgreSQL.
- **Location**: `fastify/tests/` (mirrors `src/`).
- **Coverage**: 1 test file (`tests/modules/app.test.ts`).

### Manual Verification
- [ ] Routes respond with correct status codes
- [ ] Auth blocks unauthenticated requests (401)
- [ ] Validation rejects invalid input (422/400)
- [ ] Errors return `{ detail, request_id }` format
- [ ] No uncaught exceptions in console
- [ ] Logs are informative but not verbose in production

---

## 6. API Testing

For every new or modified endpoint:

- [ ] Endpoint exists at the documented path
- [ ] Request body validates correctly
- [ ] Response body matches documented shape
- [ ] Auth required (unless public)
- [ ] User ownership enforced (can't access another user's data)
- [ ] Error responses consistent (`{ detail, request_id }`)

---

## 7. Database Testing

- [ ] Schema in `fastify/src/db/schema.ts` matches actual database
- [ ] `drizzle-kit push` applies without errors
- [ ] Foreign keys cascade correctly
- [ ] No raw SQL without justification comment
- [ ] Data not accidentally deleted by new migrations

---

## 8. AI Testing

- [ ] Buddy's system prompt injected into every DeepSeek request
- [ ] Task prompts selected correctly based on context
- [ ] SSE streaming produces incremental text
- [ ] AI responses match Buddy's personality (tone, honesty, conciseness)
- [ ] No duplicate prompt logic anywhere in codebase

---

## 9. Voice Testing

Voice is the highest-risk feature. It is NOT complete unless:

- [ ] Microphone captures real audio (check console: `[VoiceRecorder] Microphone connected`)
- [ ] Waveform moves from real audio levels (not fake `Math.sin`)
- [ ] AssemblyAI returns transcript (check console: `[Voice] Transcript:`)
- [ ] AI receives transcript and generates response
- [ ] TTS produces audio (Deepgram — check for 402 if no credits)
- [ ] Audio playback works in browser
- [ ] Interruption stops playback immediately
- [ ] Resources cleaned up after call ends (no lingering streams)
- [ ] No fake states (Listening/Thinking/Speaking must reflect real pipeline state)

### Debugging
Open browser console (F12). Voice pipeline logs use prefixes:
- `[VoiceRecorder]` — mic, VAD, silence
- `[VoicePlayer]` — audio playback
- `[VoiceCall]` — state transitions, transcription, AI

---

## 10. Document Testing

- [ ] Upload accepts valid image files
- [ ] Upload rejects files over size limit
- [ ] AI analysis returns summary with identified document type
- [ ] Analysis errors show user-friendly message
- [ ] Documents don't override system prompt (prompt injection resistance)

---

## 11. Security Testing

- [ ] Protected routes reject unauthenticated requests (401)
- [ ] User cannot access another user's data (403)
- [ ] Upload validation blocks oversized files
- [ ] No API keys in frontend bundle or logs
- [ ] Error messages don't leak stack traces or internal details
- [ ] `.env` is gitignored

---

## 12. Performance Testing

- [ ] No unnecessary re-renders (check React DevTools)
- [ ] No duplicate API requests on page load
- [ ] Streaming works (text appears incrementally, not all at once)
- [ ] Audio resources disposed after use
- [ ] Large files handled without freezing UI
- [ ] Memory doesn't grow unbounded during extended voice call

---

## 13. Regression Testing

Before completing any large change, manually verify:

- [ ] Login / registration works
- [ ] Text chat sends and receives streaming response
- [ ] Documents upload and analyze
- [ ] Budgets create and display
- [ ] Transactions record correctly
- [ ] Voice one-shot mic transcribes
- [ ] Voice phone call opens and loops
- [ ] Settings update and persist
- [ ] Navigation between all pages works

---

## 14. Completion Checklist

A task is complete only when:

- [ ] `pnpm typecheck` passes in both `fastify/` and `vitejs/` (0 errors)
- [ ] Feature works manually in the browser
- [ ] No console errors
- [ ] No runtime crashes
- [ ] No placeholder implementations (`TODO`, `FIXME`, stub functions)
- [ ] All states handled (loading, empty, error, success)
- [ ] Documentation updated (CHANGELOG.md, relevant `.ai/` files)
- [ ] No unused files or imports
- [ ] Existing functionality preserved

---

## 15. Testing Gaps

| Gap | Severity | Description |
|---|---|---|
| Minimal backend tests | **High** | Only 1 test file for entire backend. Routes, services, and AI integration have near-zero coverage. |
| No voice tests | **High** | Voice pipeline has no automated tests — relies entirely on manual browser testing. |
| No API integration tests | **High** | No tests verify actual API responses against documented contracts. |
| No E2E tests | **Medium** | No Playwright or Cypress tests for full user flows. |
| Frontend coverage limited | **Medium** | 8 test files cover components but not pages like Chat, Billing, Settings. |
| No accessibility tests | **Low** | No automated a11y checks (axe-core or similar). |
| No performance benchmarks | **Low** | No baseline metrics for response times or bundle sizes. |
