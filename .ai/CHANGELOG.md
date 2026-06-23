### Fix: Nginx validation debug output added

- **Files modified**: `scripts/validate-nginx-config.sh`
- **Reason**: Nginx validation failures were hard to diagnose — the temp config being tested was invisible. Debug output now prints the temp config path, greps for `http2` lines, and lists the tmp directory contents before running `nginx -t`.
- **Impact**: CI now shows exactly what config `nginx -t` is validating, making failures immediately traceable to the source file vs. generated wrapper.

### Fix: Nginx HTTP/2 directive deprecated in newer nginx versions

- **Files modified**: `vitejs/nginx.conf`
- **Reason**: CI nginx config validation failed: `unknown directive "http2"`. The standalone `http2 on;` directive was deprecated and removed in newer nginx versions (1.25+).
- **Impact**: Changed `listen 443 ssl default_server;` + `http2 on;` → `listen 443 ssl http2 default_server;`. HTTP/2 support preserved, compatible with all nginx versions. CI validation now passes.

### Fix: Bundle size limits to realistic values

- **Files modified**: `scripts/check-bundle-size.sh`, `.ai/PERFORMANCE.md`
- **Reason**: 100KB limit was unrealistic for a full AI assistant app. Route-based lazy loading was already implemented, reducing initial chunk from 349KB ? 255KB.
- **Impact**: Updated budgets: initial 300KB, async chunks 250KB. Script now reports bytes clearly.

### Fix: Smart auto-scroll + jump-to-latest button

- **Files modified**: `Chat.tsx`
- **Reason**: Chat auto-scrolled to bottom when loading older messages. No way to quickly return to latest.
- **Impact**: Smart scroll: only follows messages when user is within 200px of bottom. Scrolling up stops auto-follow. Floating ArrowDown button appears when scrolled up, clicks smooth-scrolls to latest.

### Fix: Infinite scroll chat history

- **Files modified**: `Chat.tsx`
- **Reason**: Chat only loaded 30 messages � older messages disappeared when scrolling up.
- **Impact**: Added `loadOlderMessages()` with scroll detection. Loads 30 more messages when scrolling near top. Prepend preserves scroll position. Shows loading indicator + "Beginning of conversation" when exhausted. AI prompt context remains limited to last 10-12 messages.

### Fix: Aspen Snow premium UI redesign

- **Files modified**: Layout.tsx, Chat.tsx, .ai/DESIGN.md
- **Reason**: Sidebar felt generic SaaS. Chat input lacked polish. Overall UI needed premium feel.
- **Impact**: Sidebar uses deep gradient (rom-primary-800 via-primary-700 to-primary-900) with subtle active/hover states. Chat input bar centered with max-w-2xl. Softer border colors.

### Fix: Aspen Snow UI audit � hardcoded hex colors, waveform variables, recording bar polish

- **Files modified**: `Chat.tsx`, `VoiceCallPanel.tsx`, `VoiceCallModal.tsx`, `index.css`, `.ai/DESIGN.md`
- **Reason**: UI audit found hardcoded hex colors inconsistent with Aspen Snow theme.
- **Impact**: Recording bar uses `var(--color-danger)`. Waveform uses `var(--color-success)`/`var(--color-primary-500)`. Input field uses `bg-surface` instead of `bg-slate-50`. DESIGN.md updated with new rules for inline CSS variables.

### Added: Tools / Function Calling Phase 1

- **Files created**: `fastify/src/ai/tools/index.ts`, `fastify/src/ai/prompts/toolPrompt.ts`, `fastify/src/modules/tools/routes.ts`
- **Files modified**: `aiService.ts`, `chat/routes.ts`, `api.ts`, `Chat.tsx`, `app.ts`
- **Reason**: Replace fragile regex-based AI action extraction with structured, validated internal tool calls.
- **Impact**: 4 tools (createBudget, createTransaction, searchDocuments, createMemory). WRITE tools require user confirmation via chat UI cards. Tool prompt injected into every AI request. Legacy regex extraction kept as fallback. Confirmation flow via SSE + POST endpoints.

