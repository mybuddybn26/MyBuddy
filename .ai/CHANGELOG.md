# CHANGELOG.md — Project Change History

> Track important project changes so future AI agents understand what changed and why.

---

## 2026-06-22

### Created: ARCHITECTURE.md
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
