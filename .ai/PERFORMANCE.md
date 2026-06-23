# PERFORMANCE.md — Buddy Performance Engineering Specification

> **Permanent performance specification for Buddy.**
> Every optimization, caching decision, and performance-sensitive change must follow this document.

---

## 1. Performance Philosophy

- **Fast by default** — every interaction should feel instant.
- **Stream whenever possible** — AI, voice, and large responses should stream incrementally.
- **Avoid unnecessary work** — don't compute what isn't displayed; don't fetch what isn't needed.
- **Optimize user experience first** — perceived latency matters more than absolute backend speed.
- **Measure before complex optimization** — don't add complexity without proving a bottleneck exists.

---

## 2. Frontend Performance

### React Rendering
- **State colocation**: Keep state as close to usage as possible — don't lift state unnecessarily.
- **useCallback/useMemo**: Use for expensive computations and stable callback references passed to child components.
- **Avoid unnecessary re-renders**: Stable references via `useCallback` prevent child re-renders.

### Lazy Loading
- **Route splitting**: React Router code-splits pages automatically.
- **Dynamic imports**: Voice services and heavy utilities loaded via `await import()` at call time, not at bundle load (e.g., `ensureFreshToken` in SpeechControls).

### Effects Cleanup
- Every `useEffect` with subscriptions/timers must return a cleanup function.
- `VoiceRecorder` and `VoicePlayer` have explicit `dispose()` and `stop()` methods.
- Cleanup on unmount prevents memory leaks.

### Bundle
- **Vite** handles tree-shaking automatically.
- **Tailwind** purges unused classes in production.
- **No large libraries** should be added without explicit justification.

---

## 3. Chat Performance

### SSE Streaming
- AI responses stream via Server-Sent Events — user sees text as it's generated.
- Each `data:` chunk updates only the relevant message in state.
- Budget blocks arrive as separate SSE events and append without re-rendering the full message list.

### History Loading
- `GET /api/chat/history?limit=30` — only loads recent messages on mount.
- Pagination supported via `limit` and `offset` query params (max 100).
- Messages loaded once on mount; subsequent messages added incrementally.

### Message Rendering
- Only the streaming message re-renders during response — other messages are stable.
- Strip operations (`stripTransactionBlocks`, `stripBudgetBlocks`) are fast string replacements.

---

## 4. AI Cost Performance

### Token Optimization
- **DeepSeek V4 Flash** used by default — cost-effective and fast.
- **Ollama** is local fallback only — never used if DeepSeek is available.
- Conversation history limited to last 10-12 messages to keep context manageable.

### Prompt Efficiency
- System prompt constructed once per request via `buildFullSystemPrompt()`.
- Task prompts only appended when task type is not `'general'`.
- No redundant system messages duplicated in history.

### Future Optimization
- Implement token usage tracking per conversation to identify expensive patterns.
- Consider compressing conversation history for long sessions.

---

## 5. Voice Performance

### Latency Target
- **Under 2 seconds** from end-of-speech to start of Buddy's response.

### Current Optimizations
| Step | Optimization |
|---|---|
| Microphone capture | AudioContext + AnalyserNode for real-time VAD |
| Silence detection | 1.5s timeout, configurable |
| STT (AssemblyAI) | HTTP upload → poll (adequate for short clips) |
| AI (DeepSeek) | SSE streaming — text appears incrementally |
| TTS (Deepgram) | HTTP request, full buffer returned |
| Audio playback | VoicePlayer with immediate play on blob receive |
| Caching | TTS audio cached in-memory (50 entries, LRU eviction) |

### Bottlenecks (documented for future work)
- **STT not streaming**: AssemblyAI uses batch upload + poll. WebSocket streaming would reduce latency.
- **TTS not streaming**: Full audio buffer received before playback begins. Chunked streaming would allow immediate playback.
- **Full response before TTS**: DeepSeek streams text, but TTS waits for complete response. Streaming TTS could begin mid-sentence.

---

## 6. Database Performance

