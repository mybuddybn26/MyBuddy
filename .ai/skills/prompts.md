# Prompts

> For the complete prompt specification, architecture, task types, safety rules, and verification checklist, see `.ai/PROMPTS.md`.

## Location

All AI prompts: `fastify/src/ai/prompts/`

## Architecture

```
index.ts                    ← Orchestrator: buildFullSystemPrompt(persona, task?)
buddySystemPrompt.ts        ← Buddy's core personality (SINGLE SOURCE OF TRUTH)
speechPrompt.ts             ← Rules for TTS-optimized text
documentAnalysisPrompt.ts   ← How to analyze uploaded documents
translationPrompt.ts        ← Translation instructions
financialAssistantPrompt.ts ← Budget/finance domain instructions
codingAssistantPrompt.ts    ← Coding assistance instructions
```

## How It Works

1. `buildFullSystemPrompt({ persona, task? })` constructs the full system prompt.
2. Base layer is always `buddySystemPrompt(persona)`.
3. If a `task` is specified, the relevant task prompt is appended.
4. The combined prompt is sent as the system message in every AI request.

## Adding a New Task

1. Create `fastify/src/ai/prompts/newTaskPrompt.ts`.
2. Export the prompt string.
3. In `index.ts`: add to `TaskType` union, add case to `buildTaskPrompt()`.

## Speech Formatting

- `speechFormatter.ts` in `fastify/src/services/tts/` handles programmatic cleaning.
- `speechPrompt.ts` contains the rule set for AI-to-TTS optimization.
- These work together: the prompt tells the AI how to format, the formatter enforces it.

## Key Rules

- **Never hardcode prompts** in route handlers or API calls.
- **Buddy's personality lives in ONE file** — edit only `buddySystemPrompt.ts`.
- **Task prompts are additive** — they extend, never replace, the base personality.
- **Speech formatting is separate** from chat formatting.

## Common Mistakes

- Hardcoding system prompt strings in `aiService.ts` or route files.
- Duplicating personality content across multiple files.
- Not using `buildFullSystemPrompt()` in new AI features.

## Verification

- [ ] No prompt strings outside `src/ai/prompts/`
- [ ] `buildFullSystemPrompt()` used in every AI call
- [ ] Personality changes only in `buddySystemPrompt.ts`