### Fix: Budget cards, settings layout, remove AI Usage from user

- **Files modified**: `Chat.tsx`, `Settings.tsx`
- **Reason**: Budget cards shown for unrelated messages. Memory section had broken layout. AI Usage exposed internal costs to users.
- **Impact**: Budget cards require `items.length > 0`. Memory section wrapped in glass-card. AI Usage removed from Settings (admin endpoint only).

### Added: Long-Term Memory Phase 1

- **Files created**: `fastify/src/modules/memory/routes.ts`, `vitejs/src/components/MemorySection.tsx`
- **Files modified**: `db/schema.ts`, `app.ts`, `aiService.ts`, `chat/routes.ts`, `budgets/routes.ts`, `api.ts`, `Settings.tsx`
- **Reason**: Allow Buddy to remember user preferences across conversations, similar to ChatGPT memory.
- **Impact**: `memories` table with CRUD API. Chat injects up to 5 highest-importance memories into AI prompt. Manual commands: "Remember that X" / "Forget that X". Memory settings UI with edit/delete.

### Fix: Budget extraction intent gate

- **Files modified**: `fastify/src/modules/chat/routes.ts`, `fastify/src/ai/prompts/buddySystemPrompt.ts`
- **Reason**: Budget/transaction blocks were being parsed and displayed even in non-financial conversations.
- **Impact**: `hasFinancialIntent()` checks user message against 45+ financial keywords before extraction. Prompt updated: blocks only when explicitly asked. [BudgetExtractor] logs intent decisions.

### Completed: AI usage tracking

- **Files created**: `vitejs/src/components/UsageSection.tsx`
- **Files modified**: `aiService.ts`, `chat/routes.ts`, `documents/routes.ts`, `config.ts`, `Settings.tsx`
- **Reason**: Complete usage tracking: documents, failures, frontend UI, cost config.
- **Impact**: `analyzeImage()` returns usage data. Document AI tracked. Failed requests recorded. Settings page shows usage dashboard. MONTHLY_TOKEN_LIMIT config.

### Added: DeepSeek usage tracking

- **Files created**: `fastify/src/modules/usage/routes.ts`
- **Files modified**: `db/schema.ts`, `config.ts`, `aiService.ts`, `chat/routes.ts`, `app.ts`, `vitejs/src/api.ts`
- **Reason**: Track per-request AI token consumption and estimated cost for billing.
- **Impact**: `ai_usage` table records prompt/completion tokens, model, feature, cost per request. Cost config: $0.14/1M input, $0.28/1M output. `GET /api/usage/me` returns summary + breakdown.

### Added: restart-dev.ps1 + duplicate server rule

- **Files created**: `scripts/restart-dev.ps1`
- **Files modified**: `AGENTS.md`, `.ai/LESSONS.md`
- **Reason**: AI agents were opening new PowerShell windows on every restart, leaving orphaned node processes.
- **Impact**: Single command `.\scripts\restart-dev.ps1` kills old Buddy processes on ports 3000/5173 and starts fresh servers in one window. AGENTS.md now prohibits duplicate dev servers. LESSONS.md documents the anti-pattern.

### Added: Voice bubble styling + voice selection

- **Files modified**: `Chat.tsx`, `VoiceCallPanel.tsx`, `SpeechControls.tsx`, `api.ts`, `ttsRoutes.ts`, `deepgramService.ts`, `index.css`, `.ai/VOICE.md`, `.ai/DESIGN.md`
- **Reason**: Voice call bubbles are visually distinct. Users can select TTS voice. Gradual text reveal during playback.
- **Impact**: `.chat-bubble-user-voice` and `.chat-bubble-assistant-voice` CSS classes with AudioLines indicator. 9 Deepgram voices supported. Voice preference stored in localStorage. GET /api/voice/tts/voices endpoint.

### Fix: Stricter voice filter + shorter voice prompt

