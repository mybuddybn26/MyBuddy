# ROADMAP.md — Buddy Product Roadmap

> **Long-term vision, feature direction, and priorities for Buddy.**
> Use this document to align implementation decisions with where Buddy is going.

---

## 1. Product Vision

Buddy should become a **reliable personal AI companion** — not just a chatbot.

Users should be able to:
- Have natural conversations (text and voice).
- Manage their finances (budgets, transactions, analysis).
- Scan and understand documents.
- Get personalized help that remembers their context.
- Complete tasks across devices with minimal friction.

Buddy should feel like a **knowledgeable friend who's always available** — professional without being cold, warm without being fake.

---

## 2. Product Principles

Every feature decision should be filtered through these principles:

- **Useful before flashy** — solve real problems first; aesthetics follow function.
- **Simple before complex** — the simplest correct solution wins.
- **Privacy first** — don't collect what isn't needed; delete what's temporary.
- **User control** — users own their data and can delete it.
- **Human-like interaction** — natural conversation, not robotic scripts.
- **Fast responses** — streaming, caching, low latency.
- **Accessible design** — work for everyone, on any device.

---

## 3. Current Features

### Chat
- **Status**: Implemented
- **Description**: Streaming AI chat via SSE with DeepSeek V4 Flash. Budget and transaction auto-extraction. Chat history with pagination.
- **Files**: `fastify/src/modules/chat/`, `vitejs/src/pages/Chat.tsx`

### Voice Conversation
- **Status**: Implemented (with limitations)
- **Description**: Continuous two-way voice calls via VoiceCallModal. VAD silence detection. Barge-in support. AssemblyAI STT + Deepgram TTS.
- **Limitations**: Batch STT (not streaming), full TTS buffer (not chunked), latency >2s in practice.
- **Files**: `vitejs/src/voice/`, `vitejs/src/components/chat/VoiceCallModal.tsx`

### One-Shot Microphone
- **Status**: Implemented
- **Description**: Tap mic → record → transcribe → paste into input. Does not auto-send.
- **Files**: `vitejs/src/pages/Chat.tsx`

### Document Analysis
- **Status**: Implemented
- **Description**: Upload images, AI identifies and summarizes documents. Type classification (bill/letter/permit/statement/other).
- **Files**: `fastify/src/modules/documents/`, `vitejs/src/pages/Documents.tsx`

### Budgeting
- **Status**: Implemented
- **Description**: AI-generated budgets with editable line items. AI-assisted editing via `financial` task prompt. Weekly/monthly/one-time periods.
- **Files**: `fastify/src/modules/budgets/`, `vitejs/src/pages/Budgets.tsx`

### Transactions
- **Status**: Implemented
- **Description**: Track sales, expenses, refunds. Auto-parsed from AI chat responses. Ledger view with summary.
- **Files**: `fastify/src/modules/transactions/`, `vitejs/src/pages/Ledger.tsx`

### Response Actions
- **Status**: Implemented
- **Description**: Copy, Like/Dislike (retractable), Retry, Read Aloud, Share on every AI message. Bad response feedback dialog.
- **Files**: `vitejs/src/components/chat/MessageActions.tsx`, `vitejs/src/components/chat/FeedbackDialog.tsx`

### Feedback System
- **Status**: Implemented
- **Description**: POST/DELETE `/api/feedback`. Ratings stored per user+conversation. Detailed reasons for bad responses.
- **Files**: `fastify/src/modules/feedback/`, `fastify/src/db/schema.ts` (feedback table)

### AI Personas
- **Status**: Implemented
- **Description**: Customizable name, language (en/ms/zh/mixed), tone, dialect (standard/brunei). Stored in `users.ai_persona` JSONB.
- **Files**: `fastify/src/modules/persona/`, `fastify/src/ai/prompts/buddySystemPrompt.ts`

### Text-to-Speech
- **Status**: Implemented
- **Description**: Per-message Read Aloud via Deepgram. Speech formatting (markdown removal, abbreviation expansion). In-memory cache.
- **Files**: `fastify/src/services/tts/`, `vitejs/src/components/chat/SpeechControls.tsx`

### Authentication
- **Status**: Implemented
- **Description**: JWT auth (shared secret). Register/login/refresh/me endpoints. Auto-refresh on frontend.
- **Files**: `fastify/src/modules/auth/`, `vitejs/src/auth.ts`

### Billing
- **Status**: Implemented
- **Description**: Stripe integration for token purchases. Token balance and ledger tracking.
- **Files**: `fastify/src/modules/billing/`, `vitejs/src/pages/Billing.tsx`

### CI/CD
- **Status**: Implemented
- **Description**: GitHub Actions for TypeScript checks, linting, secret scanning.
- **Files**: `.github/workflows/ci.yml`

---

## 4. Short-Term Roadmap (0-3 months)

**Theme**: Polish the core experience.

