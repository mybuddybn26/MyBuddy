# LESSONS.md â€” Project Lessons Learned

> Document recurring mistakes and rules learned so future AI agents avoid repeating them.

---

## Lesson 1: Use Provider-Neutral Names for Abstraction Layers

- **Date**: 2026-06-22
- **Category**: Naming / Architecture

**Problem**: The AI chat service module was named `claude.ts`, implying a dependency on Anthropic's Claude. The project actually uses DeepSeek V4 Flash as primary AI provider. This caused confusion and made the codebase misleading.

**Rule**: Name service modules by their responsibility, not their vendor.
- Prefer `aiService.ts` over `deepseek.ts` or `claude.ts`.
- Prefer `deepgramService.ts` over `elevenLabsService.ts` when the provider changes but the function is the same.
- Prefer `voiceRecorder.ts` over `assemblyAIRecorder.ts` â€” the interface should be provider-agnostic.

**Example**:
```typescript
// BAD: Vendor-specific name
import { streamChat } from './deepseek.js';

// GOOD: Responsibility-based name
import { streamChat } from './aiService.js';
```

---

## Lesson 2: Always Resume AudioContext After Creation

- **Date**: 2026-06-22
- **Category**: Voice / Browser APIs

**Problem**: Browsers create `AudioContext` in a suspended state. Calling `getByteFrequencyData()` on a suspended context returns zeros, breaking silence detection and waveform visualization.

**Rule**: Always `await audioCtx.resume()` after `new AudioContext()`.

**Example**:
```typescript
// CORRECT
const audioCtx = new AudioContext();
if (audioCtx.state === 'suspended') {
  await audioCtx.resume();
}
```

---

## Lesson 3: Never Revoke Cached Blob URLs

- **Date**: 2026-06-22
- **Category**: Voice / Performance

**Problem**: Calling `URL.revokeObjectURL()` on cached audio blob URLs poisons the cache. Subsequent reads silently fail because the blob URL is no longer valid.

**Rule**: Let the browser's garbage collector handle blob URL cleanup. Only revoke URLs that won't be reused.

---

## Lesson 4: Centralize AI Prompts â€” Never Hardcode

- **Date**: 2026-06-22
- **Category**: AI / Architecture

**Problem**: System prompts were embedded inside route handlers and chat logic, making it impossible to maintain a consistent personality. Each change required searching for hardcoded strings.

**Rule**: All AI prompts must live in `fastify/src/ai/prompts/`. Use `buildFullSystemPrompt()` as the single entry point. Buddy's personality is defined in exactly one file: `buddySystemPrompt.ts`.

---

## Lesson 5: Avoid pnpm-workspace.yaml in Standalone Packages

- **Date**: 2026-06-22
- **Category**: Build / Tooling

**Problem**: `pnpm-workspace.yaml` files made pnpm treat standalone packages as monorepo roots, requiring a `packages` field. This caused CI failures with "packages field missing or empty."

**Rule**: Remove `pnpm-workspace.yaml` from standalone packages. Use `.pnpmrc` for per-project pnpm configuration instead. Add `pnpm-workspace.yaml` to `.gitignore` to prevent accidental re-creation.

---

## Lesson 6: Lockfile Must Match Package.json Overrides

- **Date**: 2026-06-22
- **Category**: Build / CI

**Problem**: The `pnpm.overrides` field in `package.json` must match what's encoded in `pnpm-lock.yaml`. When they diverge, `pnpm install --frozen-lockfile` fails with "overrides configuration doesn't match."

**Rule**: Either remove the `pnpm.overrides` field or regenerate the lockfile after any change to it. In CI, `--frozen-lockfile` enforces strict matching.

---

## Lesson 7: Update All Imports When Renaming Files

- **Date**: 2026-06-22
- **Category**: Refactoring

**Problem**: Renaming a source file without updating all import statements breaks the build.

**Rule**: Use `git grep` to find every reference before renaming. Update imports in source code, documentation (`BUDDY.md`, `AGENTS.md`, skill files), and test files. Run `pnpm typecheck` after the rename.

---

## Lesson 8: Never Open Duplicate Development Servers

- **Date**: 2026-06-22
- **Category**: Development Workflow

**Problem**: Every time an AI agent restarts localhost, it opens new PowerShell windows. Old servers stay running on the same ports, causing conflicts. After multiple iterations, dozens of orphaned node processes accumulate.

**Rule**: Run `.\scripts\restart-dev.ps1` from the project root. This kills old processes on ports 3000/5173 before starting fresh servers in a single window. Never `Start-Process` a new terminal without closing the previous one.

**Correct**:
```powershell
.\scripts\restart-dev.ps1
```
**Incorrect**:
```powershell
Start-Process powershell -ArgumentList "pnpm dev"  # creates duplicate window
Get-Process -Name node | Stop-Process               # kills unrelated processes

---

## Lesson 10: Internal AI Cost Analytics Are Not User-Facing

- **Date**: 2026-06-23
- **Category**: Security / UX

**Problem**: The AI usage dashboard exposed DeepSeek token costs and provider pricing to normal users. This is business/internal data, not customer information.

**Rule**: Internal cost/profit analytics must never appear in normal user-facing UI. Create separate admin endpoints (ole === 'admin') for financial data. Users should only see feature usage counts.


---

## Lesson 11: Never Attach Global Feature State to Arbitrary Chat Messages

- **Date**: 2026-06-23
- **Category**: State Management / Architecture

**Problem**: The frontend's history loading code called `api.budgets()`, fetched ALL user budgets, and unconditionally attached the most recent budget to the last assistant message in chat. This caused budget cards to appear under messages about voice/tone/settings. The bug survived multiple fixes because only surface-level rendering guards were applied without tracing the data source.

**Rule**: Chat attachments (budgets, transactions, etc.) must be **message-scoped** and created only from **explicit backend events** (SSE `type: 'budget'`, etc.). Never attach global feature state (latest budget, latest transaction) to arbitrary chat messages. If data isn't tied to a specific message ID through a dedicated event, it does not belong on that message.

**Correct** â€” SSE event handler, attaches only to the message that generated it:
```typescript
if (data.type === 'budget') {
  setMessages((prev) => prev.map((m) =>
    m.id === assistantMsg.id ? { ...m, budgets: [budget] } : m
  ));
}
```

**Incorrect** â€” History loader, attaches latest global budget to last message:
```typescript
const latestBudget = await api.budgets();
lastAssistantMsg.budgets = [latestBudget];
```
---

## Lesson 12: Run ESLint, Prettier, and TypeScript Check Before Completing Backend Work

- **Date**: 2026-06-23
- **Category**: Quality Assurance

**Problem**: ESLint CI failed on empty catch {} blocks and unused variable assignments. These are caught by CI but waste time with re-push cycles.

**Rule**: Before reporting any backend task as complete, run:
1. 
px eslint . — 0 errors
2. 
px prettier --check . — all files formatted
3. pnpm typecheck — 0 errors

For frontend: 
px prettier --check . and pnpm typecheck (eslint optional).

Empty catch blocks must either handle the error with logging or have an inline comment explaining why they are intentionally ignored.
