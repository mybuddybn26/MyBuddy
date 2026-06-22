# SECURITY.md — Buddy Security & Privacy Specification

> **Permanent security specification for Buddy.**
> Every authentication, authorization, data handling, and privacy decision must follow this document.

---

## 1. Security Philosophy

Buddy is:

- **Privacy-first** — don't store what isn't needed; delete temporary data after processing.
- **Least-privilege** — users access only their own data; admin access is minimal.
- **User-data safe** — financial, document, and conversation data protected by ownership checks.
- **Secure by default** — auth required unless explicitly public; inputs validated; secrets never exposed.
- **Explicit about sensitive data** — data classified by sensitivity; handling rules documented here.
- **Careful with AI data** — voice transcripts, documents, and AI responses treated as potentially private.

---

## 2. Data Classification

| Data Type | Sensitivity | Storage | Logging | Retention |
|---|---|---|---|---|
| User profile (name, phone/email) | Medium | `users` table, bcrypt for password | Never log passwords | Persistent |
| AI conversations | Medium | `conversations` table | Never log full content in prod | Persistent |
| Documents/uploads | Medium | Disk (`./uploads`) + `documents` table | Never log full content | Persistent (no auto-cleanup) |
| Voice transcripts | Medium | Stored as chat messages (`conversations`) | Never log full transcripts in prod | Same as chat |
| Raw voice audio | Medium | NOT stored (processed + deleted) | N/A | Transient (deleted after STT) |
| Financial data | High | `transactions`, `budgets`, `token_ledger` tables | Never log amounts or details | Persistent (audit trail) |
| Billing data | High | `token_ledger` (Stripe payment IDs) | Never log card details | Persistent |
| API keys / secrets | Critical | `.env` file (gitignored) | NEVER logged | Rotate on exposure |
| JWT tokens | High | localStorage (frontend), validated server-side | Never logged | Session-based (expiry configured) |

---

## 3. Authentication

### JWT Flow
1. User registers or logs in → backend returns JWT access token.
2. Token stored in `localStorage` by frontend.
3. Every API request includes `Authorization: Bearer <token>` header.
4. Backend `auth.ts` plugin intercepts all requests, verifies JWT via `@fastify/jwt` + `jose`.
5. Public routes (`/api/auth/*`, `/api/health`) bypass auth via `isPublicPath()` or `config: { public: true }`.
6. Token refresh via `POST /api/auth/refresh`.

### Frontend Auth (`vitejs/src/auth.ts`)
- `ensureFreshToken()` called before every request.
- `getToken()` returns current JWT for headers.
- 401 response → `logout()` — clears token, redirects to login.

### Risks / Missing
- **Token storage in localStorage** is vulnerable to XSS. Consider httpOnly cookies for production.
- **No session invalidation** — tokens are valid until expiry. No server-side blacklist.

---

## 4. Authorization & Ownership

### Rules
- Every user-owned resource (conversations, transactions, documents, budgets, feedback) must verify ownership.
- Route handler pattern: `if (record.userId !== request.authUser.sub) return reply.status(403).send({ detail: '...' })`.
- Database queries always filter by `userId`.

### Enforcement
- Auth plugin sets `request.authUser.sub` from JWT.
- Route handlers compare `userId` field against `request.authUser.sub`.
- Cross-user access returns 403 — never silently returns data.

---

## 5. Secrets & Environment Variables

### Rules
- **All API keys** stored in `.env` (gitignored).
- Template in `.env.example` (committed, no real values).
- Backend only — frontend never receives API keys.
- **No `process.env` direct access** in route handlers — always use `config.KEY_NAME` from `fastify/src/config.ts`.
- Config is TypeBox-validated at startup.

### Frontend Proxy
- AI/STT/TTS calls go through backend — API keys never sent to browser.
- Vite proxy forwards `/api` requests to backend during development.
- Frontend only knows `VITE_API_URL` (empty in dev, proxied).

