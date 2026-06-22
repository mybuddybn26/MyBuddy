# API.md — Buddy API Contract Documentation

> **Permanent API specification for Buddy.**
> Every endpoint, request format, response format, and frontend integration rule is documented here.

---

## 1. API Philosophy

Buddy's APIs are:

- **Predictable** — consistent patterns, same error format everywhere.
- **Typed** — TypeBox schemas validate all inputs; Drizzle types for database operations.
- **Secure** — JWT auth on all routes unless marked public; user ownership verified.
- **Documented** — every endpoint listed here with purpose, auth, and response shape.
- **Frontend-friendly** — single API wrapper (`vitejs/src/api.ts`) handles auth, errors, and normalization.
- **Consistent in errors** — `{ detail, request_id }` format on every error response.
- **Streaming-capable** — SSE for chat and voice responses.

---

## 2. Base URL & Environment

| Setting | Value |
|---|---|
| **Backend** | `http://localhost:3000` (dev), proxied by Vite at `:5173` under `/api` |
| **Frontend wrapper** | `vitejs/src/api.ts` — all HTTP calls go through this file |
| **Auth header** | `Authorization: Bearer <jwt_token>` |
| **Content-Type** | `application/json` for JSON endpoints, `multipart/form-data` for uploads |

---

## 3. Authentication

- **Method**: JWT (shared secret) via `@fastify/jwt` + `jose`.
- **Protected routes**: All routes except explicitly marked public (`config: { public: true }`).
- **Public routes**: `POST /api/auth/register`, `POST /api/auth/login`, `POST /api/auth/refresh`, `GET /api/health`.
- **Header**: `Authorization: Bearer <token>`.
- **User ownership**: All data queries filter by `request.authUser.sub` — users cannot access others' data.
- **Refresh**: `POST /api/auth/refresh` renews the access token.

---

## 4. Response Format

### Success
```json
// Single object
{ "id": "...", "name": "..." }

// List
{ "data": [...], "count": 42 }

// Action
{ "status": "ok" }
```

### Error (every error response)
```json
{
  "detail": "Human-readable error message",
  "request_id": "uuid"
}
```

### Streaming (SSE)
```
data: {"type":"text","content":"Hello "}
data: {"type":"text","content":"world!"}
data: {"type":"done","token_balance":199,"conversationId":"uuid"}
```

---

## 5. Endpoint Inventory

### Auth Module (`modules/auth/routes.ts`)

| Method | Path | Purpose | Auth |
|---|---|---|---|
| `POST` | `/api/auth/register` | Create account (phone/email + password) | Public |
| `POST` | `/api/auth/login` | Login, returns JWT | Public |
| `POST` | `/api/auth/refresh` | Refresh access token | Public |
| `GET` | `/api/auth/me` | Get current user profile | Required |

### Billing Module (`modules/billing/routes.ts`)

| Method | Path | Purpose | Auth |
|---|---|---|---|
| `GET` | `/api/billing/packs` | List available token packs | Required |
| `POST` | `/api/billing/create-checkout` | Create Stripe checkout session | Required |
| `POST` | `/api/billing/webhook` | Stripe webhook handler | Public |
| `GET` | `/api/billing/history` | Payment history | Required |
| `POST` | `/api/billing/confirm` | Confirm payment by reference | Required |

### Budgets Module (`modules/budgets/routes.ts`)

| Method | Path | Purpose | Auth |
|---|---|---|---|
| `GET` | `/api/budgets` | List budgets (optional `?status=`) | Required |
| `POST` | `/api/budgets` | Create budget | Required |
| `GET` | `/api/budgets/:id` | Get single budget | Required |
| `PATCH` | `/api/budgets/:id` | Update budget | Required |
| `DELETE` | `/api/budgets/:id` | Delete budget | Required |
| `POST` | `/api/budgets/:id/ai-edit` | AI-assisted budget editing | Required |

### Chat Module (`modules/chat/routes.ts`)

| Method | Path | Purpose | Auth |
|---|---|---|---|
| `POST` | `/api/chat` | Stream AI chat response (SSE) | Required |
| `GET` | `/api/chat/history` | Get chat history (`?limit=&offset=`) | Required |

### Documents Module (`modules/documents/routes.ts`)

