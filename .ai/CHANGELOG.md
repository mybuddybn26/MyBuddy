# CHANGELOG.md — Project Change History

> Track important project changes so future AI agents understand what changed and why.

---

## 2026-06-22

### Created: FEATURES.md
- **Files created**: `.ai/FEATURES.md`, modified: `AGENTS.md`, `BUDDY.md`
- **Reason**: Permanent feature catalog — every user-facing feature documented with status, location, APIs, dependencies, and completion checklist.
- **Impact**: 16 sections covering all 13 features with COMPLETE/PARTIAL/PLANNED statuses, feature dependency map, and feature completion checklist.
- **Files created**: `.ai/ROADMAP.md`, modified: `AGENTS.md`, `BUDDY.md`
- **Reason**: Define long-term vision, feature direction, and priorities so future agents align implementation with product goals.
- **Impact**: 12 sections covering vision, principles, all 12 current features with statuses, short/medium/long-term plans, priority system, technical roadmap, and feature evaluation framework.
- **Files created**: `.ai/DEPLOYMENT.md`, modified: `AGENTS.md`, `BUDDY.md`
- **Reason**: Permanent deployment specification — Docker architecture, env vars, build process, security checklist, and production readiness assessment.
- **Impact**: 14 sections covering Docker Compose services, all required env vars, build/deploy commands, file storage, SSL, rollback plan, and 5 documented production gaps.
- **Files created**: `.ai/TESTING.md`, modified: `AGENTS.md`, `BUDDY.md`, `.ai/skills/testing.md`
- **Reason**: Permanent verification specification — defines what "done" means, documents all real commands, and provides domain-specific checklists.
- **Impact**: 15 sections with all real CLI commands, 4-level verification matrix, voice-specific 9-item checklist, and 7 documented testing gaps with severity ratings.
- **Files created**: `.ai/PERFORMANCE.md`, modified: `AGENTS.md`, `BUDDY.md`
- **Reason**: Permanent performance specification — streaming, caching, memory management, database optimization, bundle performance, and latency targets.
- **Impact**: 12 sections covering frontend, chat, AI cost, voice latency (<2s target), database, documents, API, memory, bundle, and monitoring. Documented 3 voice bottlenecks and 2 database risks.
- **Files created**: `.ai/SECURITY.md`, modified: `AGENTS.md`, `BUDDY.md`, `.ai/skills/security.md`
- **Reason**: Permanent security specification — data classification, threat model, gap analysis, and verification checklist.
- **Impact**: 17 sections covering data classification (8 types), auth, authz, secrets, API security, upload safety, document/voice/financial security, threat model (10 threats), and 9 documented security gaps with severity ratings.
- **Files created**: `.ai/API.md`, modified: `AGENTS.md`, `BUDDY.md`, `.ai/skills/fastify.md`
- **Reason**: Permanent API contract — every endpoint documented with method, path, purpose, auth, request/response formats, and source file.
- **Impact**: 16 sections covering 38 endpoints across 12 modules. Backend/API skill selection now includes API.md.
- **Files created**: `.ai/DATABASE.md`, modified: `AGENTS.md`, `BUDDY.md`, `.ai/skills/drizzle.md`
- **Reason**: Permanent database specification — every table documented with purpose, columns, relationships, and usage. Migration rules, query patterns, security, and performance guidance.
- **Impact**: 15 sections covering all 7 tables with full schema details. Database skill selection now includes DATABASE.md.
- **Files created**: `.ai/PROMPTS.md`, modified: `AGENTS.md`, `BUDDY.md`, `.ai/skills/prompts.md`
- **Reason**: Permanent specification for the AI prompt system — Buddy's personality, task prompts, speech formatting, safety rules, and verification.
- **Impact**: 15 sections documenting every prompt file, how tasks are selected, how to add new prompts, injection safety, and testing. AI/prompt skill selection now includes PROMPTS.md.
- **Files created**: `.ai/VOICE.md`, modified: `AGENTS.md`, `BUDDY.md`, `.ai/skills/voice.md`
- **Reason**: Permanent engineering specification for the entire voice system — pipeline, state machine, providers, latency targets, verification checklist.
- **Impact**: 19 sections covering philosophy, modes, session manager, state machine, complete pipeline, mic rules, waveform, STT, AI, TTS, interruptions, latency, UI, errors, privacy, debugging, and file map. Voice skill selection now includes VOICE.md.
- **Files created**: `.ai/DESIGN.md`, modified: `AGENTS.md`, `.ai/skills/ui.md`
- **Reason**: Centralize Buddy's visual identity, color system, typography, spacing, icon mappings, component patterns, chat UI, voice UI, animations, accessibility, and design anti-patterns in one authoritative document.
- **Impact**: 18 sections covering every visual aspect. Future UI tasks must consult DESIGN.md. UI skill selection now includes DESIGN.md.
- **Files modified**: `.ai/ARCHITECTURE.md`, `.ai/skills/drizzle.md`, `.ai/skills/security.md`
- **Reason**: Replaced absolute "no raw SQL" rule with a nuanced policy: prefer Drizzle, raw SQL allowed when justified (performance, complex queries, PG-specific features). Added mandatory parameterized queries for SQL injection prevention.
- **Impact**: Raw SQL now requires: documented justification, parameterized queries only, comments explaining logic, DECISIONS.md entry for major patterns.
- **Files created**: `.ai/ARCHITECTURE.md`
- **Files modified**: `AGENTS.md`
- **Reason**: Define codebase structure rules, dependency rules, and feature creation patterns so future agents build consistently.
- **Impact**: 15 sections covering philosophy, structure, frontend/backend/AI/voice/database architecture, dependency rules, error handling, performance, testing, and refactoring.
- **Files created**: `.ai/PROJECT.md`
- **Files modified**: `AGENTS.md`
- **Reason**: Provide a single high-level overview covering product, architecture, features, and development workflow.
- **Impact**: Future AI agents now read PROJECT.md for medium/large tasks to understand what Buddy is and how systems fit together.

