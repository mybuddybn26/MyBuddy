# LESSONS.md — Project Lessons Learned

> Document recurring mistakes and rules learned so future AI agents avoid repeating them.

---

## Lesson 1: Use Provider-Neutral Names for Abstraction Layers

- **Date**: 2026-06-22
- **Category**: Naming / Architecture

**Problem**: The AI chat service module was named `claude.ts`, implying a dependency on Anthropic's Claude. The project actually uses DeepSeek V4 Flash as primary AI provider. This caused confusion and made the codebase misleading.

**Rule**: Name service modules by their responsibility, not their vendor.
- Prefer `aiService.ts` over `deepseek.ts` or `claude.ts`.
- Prefer `deepgramService.ts` over `elevenLabsService.ts` when the provider changes but the function is the same.
- Prefer `voiceRecorder.ts` over `assemblyAIRecorder.ts` — the interface should be provider-agnostic.

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

## Lesson 4: Centralize AI Prompts — Never Hardcode

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
