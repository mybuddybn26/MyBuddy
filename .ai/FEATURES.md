# FEATURES.md — Buddy Feature Catalog

> **Permanent feature catalog for Buddy.**
> Every user-facing feature, its status, location, dependencies, and limitations documented here.

---

## 1. Feature Philosophy

Buddy features should:

- **Solve real user problems** — not just "because competitors have it."
- **Integrate naturally** — reuse existing systems (AI, voice, database, prompts).
- **Follow Buddy personality** — calm, honest, professional, human.
- **Protect user privacy** — don't store what isn't needed.

Avoid isolated one-off features. Everything should make Buddy feel like a cohesive assistant.

---

## 2. Feature Index

| Feature | Status | Category | Frontend | Backend | DB Tables | AI |
|---|---|---|---|---|---|---|
| Text Chat | COMPLETE | Core | `pages/Chat.tsx` | `modules/chat/` | `conversations` | DeepSeek |
| Voice Call | COMPLETE | Core | VoiceCallPanel.tsx` | `modules/voice/`, `services/tts/` | — | DeepSeek |
| One-Shot Mic | COMPLETE | Voice | `pages/Chat.tsx` | `modules/voice/` | — | AssemblyAI |
| Read Aloud | COMPLETE | Voice | `components/chat/SpeechControls.tsx` | `services/tts/` | — | Deepgram |
| Document Analysis | COMPLETE | Productivity | `pages/Documents.tsx` | `modules/documents/` | `documents` | DeepSeek Vision |
| Budgets | COMPLETE | Finance | `pages/Budgets.tsx` | `modules/budgets/` | `budgets` | DeepSeek |
| Transactions | COMPLETE | Finance | `pages/Ledger.tsx` | `modules/transactions/` | `transactions` | DeepSeek |
| Response Actions | COMPLETE | UX | `components/chat/MessageActions.tsx` | — | — | — |
| Feedback | COMPLETE | UX | `components/chat/FeedbackDialog.tsx` | `modules/feedback/` | `feedback` | — |
| AI Personas | COMPLETE | AI | `pages/Settings.tsx` | `modules/persona/` | `users.ai_persona` | Buddy prompt |
| Authentication | COMPLETE | Platform | `auth.ts` | `modules/auth/` | `users` | — |
| Billing | PARTIAL | Platform | `pages/Billing.tsx` | `modules/billing/` | `token_ledger` | — |
| PDF Generation | COMPLETE | Productivity | — | `modules/pdf/` | — | — |
| CI/CD | COMPLETE | DevOps | — | `.github/workflows/ci.yml` | — | — |

---

## 3. Chat Feature

- **Status**: COMPLETE
- **Purpose**: Text-based AI conversation with streaming, auto-extraction of budgets/transactions.
- **Files**: `fastify/src/modules/chat/routes.ts`, `fastify/src/modules/chat/aiService.ts`, `vitejs/src/pages/Chat.tsx`
- **APIs**: `POST /api/chat` (SSE), `GET /api/chat/history`
- **Database**: `conversations` table — one row per message.
- **AI Prompts**: `buddySystemPrompt.ts` via `buildFullSystemPrompt()`.
- **Capabilities**: Streaming text, auto-budget extraction, auto-transaction extraction, SSE error events, token deduction.
- **Known Limitations**: History limited to 30 on load, 12 in context. No persistent memory across sessions.
- **Future**: Long-term memory, context compression, multi-turn tool use.

---

## 4. Voice Feature

### Voice Call (PhoneCall)
- **Status**: PARTIAL (core loop works, streaming not implemented)
- **Purpose**: Continuous two-way voice conversation.
- **Files**: `vitejs/src/voice/voiceState.ts`, `vitejs/src/voice/voiceRecorder.ts`, `vitejs/src/voice/voicePlayer.ts`, `vitejs/src/components/chat/VoiceCallPanel.tsx`
- **Pipeline**: Mic → VAD → AssemblyAI → DeepSeek → SpeechFormatter → Deepgram → Speaker → loop.
- **Known Limitations**: Batch STT (not WebSocket streaming), full TTS buffer (not chunked), latency >2s.
- **Future**: WebSocket STT, streaming TTS, persistent voice settings.

### One-Shot Mic
- **Status**: COMPLETE
- **Purpose**: Record → transcribe → paste into input. Does not auto-send.
- **Files**: `vitejs/src/pages/Chat.tsx` (one-shot mic logic)
- **API**: `POST /api/voice/transcribe`

### Read Aloud
- **Status**: COMPLETE
- **Purpose**: Speak a single AI response aloud.
- **Files**: `vitejs/src/components/chat/SpeechControls.tsx`, `fastify/src/services/tts/speechFormatter.ts`, `fastify/src/services/tts/deepgramService.ts`
- **API**: `POST /api/voice/tts/speak`
- **Cache**: In-memory, 50 entries, session-scoped.

---

## 5. Document Feature

- **Status**: COMPLETE
- **Purpose**: Upload images, AI analyzes and classifies documents.
- **Files**: `fastify/src/modules/documents/routes.ts`, `vitejs/src/pages/Documents.tsx`
- **APIs**: `POST /api/documents`, `GET /api/documents`, `POST /api/documents/:id/analyze`
- **Database**: `documents` table (image URL, AI summary, document type).
- **AI**: DeepSeek Vision via `analyzeImage()` with `documentAnalysisPrompt`.
- **Types**: bill, letter, permit, statement, other (inferred from AI response keywords).
- **Uploads**: Via `POST /api/upload/image`, stored on disk.
- **Known Limitations**: No real OCR — relies on AI vision. No batch processing. No PDF upload support.

---

## 6. Finance Features

### Budgets
- **Status**: COMPLETE
- **Files**: `fastify/src/modules/budgets/routes.ts`, `vitejs/src/pages/Budgets.tsx`
- **APIs**: CRUD + `POST /api/budgets/:id/ai-edit`
- **Database**: `budgets` table (title, period, line_items JSONB, status).
- **AI**: Auto-generated from chat, AI-edited via `financial` task prompt.

### Transactions
- **Status**: COMPLETE
- **Files**: `fastify/src/modules/transactions/routes.ts`, `vitejs/src/pages/Ledger.tsx`
- **APIs**: CRUD + `GET /api/transactions/summary`
- **Database**: `transactions` table (type, amount numeric, category).
- **AI**: Auto-parsed from ` ```transaction ``` ` blocks in chat responses.

**Data Safety**: Amounts in `numeric(10,2)`. No investment advice. AI assistant disclaimer.

---

## 7. User System

### Authentication
- **Status**: COMPLETE
- **Files**: `fastify/src/modules/auth/routes.ts`, `vitejs/src/auth.ts`
- **Method**: JWT (shared secret), register/login/refresh/me.
- **Storage**: JWT in localStorage (frontend), bcrypt password hash (backend).

### Profiles
- **Status**: COMPLETE
- **Database**: `users` table — phone/email, display name, AI persona.

### Token System
- **Status**: COMPLETE
- **Database**: `users.token_balance` + `token_ledger` audit trail.
- **Cost**: 1 token per chat message. 200 free tokens on signup.

---

## 8. AI Personas

- **Status**: COMPLETE
- **Files**: `fastify/src/modules/persona/routes.ts`, `fastify/src/ai/prompts/buddySystemPrompt.ts`
- **API**: `GET /api/persona`, `PATCH /api/persona`
- **Configurable**: Name, language (en/ms/zh/mixed), tone (formal/casual/slang), dialect (standard/brunei).
- **Rule**: Buddy's core identity lives in `buddySystemPrompt.ts` ONLY. Persona changes affect the prompt dynamically.

---

## 9. Customization Features

- **Status**: PARTIAL (persona only; themes/backgrounds not implemented)
- **Existing**: AI persona customization (name, language, tone, dialect).
- **Not Implemented**: Themes (dark/light mode toggle present in Layout but not user-configurable), chat backgrounds, voice settings.

---

## 10. Billing / Token System

- **Status**: PARTIAL (Stripe working, manual confirmation fallback)
- **Files**: `fastify/src/modules/billing/routes.ts`, `vitejs/src/pages/Billing.tsx`
- **APIs**: `GET /api/billing/packs`, `POST /api/billing/create-checkout`, `POST /api/billing/webhook`, `POST /api/billing/confirm`
- **Provider**: Stripe (webhook signature verified).
- **Known Limitations**: Manual confirmation endpoint (`/api/billing/confirm`) exists for BIBD Pay — should be webhook-only in production.

---

## 11. Feedback System

- **Status**: COMPLETE
- **Files**: `fastify/src/modules/feedback/routes.ts`, `vitejs/src/components/chat/FeedbackDialog.tsx`
- **APIs**: `POST /api/feedback` (upsert), `DELETE /api/feedback` (retract)
- **Database**: `feedback` table (rating, reasons JSONB, feedback_text, model).
- **Flow**: Like → POST good. Dislike → dialog with 11 reasons + optional text. Votes are retractable (toggle on re-click).
- **Future**: Use feedback data to improve AI responses.

---

## 12. Feature Dependencies

```
Voice Call     →  AI (aiService)  →  Prompts (buildFullSystemPrompt)
               →  STT (AssemblyAI)
               →  TTS (Deepgram)  →  SpeechFormatter