### CI Protection
- Gitleaks scans for secrets in CI.
- `.env.test` and `.env.example` allowlisted.
- Pre-commit hooks check staged changes for accidental secret commits.

---

## 6. API Security

### Input Validation
- TypeBox schemas on all route inputs (`@sinclair/typebox`).
- Request body cast after validation: `request.body as { field: string }`.
- Validation errors return 422/400 with `{ detail }`.

### Rate Limiting
- `@fastify/rate-limit` configured globally: 200 requests/minute.
- Keyed by `request.authUser.sub` or `request.ip`.

### CORS
- Origin list from `config.CORS_ALLOW_ORIGINS` (default: `http://localhost:5173`).
- Credentials enabled.

### Safe Error Messages
- Internal errors return `{ detail, request_id }` — stack traces never exposed.
- Prisma/Drizzle errors mapped to HTTP statuses in `error-handler.ts`.
- 401: generic "Unauthorized" (no detail on auth failure reason).

---

## 7. Upload Security

### File Types
- Image uploads accepted (JPEG, PNG, GIF, WebP).
- MIME type inferred from extension; not deeply validated (potential gap).

### Size Limits
- `config.MAX_FILE_SIZE_MB` (default 10MB).
- Enforced via `@fastify/multipart` limits.

### Storage
- Files stored on disk at `config.UPLOAD_DIR`.
- Served via `GET /uploads/:filename` (public — no auth required on static files).

### Cleanup
- **No automatic cleanup** — uploaded files persist indefinitely (gap).
- No orphan detection for deleted document records.

### Risks
- Malicious file uploads could exhaust disk space (no quota per user).
- Public file serving via `/uploads/:filename` — predictable URLs (low risk, but no access control).

---

## 8. Document AI Security

### Prompt Injection Prevention
- System prompt (`buildFullSystemPrompt()`) always precedes document content.
- LLMs prioritize early instructions — system prompt outranks document content.
- `documentAnalysisPrompt` instructs AI to summarize and classify, not obey.
- Hidden instructions in uploaded documents should be ignored by AI.

### Current Protection
- AI prompt architecture places system prompt first in message array.
- No explicit content filtering or sanitization of uploaded documents.

### Risk
- **Medium**: Sophisticated prompt injection in document images could theoretically influence AI behavior. Mitigated by system prompt positioning.

---

## 9. Voice Security

### Microphone
- `getUserMedia({ audio: true })` triggers browser permission dialog.
- Denial handled gracefully with user-friendly message.
- Mic stream stopped immediately after recording (`track.stop()`).

### Transcription
- Transcripts stored as normal chat messages — same privacy as text.
- Raw audio NOT stored — deleted after AssemblyAI processing.
- Audio sent to AssemblyAI via backend (API key not exposed to frontend).

### TTS
- Audio generated via backend TTS service.
- Cached in-memory (50 entries, session only).
- Cache cleared on page unload or call end.

### Privacy
- Voice recordings never persisted unless user explicitly enables (not yet implemented).
- Transcript privacy: same as text chat — persisted in `conversations` table.

---

## 10. Financial Data Security

### Storage
- Amounts: `numeric(10,2)` — no floating-point errors.
- Token ledger: full audit trail for every balance change.
- Stripe payment IDs stored in `token_ledger.stripe_payment_id`.

### Validation
- Backend validates amounts before mutation.
- User ownership checked on every financial operation.

### Risks
- **No soft-delete or undo** for financial records — deletions are permanent.
- Stripe payment confirmation via `POST /api/billing/confirm` (reference-based) — should be webhook-only.

---

## 11. Billing Security

### Stripe Integration
- Webhook endpoint verifies `stripe-signature` via `Stripe.webhooks.constructEvent()`.
- Webhook is public (`config: { public: true }`) but signature-protected.
- Token packs added via webhook (server-authoritative).

### Admin Endpoint
- `POST /api/admin/reset-tokens` — exists but ownership/role check unknown. Verify before production.

---

## 12. Database Security

