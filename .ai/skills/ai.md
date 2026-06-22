# AI Integration

## Providers

- **LLM**: DeepSeek V4 Flash (primary), Ollama (fallback)
- **STT**: AssemblyAI (primary), Groq (fallback)
- **TTS**: Deepgram (primary)

## Centralized Prompts

All AI prompts live in `fastify/src/ai/prompts/`. Never hardcode prompts.

```
index.ts          ← buildFullSystemPrompt(persona, task?)
buddySystemPrompt.ts ← Buddy's personality (single source of truth)
speechPrompt.ts
documentAnalysisPrompt.ts
translationPrompt.ts
financialAssistantPrompt.ts
codingAssistantPrompt.ts
```

## Chat Flow

1. `POST /api/chat` — receives message + history
2. `streamChat(messages, persona, task?)` — builds system prompt + calls AI
3. `buildMessages()` — wraps in [system, ...history, user] format
4. SSE stream returned to frontend
5. Budget/transaction blocks extracted and saved

## Prompt Structure

Every AI request sends: `[system prompt] + [conversation history] + [user message]`

System prompt = `buddySystemPrompt(persona)` + optional `taskPrompt`.

## Adding a New Task Prompt

1. Create file in `fastify/src/ai/prompts/`.
2. Export the prompt string.
3. Add to `TaskType` union in `index.ts`.
4. Add case to `buildTaskPrompt()`.

## Key Rules

- Buddy's personality is in `buddySystemPrompt.ts` ONLY.
- Every AI call must include the system prompt.
- Task prompts are additive — layer on top of personality.
- Never hardcode prompt strings in route handlers.

## Common Mistakes

- Hardcoding prompts in route handlers or chat logic.
- Bypassing `buildFullSystemPrompt()`.
- Not passing `persona` to prompt builders.

## Verification

- [ ] No hardcoded prompt strings outside `src/ai/prompts/`
- [ ] Every AI call uses `buildFullSystemPrompt()`
- [ ] Task prompts are modular and additive