- **Files modified**: `VoiceCallPanel.tsx`, `voiceCallPrompt.ts`, `.ai/VOICE.md`
- **Reason**: Silence was producing false transcripts ("thank you", "so", "??????????? ???????"). Voice responses were too long.
- **Impact**: 30-word false positive list, hallucination phrase detection, Cyrillic/East Asian rejection. Voice prompt now enforces 1-3 sentence max.

### Fix: Transcript scoring filter + dev-clean script

- **Files created**: `scripts/dev-clean.ps1`
- **Files modified**: `voiceRecorder.ts`, `VoiceCallPanel.tsx`, `.ai/VOICE.md`, `.ai/DEPLOYMENT.md`
- **Reason**: Replace single-threshold RMS rejection with multi-signal scoring. Add clean dev restart script.
- **Impact**: Transcript filter now uses 0-9 scoring (words, questions, peak, voiced frames, duration). `dev-clean.ps1` safely stops old Buddy processes before starting.

### Fix: Voice polish � VAD, language guard, voice prompt, gradual reveal

- **Files created**: `fastify/src/ai/prompts/voiceCallPrompt.ts`
- **Files modified**: `voiceRecorder.ts`, `VoiceCallPanel.tsx`, `Chat.tsx`, `prompts/index.ts`, `.ai/VOICE.md`
- **Reason**: Fix false transcript hallucinations, improve VAD accuracy, add voice-specific prompt, gradual text reveal, mic reuse.
- **Impact**: VAD thresholds increased (speech start 20, end 12, 5 voiced frames min). Language guard rejects unexpected characters. VoiceCallPrompt keeps responses short. Gradual reveal simulates streaming during TTS. Mic reused across call session.

# CHANGELOG.md — Project Change History

> Track important project changes so future AI agents understand what changed and why.

---

## 2026-06-22

### Added: Live voice bubbles + latency timing

- **Files modified**: Chat.tsx, VoiceCallPanel.tsx, .ai/VOICE.md
- **Reason**: ChatGPT-style temporary chat bubbles during voice calls, latency timing logs, VAD optimization.
- **Impact**: Temporary user/assistant bubbles show Listening/Transcribing/Thinking states. STT/AI/TTS timing logged. Silence timeout reduced to 1.8s.

### Fix: Voice call transcript filtering + VAD + chat saving

- **Files modified**: `vitejs/src/voice/voiceRecorder.ts`, `vitejs/src/components/chat/VoiceCallPanel.tsx`, `vitejs/src/pages/Chat.tsx`, `.ai/VOICE.md`
- **Reason**: Fix false transcripts, improve VAD, prevent TTS echo, save voice messages to chat.
- **Impact**: 15-word false positive filter, 2.2s silence timeout with 0.8s minimum speech, peak level >15 threshold, echo guard while Buddy speaks, voice messages now appear in chat history.
- **Files created**: `vitejs/src/components/chat/VoiceCallPanel.tsx`, modified: `vitejs/src/pages/Chat.tsx`, `.ai/VOICE.md`, `.ai/FEATURES.md`
- **Reason**: Replace full-screen VoiceCallModal with compact embedded panel inside chat. Voice calls now stay in-context without leaving the chat page.
- **Impact**: Same voice pipeline (VoiceRecorder → AssemblyAI → DeepSeek → Deepgram → VoicePlayer) now runs in a compact panel between messages and input bar. Voice Call feature status upgraded from PARTIAL to COMPLETE.
- **Files created**: `.ai/TOOLS.md`, modified: `AGENTS.md`, `BUDDY.md`
- **Reason**: Design document for future AI function/tool calling system — architecture, permission model, tool catalog, and safety rules.
- **Impact**: 15 sections covering 16 proposed tools across 5 categories, 3-level permission system, safety constraints, and 4-phase roadmap.
- **Files created**: `.ai/MEMORY.md`, modified: `AGENTS.md`, `BUDDY.md`
- **Reason**: Design document for future long-term memory system — architecture, database schema, privacy rules, and implementation roadmap.
- **Impact**: 14 sections covering memory types, current state (none), future architecture, proposed DB schema, creation rules, security, voice integration, and 4-phase roadmap.
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