| Method | Path | Purpose | Auth |
|---|---|---|---|
| `POST` | `/api/documents` | Create document record | Required |
| `GET` | `/api/documents` | List documents (`?limit=&offset=`) | Required |
| `GET` | `/api/documents/:id` | Get single document | Required |
| `POST` | `/api/documents/:id/analyze` | AI analysis of document image | Required |
| `PATCH` | `/api/documents/:id` | Update document | Required |
| `DELETE` | `/api/documents/:id` | Delete document | Required |

### Feedback Module (`modules/feedback/routes.ts`)

| Method | Path | Purpose | Auth |
|---|---|---|---|
| `POST` | `/api/feedback` | Submit feedback (like/dislike/reasons) | Required |
| `DELETE` | `/api/feedback` | Remove feedback (retract vote) | Required |

### PDF Module (`modules/pdf/routes.ts`)

| Method | Path | Purpose | Auth |
|---|---|---|---|
| `POST` | `/api/pdf/generate` | Generate PDF from sections | Required |

### Persona Module (`modules/persona/routes.ts`)

| Method | Path | Purpose | Auth |
|---|---|---|---|
| `GET` | `/api/persona` | Get user's AI persona settings | Required |
| `PATCH` | `/api/persona` | Update AI persona settings | Required |

### Tokens Module (`modules/tokens/routes.ts`)

| Method | Path | Purpose | Auth |
|---|---|---|---|
| `GET` | `/api/tokens/balance` | Get token balance | Required |
| `POST` | `/api/admin/reset-tokens` | Admin: reset tokens | Required |

### Transactions Module (`modules/transactions/routes.ts`)

| Method | Path | Purpose | Auth |
|---|---|---|---|
| `POST` | `/api/transactions` | Create transaction | Required |
| `GET` | `/api/transactions` | List transactions (filtered) | Required |
| `GET` | `/api/transactions/summary` | Get summary (`?period=day\|week`) | Required |
| `PATCH` | `/api/transactions/:id` | Update transaction | Required |
| `DELETE` | `/api/transactions/:id` | Delete transaction | Required |

### Upload Module (`modules/upload/routes.ts`)

| Method | Path | Purpose | Auth |
|---|---|---|---|
| `POST` | `/api/upload/image` | Upload image file (multipart) | Required |

### Voice Module (`modules/voice/routes.ts`)

| Method | Path | Purpose | Auth |
|---|---|---|---|
| `POST` | `/api/voice/transcribe` | Transcribe audio to text (multipart) | Required |
| `POST` | `/api/voice/tts` | Legacy TTS — speak text | Required |

### TTS Service (`services/tts/ttsRoutes.ts`)

| Method | Path | Purpose | Auth |
|---|---|---|---|
| `POST` | `/api/voice/tts/speak` | Current TTS — speak with formatter + cache | Required |

---

## 6. Chat API

### POST /api/chat (SSE Streaming)

**Request:**
```json
{
  "message": "Hello Buddy!",
  "input_type": "text",        // optional: 'text' | 'voice' | 'image'
  "conversation_history": [    // optional
    { "role": "user", "content": "..." },
    { "role": "assistant", "content": "..." }
  ]
}
```

**Response**: Server-Sent Events stream.
```
data: {"type":"text","content":"Hello"}      ← incremental text
data: {"type":"text","content":"!"}
data: {"type":"budget","id":"...","title":"...","items":[...]}  ← extracted budget
data: {"type":"done","token_balance":199,"conversationId":"uuid"}  ← completion
data: {"type":"error","content":"AI service unavailable"}          ← error
```

**Flow**: Validate → check tokens → get persona → save user message → stream AI response → extract transactions/budgets → save assistant message → deduct token → return done.

### GET /api/chat/history

**Query**: `?limit=50&offset=0` (max 100).

**Response**:
```json
{ "data": [...], "count": 42 }
```

---

## 7. Voice API

### POST /api/voice/transcribe

**Request**: Multipart form with `file` field (audio/webm recommended).

**Response**:
```json
{ "transcript": "Hello, this is what I said." }
```

**Pipeline**: Primary: AssemblyAI (upload → create transcript → poll). Fallback: Groq Whisper. Self-hosted Whisper available but no longer in chain.

### POST /api/voice/tts/speak (Current TTS)

**Request**:
```json
{ "text": "Hello, this will be spoken." }
```

**Response**: Binary audio (MP3 from Deepgram). Headers: `Content-Type: audio/mpeg`.

**Pipeline**: `speechFormatter.ts` → `deepgramService.ts` → audio buffer → cached (50 entries).