### Renamed: `claude.ts` → `aiService.ts`

- **Files affected**: `fastify/src/modules/chat/claude.ts` (renamed), `chat/routes.ts`, `budgets/routes.ts`, `documents/routes.ts`, `BUDDY.md`, `AGENTS.md`, `.ai/skills/prompts.md`
- **Reason**: Provider-neutral naming. DeepSeek is the current AI provider; the filename should describe responsibility, not vendor.
- **Impact**: Zero behavioral changes. Only import paths updated.

### Created: AI Operating System (`.ai/` directory)

- **Files created**: `AGENTS.md`, `.ai/skills/` (10 skill files), `.ai/DECISIONS.md`, `.ai/CHANGELOG.md`, `.ai/LESSONS.md`
- **Reason**: Provide permanent project memory so every AI coding agent has consistent context.
- **Impact**: Future AI agents now load skill files based on task type before implementing changes.

### Created: Buddy AI Prompt Architecture

- **Files created**: `fastify/src/ai/prompts/` (7 files)
- **Files modified**: `fastify/src/modules/chat/aiService.ts` (removed inline `buildSystemPrompt`)
- **Reason**: Centralize all AI prompts in one location. Buddy's personality is now a single source of truth.
- **Impact**: All AI calls now use `buildFullSystemPrompt()`. Changing personality requires editing only `buddySystemPrompt.ts`.

### Added: Voice Conversation Mode

- **Files created**: `vitejs/src/voice/` (3 files), `vitejs/src/components/chat/VoiceCallModal.tsx`, `vitejs/src/components/chat/MessageActions.tsx`, `vitejs/src/components/chat/SpeechControls.tsx`, `vitejs/src/components/chat/CopyButton.tsx`, `vitejs/src/components/chat/FeedbackDialog.tsx`
- **Files modified**: `vitejs/src/pages/Chat.tsx`, `vitejs/src/api.ts`
- **Reason**: ChatGPT-style voice conversation with continuous two-way flow using AssemblyAI STT, DeepSeek AI, and Deepgram TTS.
- **Impact**: Input bar layout changed to `[Camera] [Message] [Mic] [Phone]`. TTS now goes through `/api/voice/tts/speak` with speech formatting and caching.

### Added: Feedback System

- **Files created**: `fastify/src/modules/feedback/routes.ts`
- **Files modified**: `fastify/src/db/schema.ts` (added `feedback` table), `fastify/src/app.ts`
- **Reason**: Users can rate AI responses (like/dislike) with detailed feedback for bad responses.
- **Impact**: Retractable voting with `POST /api/feedback` and `DELETE /api/feedback` endpoints.