### Voice Improvements
- [ ] WebSocket-based STT streaming (currently batch HTTP).
- [ ] Chunked TTS streaming (currently full buffer before playback).
- [ ] Latency reduction to consistently under 2 seconds.
- [ ] Better error recovery (auto-reconnect on network loss).

### AI Improvements
- [ ] Conversation memory beyond last 12 messages.
- [ ] Better context awareness across sessions.
- [ ] Tool-use capability for real-time data (weather, currency, news).

### UX Improvements
- [ ] Smoother modal transitions.
- [ ] Mobile layout audit and fixes.
- [ ] Keyboard shortcuts for power users.
- [ ] Accessibility audit (WCAG 2.1 AA).

### Reliability
- [ ] API integration tests.
- [ ] Voice pipeline unit tests.
- [ ] Security gaps from SECURITY.md addressed (CSP headers, upload cleanup).
- [ ] Database indexes on frequently queried columns.

---

## 5. Medium-Term Roadmap (3-12 months)

**Theme**: Expand capabilities.

- **Advanced memory**: Remember user preferences, past conversations, frequently used data.
- **Personalization**: Adapt tone, detail level, and suggestions based on user behavior.
- **Calendar integration**: Schedule reminders, check availability.
- **Email/document summarization**: Forward emails, get summaries.
- **Enhanced finance**: Multi-currency, recurring expenses, savings goals.
- **Mobile app**: React Native or PWA with full voice support.
- **Offline mode**: Basic chat with local Ollama fallback.
- **Multi-model support**: Claude, GPT-4, Gemini as configurable options.

---

## 6. Long-Term Vision (12+ months)

**Theme**: Buddy becomes a true personal assistant.

- **Understands context** across all interactions — chat, voice, documents, calendar.
- **Remembers preferences** — learns what you like without being creepy.
- **Uses tools** — can search, calculate, schedule, and act on your behalf.
- **Completes tasks** — not just advice, but execution (with user confirmation).
- **Helps proactively** — "You have a budget review due" or "That document you scanned was a bill — want me to log it?"
- **Works across devices** — seamless sync between phone, desktop, and web.

---

## 7. Feature Priority System

| Priority | Definition | Examples |
|---|---|---|
| **P0** | Critical — blocks core functionality | Security bugs, broken auth, crashed services |
| **P1** | Core experience | Chat, voice, memory, documents, payments |
| **P2** | Growth features | Integrations, advanced automation, analytics |
| **P3** | Experiments | New modalities, unproven features, A/B tests |

---

## 8. Feature Evaluation Questions

Before building any new feature, answer:

- Does this make Buddy **more useful** to the target user?
- Does this **align with the vision** of a personal AI companion?
- Does this **increase complexity** without proportional value?
- Does this **protect user privacy**?
- Can this **scale** to many users?
- Is there a **simpler version** that solves 80% of the need?

---

## 9. Technical Roadmap

### Voice
- [ ] WebSocket STT streaming (AssemblyAI real-time).
- [ ] Streaming TTS (Deepgram or ElevenLabs chunked).
- [ ] Persistent voice settings (voice selection, speed).

### Database
- [ ] Composite indexes for common queries.
- [ ] Automated backups.
- [ ] Soft-delete for critical tables.

### Security
- [ ] CSP headers.
- [ ] Upload access control.
- [ ] httpOnly cookie option for JWT.
- [ ] Admin endpoint role verification.

### Testing
- [ ] API integration test suite.
- [ ] Voice pipeline tests.
- [ ] E2E tests for critical flows.

### DevOps
- [ ] Production monitoring (logs, errors, latency).
- [ ] Automated database backups.
- [ ] CI/CD deploy pipeline.
- [ ] Horizontal scaling configuration.

---

## 10. Avoid List

Do NOT:

- Add features just because competitors have them.
- Add complexity without clear user value.
- Create multiple inconsistent assistant personalities.
- Break Buddy's core personality (calm, honest, professional).
- Ignore privacy implications of new features.
- Duplicate existing systems (voice, AI, storage, payments).

---

## 11. Feature Status Summary

| Feature | Status |
|---|---|
| Text chat | Done |
| Voice conversation | Done (needs streaming optimization) |
| Document analysis | Done |
| Budgeting | Done |
| Transaction tracking | Done |
| Response actions | Done |
| Feedback system | Done |
| AI personas | Done |
| TTS (Read Aloud) | Done |
| One-shot microphone | Done |
| Authentication | Done |
| Billing (Stripe) | Done |
| CI/CD | Done |
| Voice streaming (STT/TTS) | Planned |
| Conversation memory | Planned |
| Mobile app | Future |
| Offline mode | Future |
| Multi-model AI | Future |

---

## 12. Roadmap Maintenance

When major features are completed or priorities shift:

1. Update this document (status, timelines, priorities).
2. Update `CHANGELOG.md`.
3. Create DECISION entry if direction changes significantly.