### POST /api/voice/tts (Legacy — Deprecated)

Legacy endpoint — do not use for new features. Superseded by `/api/voice/tts/speak`.

---

## 8. Documents API

### POST /api/documents
Create a document record from an uploaded image URL.

### POST /api/documents/:id/analyze
Analyze document image using AI:
1. Read image from disk.
2. Call `analyzeImage()` with `documentAnalysisPrompt`.
3. Classify document type from AI response keywords.
4. Update document with summary and type.

**Response**:
```json
{ "id": "...", "ai_summary": "...", "doc_type": "bill", "summary": "..." }
```

---

## 9. Finance/Budget API

### Budgets
- `GET /api/budgets?status=active|archived|all` — returns `{ data, count }`.
- `POST /api/budgets` — create with `{ title, line_items, period, budget_type }`.
- `POST /api/budgets/:id/ai-edit` — AI-assisted editing via `streamChat(..., 'financial')`.

### Transactions
- `POST /api/transactions` — create with `{ type, amount, description, category }`.
- `GET /api/transactions/summary?period=day|week` — aggregated summary.

**Financial safety**: All amounts use `numeric(10,2)`. AI must not give investment advice. Ownership checked on all mutations.

---

## 10. Feedback API

### POST /api/feedback
```json
{
  "conversationId": "uuid",
  "rating": "good" | "bad",
  "reasons": ["incorrect", "hallucinated"],
  "feedbackText": "Optional custom feedback (max 1000 chars)"
}
```
**Behavior**: Upserts — deletes existing feedback for (user, conversation) then inserts.

### DELETE /api/feedback
```json
{ "conversationId": "uuid" }
```
**Behavior**: Removes the user's feedback for that conversation.

---

## 11. Uploads & Files

### POST /api/upload/image
- **Request**: Multipart form with `file` field.
- **Accepted**: Image files (JPEG, PNG, GIF, WebP).
- **Size limit**: `config.MAX_FILE_SIZE_MB` (default 10MB).
- **Storage**: Local disk at `config.UPLOAD_DIR` (default `./uploads`).
- **Cleanup**: No automatic cleanup — orphans persist indefinitely.

### GET /uploads/:filename
- Public static file serving from upload directory.
- MIME type inferred from file extension.

---

## 12. Streaming APIs

### SSE Format
```
Header: Content-Type: text/event-stream
Body: data: <json>\n\n
```

### Client Handling (vitejs/src/api.ts)
```typescript
const response = await api.chatStream(message, inputType, history);
const reader = response.body.getReader();
const decoder = new TextDecoder();
while (true) {
  const { done, value } = await reader.read();
  if (done) break;
  // parse lines, extract data: {...}
}
```

### Cancellation
- Client can `reader.cancel()` to abort.
- Backend continues until stream ends or connection drops.

---

## 13. Frontend API Rules

1. **All HTTP calls go through `vitejs/src/api.ts`** — components never call `fetch` directly.
2. **Auth handled automatically** — `request()` and `uploadFile()` call `ensureFreshToken()` before every request.
3. **Error normalization** — `api.ts` catches errors and throws `Error` with `body.detail` message.
4. **401 → logout**; **402 → token depleted notification**; **204 → undefined**.
5. **New endpoints** must be added to `api.ts` before components can use them.

---

## 14. Versioning

- **No version prefix** in URLs (no `/v1/`).
- **Breaking changes**: Update this file, update `CHANGELOG.md`, verify frontend compatibility.
- **New endpoints**: Add to this file immediately.

---

## 15. Security Rules

- Never expose API keys in responses or logs.
- Validate all inputs with TypeBox schemas.
- Check user ownership on every mutation (`userId !== request.authUser.sub → 403`).
- Sanitize file uploads (size limit, MIME type check).
- Rate limiting via `@fastify/rate-limit` (200 requests/minute).
- CORS restricted to `config.CORS_ALLOW_ORIGINS`.
- Internal errors never leak stack traces to client.

---

## 16. API Verification Checklist

Before completing API work:

- [ ] Endpoint documented in this file
- [ ] Request body validated with TypeBox schema
- [ ] Response format consistent with existing patterns
- [ ] Error responses use `{ detail, request_id }`
- [ ] Auth checked unless public
- [ ] User ownership verified on mutation
- [ ] Frontend wrapper method added to `vitejs/src/api.ts`
- [ ] No hardcoded URLs in components
- [ ] `pnpm typecheck` passes