Chat           →  AI (aiService)  →  Prompts (buildFullSystemPrompt)
               →  Database (conversations)

Documents      →  AI (analyzeImage)  →  Prompts (documentAnalysisPrompt)
               →  Upload (multipart)
               →  Database (documents)

Budgets        →  AI (streamChat with 'financial' task)
               →  Database (budgets)

Transactions   →  AI (auto-extract from chat)
               →  Database (transactions)

Feedback       →  Database (feedback)

Billing        →  Stripe API
               →  Database (token_ledger)
```

---

## 13. Adding New Features

1. Check `FEATURES.md` first — does it already exist?
2. Check `ROADMAP.md` — does it align with priorities?
3. Follow `ARCHITECTURE.md` — backend module + frontend component pattern.
4. Follow `DESIGN.md` — Lucide icons, Tailwind tokens.
5. Add to `API.md` — document new endpoints.
6. Add to `DATABASE.md` — document new tables/columns.
7. Add tests (see `TESTING.md`).
8. Update `FEATURES.md` (this file).

---

## 14. Feature Removal Rules

Before removing any feature:
- Check all dependencies (other features, UI, database).
- Assess user impact — is anyone relying on this?
- Update documentation (FEATURES.md, API.md, DATABASE.md).
- Record the decision in `CHANGELOG.md`.

---

## 15. Feature Completion Checklist

A feature is COMPLETE only when:

- [ ] Frontend implemented (pages, components)
- [ ] Backend implemented (routes, services)
- [ ] Database changes applied (if needed)
- [ ] API endpoints documented in API.md
- [ ] Loading state present
- [ ] Empty state present
- [ ] Error state present
- [ ] Mobile layout responsive
- [ ] Security reviewed (auth, ownership, validation)
- [ ] `pnpm typecheck` passes in both projects
- [ ] Manual verification performed

---

## 16. Feature Status Summary

| Status | Count | Features |
|---|---|---|
| COMPLETE | 11 | Chat, One-Shot Mic, Read Aloud, Documents, Budgets, Transactions, Response Actions, Feedback, Personas, Auth, PDF |
| PARTIAL | 2 | Voice Call, Billing |
| PLANNED | — | See ROADMAP.md |
