# AGENTS.md — AI Coding Agent Instructions

> **This is the first file every AI agent must read before working on this project.**

---

## Required Reading Order

When starting ANY task on this project, read files in this exact order:

1. **AGENTS.md** (this file) — workflow and skill selection
2. **BUDDY.md** — project conventions, philosophy, lessons learned
3. **PROJECT.md** — project overview (if it exists)

Then, based on the task type, load the relevant skill files from `.ai/skills/`.

---

## Skill Selection

Determine the task category and load the matching skills automatically:

| Task Category | Skills to Load |
|---|---|
| **Backend / API** | `fastify.md` → `architecture.md` → `typescript.md` → `testing.md` → `security.md` |
| **Database / Schema** | `drizzle.md` → `fastify.md` → `typescript.md` |
| **Frontend / UI** | `ui.md` → `typescript.md` → `architecture.md` → `testing.md` |
| **Voice / Audio** | `voice.md` → `ai.md` → `architecture.md` |
| **AI / Prompts** | `ai.md` → `prompts.md` → `architecture.md` |
| **Security** | `security.md` → `architecture.md` |
| **Cross-cutting / Refactor** | `architecture.md` → `typescript.md` → `ui.md` → `fastify.md` |

When in doubt, load `architecture.md` and `typescript.md` as the minimum baseline.

---

## Context Proof (MANDATORY)

**Before answering any project-specific question or modifying any code, you MUST state what context you used.** This prevents guessing and proves you actually read the relevant files.

### Format

Begin every response with a Context Proof block:

```
Context Proof:
- Read: AGENTS.md
- Read: BUDDY.md
- Loaded skills: .ai/skills/ai.md, .ai/skills/typescript.md
- Inspected source files: src/ai/prompts/index.ts, src/modules/chat/claude.ts
- Assumptions: none
```

### Rules by Task Type

| Task Type | Minimum Required |
|---|---|
| **General question** | AGENTS.md + BUDDY.md. State: _"Project files not inspected because this is a general explanation."_ |
| **Architecture question** | AGENTS.md + BUDDY.md + relevant skill files + inspect source files. Source inspection is mandatory. |
| **Implementation** | AGENTS.md + BUDDY.md + skill files + inspect ALL affected source files. File inspection is mandatory. |
| **Bug fix** | AGENTS.md + BUDDY.md + skill files + inspect the broken file AND any related files. Source inspection is mandatory. |
| **UI change** | AGENTS.md + BUDDY.md + `.ai/skills/ui.md` + `.ai/skills/typescript.md` + inspect affected components. Design skill inspection is mandatory. |
| **Voice feature** | AGENTS.md + BUDDY.md + `.ai/skills/voice.md` + `.ai/skills/ai.md` + `.ai/skills/typescript.md` + `.ai/skills/testing.md`. All four skill files are mandatory. |
| **AI/prompt change** | AGENTS.md + BUDDY.md + `.ai/skills/ai.md` + `.ai/skills/prompts.md` + `.ai/skills/architecture.md`. |
| **Database change** | AGENTS.md + BUDDY.md + `.ai/skills/drizzle.md` + `.ai/skills/fastify.md` + `.ai/skills/typescript.md`. |

### Rules

1. **Never pretend** — if you haven't read a file, don't claim you did.
2. **General explanations** (no code) — state that source files were not inspected and explain why.
3. **Implementation tasks** — file inspection is mandatory. List every file you read.
4. **Architecture questions** — documentation inspection is mandatory.
5. **Bug fixes** — source-file inspection of the broken file is mandatory.
6. **UI changes** — design and UI skill inspection is mandatory.
7. **Voice features** — voice, AI, typescript, and testing skills must be loaded.
8. **Assumptions** — if you make any assumptions, state them explicitly with your reasoning.

### Examples

**For a general question (no code):**
```
Context Proof:
- Read: AGENTS.md, BUDDY.md
- Project files not inspected because this is a general explanation.
```

**For an implementation task:**
```
Context Proof:
- Read: AGENTS.md, BUDDY.md
- Loaded skills: .ai/skills/fastify.md, .ai/skills/typescript.md
- Inspected source files: src/modules/chat/routes.ts, src/ai/prompts/index.ts, src/db/schema.ts
- Assumptions: none
```

**For a bug fix:**
```
Context Proof:
- Read: AGENTS.md, BUDDY.md
- Loaded skills: .ai/skills/voice.md, .ai/skills/typescript.md
- Inspected source files: src/components/chat/SpeechControls.tsx, src/voice/voicePlayer.ts
- Assumptions: AudioContext is suspended (standard browser behavior)
```

---

## Workflow

Every task must follow this exact sequence:

```
0. State Context Proof (MANDATORY — see section above)
       ↓
1. Read AGENTS.md (this file)
       ↓
2. Read BUDDY.md
       ↓
3. Determine task category
       ↓
4. Load matching skills from .ai/skills/
       ↓
5. Analyze existing code (read affected files)
       ↓
6. Search for reusable patterns (grep for similar implementations)
       ↓
7. Think carefully — consider edge cases, multiple approaches
       ↓
8. Implement the solution
       ↓
9. Verify:
   - pnpm typecheck in fastify/ (0 errors)
   - pnpm typecheck in vitejs/ (0 errors)
   - No broken imports
   - Existing functionality preserved
   - All Definition of Done items checked
       ↓
10. Report completion
```

---

## Core Behavior

As an AI coding agent working on this project, you MUST:

1. **Think before coding** — analyze, search, identify, consider, then implement.
2. **Never skip requested features** — implement everything the user asks for.
3. **Never create placeholder code or TODO comments.**
4. **Never fabricate** — no invented APIs, packages, or capabilities.
5. **Never break existing functionality.**
6. **Always verify before reporting completion.**
7. **Treat project documentation as permanent memory.**

---

## Documentation Hierarchy

```
AGENTS.md          ← Master workflow (this file)
    ↓
BUDDY.md           ← Project conventions and memory
    ↓
.ai/skills/        ← Reusable engineering skills
    ├── architecture.md
    ├── typescript.md
    ├── fastify.md
    ├── drizzle.md
    ├── ui.md
    ├── voice.md
    ├── ai.md
    ├── prompts.md
    ├── testing.md
    └── security.md
```

---

## Verification

Before reporting ANY task as complete:

```bash
cd fastify && pnpm typecheck   # 0 errors required
cd vitejs && pnpm typecheck    # 0 errors required
```

Plus:
- No broken imports
- No unused files
- No duplicate code
- Existing features still work

---

## Quick Reference

| Need | Where |
|---|---|
| Backend route pattern | `.ai/skills/fastify.md` |
| Database schema pattern | `.ai/skills/drizzle.md` |
| Frontend component pattern | `.ai/skills/ui.md` |
| Voice pipeline | `.ai/skills/voice.md` |
| AI prompt system | `.ai/skills/ai.md` + `.ai/skills/prompts.md` |
| TypeScript conventions | `.ai/skills/typescript.md` |
| Security rules | `.ai/skills/security.md` |
| Project file structure | `BUDDY.md` |
| Lessons learned | `BUDDY.md` § Lessons Learned |
| Architecture decisions | `BUDDY.md` § ADR |
| Definition of Done | `BUDDY.md` § Definition of Done |
