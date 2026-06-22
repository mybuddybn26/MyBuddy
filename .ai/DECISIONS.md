# DECISIONS.md — Architecture Decision Records

> Read this file before making architectural changes. Update it after every significant decision.

---

## ADR-001: Provider-Neutral AI Service Architecture

- **ID**: ADR-001
- **Date**: 2026-06-22
- **Status**: Accepted

### Decision

Renamed `fastify/src/modules/chat/claude.ts` to `aiService.ts`.

### Context

The original filename `claude.ts` was a legacy name from when the project may have used Anthropic's Claude. Buddy currently uses DeepSeek V4 Flash as the primary AI provider, with Ollama as a local fallback.

### Reason

AI service module names should describe their responsibility (providing AI chat/streaming), not their vendor. This makes the codebase self-documenting and simplifies adding or swapping AI providers in the future.

### Alternatives Considered

1. **Keep `claude.ts`** — misleading, implies Anthropic dependency.
2. **Rename to `deepseek.ts`** — same problem if the provider changes.
3. **Rename to `llmService.ts`** — too generic, doesn't indicate chat-specific functionality.
4. **Rename to `chatProvider.ts`** — reasonable alternative, but `aiService.ts` is shorter and already used in the chat module directory.

### Consequences

- Three source imports updated: `chat/routes.ts`, `budgets/routes.ts`, `documents/routes.ts`.
- Three documentation files updated: `BUDDY.md`, `AGENTS.md`, `.ai/skills/prompts.md`.
- No behavioral changes — the module's public API (`streamChat`, `analyzeImage`) remains unchanged.