### Current Patterns
| Pattern | Implementation |
|---|---|
| Pagination | `LIMIT` + `OFFSET` on chat history, documents, budgets |
| Connection pool | `pg.Pool` with default settings |
| Insert optimization | `.returning()` avoids follow-up SELECT |
| Indexes | Auto-created for PKs and FKs |

### Rules
- **Use indexes** for frequently queried columns (e.g., `(user_id, created_at)` on conversations at scale).
- **Avoid N+1 queries** — use `.returning()` after insert/update.
- **Paginate large results** — never `SELECT *` without LIMIT.
- **Select only needed columns** — Drizzle's `.select()` can specify columns.
- **Monitor slow queries** — no query logging configured currently (future improvement).

### Current Risk
- Chat history queries `conversations` ordered by `created_at DESC` with no composite index on `(user_id, created_at)`. At scale (>100k messages), this will slow down.

---

## 7. Document Processing Performance

- **File size limit**: `MAX_FILE_SIZE_MB` (default 10MB) prevents oversized uploads.
- **Analysis is on-demand**: Only runs when user explicitly requests via `POST /api/documents/:id/analyze`.
- **AI analysis results cached** in database — not re-analyzed on subsequent views.

### Gaps
- No image compression before analysis — large images waste bandwidth.
- No analysis result caching in-memory — repeated requests re-query DB.

---

## 8. API Performance

### Timeouts
- **Chat SSE**: No explicit timeout — connection stays open until response completes.
- **AssemblyAI**: 30s timeout via AbortController.
- **TTS**: 30s timeout via AbortController.

### Request Deduplication
- `processingRef` in VoiceCallModal prevents duplicate AI requests during voice calls.
- `isStreaming` state in Chat.tsx prevents duplicate message sends.

### Compression
- No response compression configured (Gzip/Brotli would reduce text payload sizes).

---

## 9. Memory Management

### Audio Resources
- **AudioContext**: Created per recording session, closed after use (`audioCtx.close()`).
- **MediaStream**: Tracks stopped after recording (`track.stop()`).
- **Blob URLs**: Cleaned up in `VoicePlayer.stop()` and `SpeechControls.cleanup()`.
- **TTS Cache**: Limited to 50 entries, oldest evicted first.

### Timers & Listeners
- `setInterval`/`setTimeout` cleared in cleanup functions.
- `requestAnimationFrame` canceled via `cancelAnimationFrame`.
- Event listeners removed in `useEffect` return.

### Known Risks
- **VoiceCallModal** holds live stream reference — if component unmounts mid-call, cleanup may be incomplete.
- **Chat.tsx** `sendMessage` creates blob URLs for auto-read-back (removed) — any remaining use must clean up URLs.

---

## 10. Bundle Performance

- **pnpm** for efficient dependency management.
- **Tailwind v4** purges unused CSS in production.
- **Lucide** tree-shakes unused icons.
- **Dynamic imports** used for voice services — not loaded until mic/phone button is pressed.

### Rules
- **No large libraries** without justification — check bundle size impact before adding.
- **Prefer dynamic imports** for non-critical functionality.
- **Keep dependency count minimal** — unused dependencies should be removed.

---

## 11. Monitoring (Future)

Currently **Bundle budget**: Initial entry = 300KB, lazy chunks = 250KB (see scripts/check-bundle-size.sh). Applied route-based lazy loading (React.lazy + Suspense) for all pages. No production monitoring.*Recommended for production:

- **Latency tracking**: Time from message send → first AI response chunk.
- **Error rates**: Track 500 errors, AI failures, STT/TTS failures.
- **API usage**: Token consumption per user, API call counts.
- **AI cost tracking**: Tokens used per model, per conversation.

---

## 12. Performance Checklist

Before completing performance-sensitive work:

- [ ] No unnecessary re-renders (verify with React DevTools)
- [ ] Streaming used where applicable (AI, potentially voice)
- [ ] Database queries paginated with LIMIT
- [ ] Resources cleaned up (timers, streams, listeners, audio contexts)
- [ ] Caching applied where appropriate (TTS, AI results)
- [ ] Large dependencies justified
- [ ] Memory leaks prevented (verify no lingering refs)
- [ ] `pnpm typecheck` passes