### Query Safety
- Drizzle query builder automatically parameterizes — safe by default.
- Raw SQL must use parameterized queries (`$1`, `$2`) or `sql` template tag.
- Never concatenate user input into SQL strings.
- Raw SQL requirements documented in ARCHITECTURE.md §7.

### Migration Safety
- `drizzle-kit push` for dev; `drizzle-kit migrate` for prod.
- Generated SQL reviewed before applying (CI checks schema drift).

### Cascade Deletes
- All FKs use `ON DELETE CASCADE` — deleting a user removes all their data.
- No soft-delete mechanism — deletions are irreversible.

---

## 13. Frontend Security

### API Keys
- **No API keys in frontend code** — all external services called through backend.
- Vite `import.meta.env` only exposes `VITE_` prefixed variables.

### Auth Tokens
- JWT stored in `localStorage` (XSS risk in production).
- `api.ts` handles token refresh automatically.

### Rendering
- AI responses rendered with `whitespace-pre-wrap` in chat — no HTML injection.
- No `dangerouslySetInnerHTML` used for AI content.

### Dependency Security
- No SRI or CSP headers configured (production gap).

---

## 14. Logging & Monitoring

### Rules
- **Never log**: API keys, passwords (even hashed), full JWT tokens, full conversation content.
- **Development logs**: `request.log.info()` for debugging, `console.log` for voice pipeline.
- **Production**: Log level configurable via `LOG_LEVEL` env var (default: `debug` — change to `info` for prod).
- **Errors**: Log with context (status code, endpoint) but not request body.

---

## 15. Threat Model

| Threat | Likelihood | Impact | Mitigation |
|---|---|---|---|
| Stolen JWT | Medium | High | Short expiry, refresh flow |
| Prompt injection | Medium | Low | System prompt first, AI instructed to resist |
| Document injection | Low | Low | System prompt outranks document content |
| Upload abuse | Medium | Medium | Size limits, type checks (weaker validation) |
| Cross-user data leak | Low | Critical | Ownership checks on every query |
| API key leakage | Low | Critical | `.env` gitignored, backend-only, CI scanning |
| SQL injection | Low | Critical | Drizzle parameterization, raw SQL rules |
| Billing abuse | Low | High | Stripe webhook signature verification |
| Rate limit bypass | Medium | Low | Global rate limiter (IP or user-based) |
| Voice transcript leak | Low | Medium | Transcripts stored as chat (same controls) |

---

## 16. Security Gaps

| Gap | Severity | Description |
|---|---|---|
| JWT in localStorage | **Medium** | Vulnerable to XSS. Consider httpOnly cookie + CSRF protection for production. |
| No CSP headers | **Medium** | Content-Security-Policy not configured. Risk of XSS attacks. |
| No upload cleanup | **Medium** | Uploaded files never deleted. Orphan detection missing. |
| Weak upload validation | **Low** | MIME type from extension only — no magic-byte verification. |
| Public file serving | **Low** | `/uploads/:filename` has no access control — anyone can guess URLs. |
| Admin endpoint unverified | **High** | `POST /api/admin/reset-tokens` — role check not confirmed. Verify before production. |
| No session invalidation | **Medium** | Tokens valid until expiry with no server-side blacklist. |
| No soft-delete | **Medium** | Cascade deletes are irreversible. Consider soft-delete for critical data. |
| No HTTP security headers | **Low** | HSTS, X-Frame-Options, X-Content-Type-Options not configured. |

---

## 17. Security Verification Checklist

Before completing security-sensitive tasks:

- [ ] Auth required where needed (all non-public routes)
- [ ] User ownership checked on all data mutations
- [ ] Inputs validated (TypeBox schemas)
- [ ] Uploads validated (size + type)
- [ ] No secrets exposed in code or logs
- [ ] No sensitive data in logs
- [ ] SQL parameterized (Drizzle or raw with `$params`)
- [ ] Document prompt injection considered
- [ ] `pnpm typecheck` passes
- [ ] Error messages safe (no stack traces)
- [ ] `.env` not committed
- [ ] Gitleaks CI check passes
