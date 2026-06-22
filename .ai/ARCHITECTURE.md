# ARCHITECTURE.md — Codebase Architecture Rules

> **Defines how Buddy's codebase is structured and how features must be built.**
> Prevents inconsistent patterns, duplicate services, and breaking architecture decisions.

---

## 1. Architecture Philosophy

Buddy follows these engineering principles:

- **Simple before complex** — start with the simplest solution that meets requirements. Complexity is only justified by concrete needs.
- **Modular** — every domain has its own directory; modules don't reach across domains without going through shared services.
- **Scalable** — provider abstractions allow swapping implementations (AI, STT, TTS) without rewriting consumers.
- **Maintainable** — single source of truth for prompts, config, styling, and conventions.
- **AI-agent friendly** — `.ai/` documentation system ensures every agent has full context before coding.
- **Mobile-first** — responsive layouts, touch-friendly targets, compact UI.
- **Privacy-first** — don't store what isn't needed; delete temporary data after processing.

---

## 2. Repository Structure

```
mybuddy/
├── fastify/         ← Backend API (Node + Fastify). All `/api/*` routes live here.
├── vitejs/          ← Frontend SPA (React + Vite). All UI components live here.
├── .ai/             ← AI Operating System docs. Never write app code here.
├── whisper-stt/     ← Self-hosted STT (optional). Independent Python service.
├── kokoro-tts/      ← Self-hosted TTS (optional). Independent Python service.
├── scripts/         ← Dev/CI scripts. Shell and PowerShell scripts only.
└── .github/         ← CI workflow. GitHub Actions only.
```

### What belongs WHERE

| Location | Allowed | NOT Allowed |
|---|---|---|
| `fastify/src/modules/` | Route handlers, domain logic | Frontend code, React components |
| `fastify/src/services/` | Provider abstractions (TTS, AI) | Route registration |
| `fastify/src/ai/prompts/` | Prompt strings and builders | Business logic, API calls |
| `fastify/src/db/` | Schema, database client | Route handlers |
| `vitejs/src/pages/` | Page-level components | Business logic, API calls (use `api.ts`) |
| `vitejs/src/components/` | Reusable UI components | Route definitions |
| `vitejs/src/voice/` | Pure voice services (no React) | UI rendering |
| `.ai/` | Documentation | Application code |

---

## 3. Frontend Architecture

### Component Organization
```
vitejs/src/
├── pages/              ← Route-level components (Chat, Login, Settings, etc.)
├── components/
│   ├── Layout.tsx      ← Shell: sidebar + content area
│   ├── Toast.tsx       ← Toast notification system (context + provider)
│   ├── ConfirmDialog.tsx
│   ├── ErrorBoundary.tsx
│   ├── ErrorScaffold.tsx
│   └── chat/           ← Chat-specific components
│       ├── MessageActions.tsx
│       ├── SpeechControls.tsx
│       ├── CopyButton.tsx
│       ├── FeedbackDialog.tsx
│       └── VoiceCallModal.tsx
├── voice/              ← Voice services (pure TS, no React)
│   ├── voiceState.ts
│   ├── voiceRecorder.ts
│   └── voicePlayer.ts
├── api.ts              ← SINGLE fetch wrapper
├── auth.ts             ← JWT module
├── index.css           ← Design tokens + Tailwind
└── main.tsx            ← DOM mount + provider tree
```

### Rules
- **Pages** compose components; they do NOT contain reusable logic.
- **Components** are reusable UI pieces; they do NOT call `fetch` directly — always use `api.ts`.
- **Voice services** are pure TypeScript classes with no React dependency.
- **State**: React Context for shared state (Toast, Theme); local `useState` for component state. No Redux.
- **Theme**: CSS variables in `index.css`; Tailwind utility classes reference these tokens. Never hardcode colors.
- **Icons**: Lucide only from `lucide-react`. Size 14-20px. `aria-label` on icon-only buttons.
- **API calls**: Every network request goes through `vitejs/src/api.ts`. Add new methods there.

---

## 4. Backend Architecture

### Plugin Order (load-bearing — do NOT rearrange)
```
helmet → cors → rateLimit → multipart → swagger → errorHandler → requestId → auth → authz → routes
```

### Module Pattern
```
fastify/src/modules/<domain>/
├── routes.ts    ← Route definitions (thin — call services, return responses)
```

Every module uses the `fp` (fastify-plugin) wrapper:

```typescript
import fp from 'fastify-plugin';

export default fp(async (app: FastifyInstance) => {
  app.post('/api/domain', { schema: { body: Schema } }, async (request, reply) => {
    // validate → call service → return response
  });
});
```

### Service Layer
```
fastify/src/services/
├── tts/
│   ├── ttsRoutes.ts          ← POST /api/voice/tts/speak
│   ├── deepgramService.ts    ← Deepgram API client
│   ├── speechFormatter.ts    ← Text → speech-optimized text
│   └── audioCache.ts         ← In-memory TTS cache
```

### Rules
- **Routes stay thin** — validate input, call service, return response. No business logic.
- **Services contain business logic** — API calls, data transformation, caching.
- **Validation**: TypeBox schemas on all route inputs. Never trust `request.body` without validation.
- **Error responses**: `{ detail: string, request_id: string }` format. Centralized in `plugins/error-handler.ts`.
- **Config**: All env vars in `config.ts` with TypeBox validation. Never access `process.env` directly.
- **API keys**: Always via `config.KEY_NAME`. Never hardcoded.
- **Registration**: New modules must be imported and registered in `app.ts` (after auth plugins).

---

## 5. AI Architecture

### Prompt System
```
fastify/src/ai/prompts/
├── index.ts                   ← buildFullSystemPrompt(persona, task?)
├── buddySystemPrompt.ts       ← Buddy personality (SINGLE SOURCE)
├── speechPrompt.ts
├── documentAnalysisPrompt.ts
├── translationPrompt.ts
├── financialAssistantPrompt.ts
└── codingAssistantPrompt.ts
```

### Provider Pattern
```
fastify/src/modules/chat/aiService.ts
├── streamChat(messages, persona, task?)     ← Primary entry point
├── streamDeepSeek(formattedMessages)        ← DeepSeek API
├── streamOllama(formattedMessages, model)    ← Local fallback
└── analyzeImage(...)                         ← Image analysis
```

### How to Add a New AI Provider
1. Add API key to `config.ts` (schema + loader).
2. Create provider function in `aiService.ts` (e.g., `streamOpenAI`).
3. Add to fallback chain in `streamChat()`.
4. Do NOT create a new file — `aiService.ts` is the single provider abstraction.

### Rules
- **Never hardcode prompts** in route handlers or chat logic.
- **Every AI call** must include `buildFullSystemPrompt()`.
- **Task prompts are additive** — they layer on top of Buddy's personality.
- **Prompt changes** only happen in `src/ai/prompts/`.
- **Provider abstraction**: `aiService.ts` handles provider selection; consumers only call `streamChat()`.

---

## 6. Voice Architecture

### Pipeline
```
Mic → VoiceRecorder (VAD) → AssemblyAI → DeepSeek → SpeechFormatter → Deepgram → VoicePlayer → loop
```

### Service Layer
```
vitejs/src/voice/          ← Frontend voice services (pure TS)
├── voiceState.ts          ← State machine types
├── voiceRecorder.ts       ← Mic capture + VAD
└── voicePlayer.ts         ← Audio playback

fastify/src/services/tts/  ← Backend TTS services
├── ttsRoutes.ts
├── deepgramService.ts
├── speechFormatter.ts
└── audioCache.ts
```

### Rules
- **Never bypass the orchestrator** — voice features use `VoiceRecorder` + `VoicePlayer`, not raw `getUserMedia`.
- **AudioContext must be resumed** after creation (`await audioCtx.resume()`).
- **Dispose before creating** — always destroy old recorder/player before creating new instances.
- **Cache TTS audio** — identical text should not trigger duplicate API calls.
- **Barge-in**: Stop playback immediately on new user speech.

---

## 7. Database Architecture

### Schema
```
fastify/src/db/
├── schema.ts    ← All table definitions (Drizzle pg-core)
└── client.ts    ← Database connection
```

### Tables (7)
- `users` — authentication, token balance, AI persona
- `conversations` — chat history
- `transactions` — micro-accounting ledger
- `documents` — uploaded document records
- `token_ledger` — token usage tracking
- `budgets` — AI-generated budget plans
- `feedback` — AI response ratings

### Conventions
- **Primary keys**: `uuid('id').primaryKey().defaultRandom()`
- **Foreign keys**: `.references(() => parentTable.id, { onDelete: 'cascade' })`
- **Timestamps**: `timestamp('name', { withTimezone: true }).notNull().defaultNow()`
- **JSONB**: `jsonb('field').$type<MyType>().notNull().default(...)`

### Rules
- **Never modify database manually** — use `drizzle-kit push`.
- **Schema changes** only in `schema.ts`.
- **Queries**: Prefer Drizzle ORM and query builder for normal application logic.

Raw SQL is allowed only when justified by:
- Performance optimization (query planner analysis showing Drizzle is the bottleneck).
- Complex queries (recursive CTEs, window functions, materialized views).
- PostgreSQL-specific features not yet supported by Drizzle.
- Migrations that require raw DDL.
- Reporting or analytics queries.

**Raw SQL Requirements:**
1. Document why Drizzle was insufficient with a `// Raw SQL justification:` comment block above the query. Example:
   ```typescript
   // Raw SQL justification:
   // Drizzle query builder cannot express this full-text ranking cleanly.
   // User input is parameterized through sql placeholders.
   const results = await app.db.execute(sql`...`);
   ```
2. Use parameterized queries only (`$1`, `$2`, etc. or Drizzle's `sql` template tag) — never concatenate user input.
3. Include comments explaining complex SQL logic.
4. Add the decision to `.ai/DECISIONS.md` if it introduces a major database pattern.
- **Transactions**: Use `app.db.transaction()` for multi-step operations.

---

## 8. Dependency Rules

### Import Directions (allowed)

```
vitejs/src/pages/        → vitejs/src/components/, vitejs/src/api.ts, vitejs/src/auth.ts
vitejs/src/components/   → vitejs/src/api.ts, vitejs/src/auth.ts, vitejs/src/voice/
vitejs/src/voice/        → vitejs/src/api.ts, vitejs/src/auth.ts (NO React)
fastify/src/modules/     → fastify/src/services/, fastify/src/db/, fastify/src/config.ts, fastify/src/ai/prompts/
fastify/src/services/    → fastify/src/config.ts
fastify/src/ai/prompts/  → fastify/src/db/ (for AiPersona type only)
```

### NOT Allowed
- Frontend importing backend code (and vice versa).
- `vitejs/src/voice/` importing React or JSX.
- `fastify/src/services/` importing route modules.
- Circular imports (A → B → A).

---

## 9. Feature Creation Pattern

When adding a new feature, follow this structure:

### Backend Feature
```
fastify/src/modules/<name>/
└── routes.ts              ← Route handlers

fastify/src/db/schema.ts   ← Add table (if needed)
fastify/src/app.ts         ← Register module
```

### Frontend Feature
```
vitejs/src/pages/<Name>.tsx          ← Page component
vitejs/src/components/<name>/        ← Reusable components (if needed)
vitejs/src/api.ts                    ← Add API methods
```

### Cross-Cutting Feature (both sides)
1. Backend: module → schema → register
2. Frontend: api methods → components → page integration
3. Verify: `pnpm typecheck` both sides

---

## 10. Error Handling Architecture

### Backend Error Format
```typescript
{ detail: "Human-readable message", request_id: "uuid" }
```

- Centralized in `plugins/error-handler.ts`.
- Maps Prisma errors to HTTP statuses: P2002→409, P2003→409, P2025→404.
- Validation errors → 422/400.
- Unknown errors → 500.

### Frontend Error Handling
- `api.ts` normalizes all errors to thrown `Error` objects.
- 401 → logout; 402 → token depleted notification.
- Components show errors via `useToast()` or inline messages.
- Never silently swallow errors — log + surface.

---

## 11. Configuration

### Backend (`fastify/src/config.ts`)
- TypeBox-validated schema.
- All env vars defined in one place.
- Access via `config.KEY_NAME` — never `process.env` directly.

### Frontend (`vitejs/.env`)
- `VITE_API_URL` — API base URL (empty in dev, proxied by Vite).
- No secrets in frontend env (they'd be exposed to browser).

### Secret Management
- `.env` is gitignored.
- `.env.example` is committed (template, no real values).
- API keys rotated immediately if exposed.

---

## 12. Performance Architecture

- **Streaming**: AI responses via SSE; audio via HTTP with caching.
- **Caching**: TTS audio cached in session (50 entries max, LRU eviction).
- **Lazy loading**: React Router code-splits pages.
- **Cleanup**: `useEffect` returns must clean up listeners, timers, streams.
- **Abort**: Use `AbortController` to cancel in-flight requests when superseded.
- **Memory**: Voice services disposed after call ends. Blob URLs let browser GC handle.

---

## 13. Testing Architecture

### Location
```
fastify/tests/    ← Backend tests (mirrors src/)
vitejs/tests/     ← Frontend tests (mirrors src/)
```
**Never** put tests inside `src/`.

### Verification Commands
```bash
cd fastify && pnpm typecheck   # TypeScript check
cd vitejs && pnpm typecheck    # TypeScript check
```

### What Must Be Tested
- New API routes: valid input, invalid input, auth, error cases.
- New frontend components: render, user interaction, error states.
- Voice services: recorder lifecycle, player lifecycle.

---

## 14. Refactoring Rules

Before any rename or structural change:

1. **Understand usage** — `git grep` the old name across the entire project.
2. **Search references** — check source code, docs (`.ai/`, `BUDDY.md`, `AGENTS.md`), config files.
3. **Update imports** — every file that imports the renamed module.
4. **Update docs** — `BUDDY.md`, `AGENTS.md`, skill files that reference the old name.
5. **Run verification** — `pnpm typecheck` in both directories.
6. **Commit atomically** — the rename and all import updates in one commit.

---

## 15. Architecture Decision Process

For any change that affects project structure, naming conventions, or cross-cutting patterns:

1. **Document in `.ai/DECISIONS.md`** — ID, date, decision, context, reason, alternatives, consequences, status.
2. **Update `.ai/CHANGELOG.md`** — record the change with files affected and impact.
3. **If a mistake was discovered** — add to `.ai/LESSONS.md`.
4. **If new conventions were established** — update relevant `.ai/skills/` files.

Never make structural changes without documenting them.
