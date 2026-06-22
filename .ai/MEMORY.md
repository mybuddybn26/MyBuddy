# MEMORY.md — Buddy Long-Term Memory Architecture

> **Memory specification for Buddy.**
> Currently a design document — memory is not yet implemented.
> Use this when building personalized AI memory features.

---

## 1. Memory Philosophy

Buddy's memory should make the assistant **more helpful, personal, and context-aware** — without becoming invasive, creepy, or unpredictable.

- **Helpful**: Remember what matters to the user — preferences, goals, important facts.
- **Personal**: Adapt responses based on what Buddy knows about the user.
- **Context-aware**: Retrieve relevant memories for the current conversation.
- **User-controlled**: Users can view, edit, delete, and disable memory.
- **Privacy-first**: Never store what isn't needed. Never leak between users.

---

## 2. Memory Types

### Short-Term Memory (CURRENT)
- **What**: Conversation context within a session.
- **Implementation**: Last 12 messages sent in prompt context via `conversation_history`. Chat history stored in `conversations` table.
- **Scope**: Single session/call. Lost on page reload.

### Long-Term Memory (FUTURE)
- **What**: Persistent user knowledge — preferences, facts, recurring tasks.
- **Implementation**: Not yet built. See §4 for architecture.
- **Scope**: Cross-session, persistent.

### Application Memory (CURRENT)
- **What**: Data Buddy knows from app features.
- **Implementation**: Documents (`documents` table), budgets (`budgets`), transactions (`transactions`), persona settings (`users.ai_persona`).
- **Scope**: Always available, filtered by user.

---

## 3. Current Memory Implementation

| What | Where | How | Limitations |
|---|---|---|---|
| Chat history | `conversations` table | `GET /api/chat/history` loads last 30 messages on mount | Not used across sessions for context |
| Conversation context | In-memory (Chat.tsx state) | Last 12 messages sent in `conversation_history` field | Cleared on page reload |
| User preferences | `users.ai_persona` JSONB | `GET /api/persona`, injected into `buildFullSystemPrompt()` | Only name/language/tone/dialect |
| App data | `documents`, `budgets`, `transactions` tables | Queryable via respective APIs | Not automatically injected into AI context |

---

## 4. Future Memory Architecture

```
User Message
    ↓
Memory Retrieval (query relevant memories)
    ↓
Relevant Memories (filtered by importance + recency)
    ↓
Buddy System Prompt (inject memories as context)
    ↓
AI Response (generated with memory context)
    ↓
Memory Extraction (AI identifies new information worth remembering)
    ↓
User Approval / Automatic Rules
    ↓
Memory Storage (persist to database)
```

### Prompt Integration
```
System: You are Buddy. [personality...]
System: Important context about this user:
- Their name is John.
- They run a small food stall in Bandar.
- They prefer weekly budgets.
- Last week they asked about ingredient costs.
User: How are my expenses this week?
```

### Rules
- Only inject **relevant** memories — don't dump all.
- Respect token limits — rank by importance and recency.
- User can disable memory injection entirely.

---

## 5. Memory Database Design (FUTURE)

### Proposed Table
```sql
CREATE TABLE memories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  type TEXT NOT NULL,          -- 'preference' | 'fact' | 'goal' | 'note'
  content TEXT NOT NULL,        -- e.g. "User prefers weekly budgets"
  importance INTEGER DEFAULT 1, -- 1-5 scale
  source TEXT,                  -- 'user_stated' | 'ai_inferred' | 'manual'
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_used_at TIMESTAMPTZ
);
```

**Do not implement yet** — this is the target schema, subject to revision.

---

## 6. Memory Categories

| Category | Example | Sensitivity |
|---|---|---|
| User preferences | "Prefers casual tone in Malay" | Low |
| Communication style | "Likes short bullet-point responses" | Low |
| Work information | "Runs a kuih stall in Gadong market" | Medium |
| Projects | "Planning to expand to two stalls" | Medium |
| Goals | "Saving 500 BND per month" | Medium |
| Important dates | "Rent due on the 15th of each month" | Medium |
| App preferences | "Always use weekly budget period" | Low |

### Never Store
- Passwords, tokens, or secrets.
- Full identity documents.
- Financial account numbers.
- Health information (unless explicitly requested and consented).
- Random conversation details with no long-term value.

---

## 7. Memory Creation Rules

Buddy should **save** a memory when:
- Information is **stable** (not a one-time request).
- Information will be **useful later** (recurring context).
- User has **explicitly approved** (or clearly intended) the save.

Buddy should **NOT save**:
- One-time requests ("What's the weather today?").
- Random comments ("I had a good lunch.").
- Sensitive data without explicit permission.
- Every message automatically.

### Creation Triggers (future)
1. User explicitly says "Remember that..."
2. AI detects a pattern (user always asks for weekly budgets).
3. User confirms an AI-suggested memory.

---

## 8. Memory Editing

Users must be able to:
- **View** all stored memories (Memory Settings page).
- **Edit** memory content.
- **Delete** individual memories.
- **Disable** memory entirely (opt-out toggle).

### API (future)
- `GET /api/memories` — list user's memories.
- `POST /api/memories` — create manual memory.
- `PATCH /api/memories/:id` — edit memory.
- `DELETE /api/memories/:id` — delete memory.

---

## 9. Memory Security

Follow `.ai/SECURITY.md`.

- Memory belongs to **one user** — cross-user access returns 403.
- **Never leak** memories between users.
- **Never expose** private memories in logs.
- Allow **immediate deletion** without delay.
- Memory data classified as **Medium sensitivity**.

---

## 10. Memory + Voice

Voice conversations should:
- Access relevant memories (same as text chat).
- Update memory when user explicitly confirms ("Remember that..." spoken aloud).
- Respect the same privacy rules as text.

---

## 11. Memory + Tools

Future tools can leverage memory:

| Tool | Memory Usage |
|---|---|
| **Calendar** | Remember scheduling preferences, important dates |
| **Finance** | Remember budget goals, spending patterns |
| **Documents** | Remember organization preferences, common doc types |

---

## 12. Memory Anti-Patterns

**Do NOT:**
- Store everything — only useful, stable information.
- Store secrets or sensitive details.
- Inject every memory into every prompt — use relevance filtering.
- Let AI silently create unlimited memories — user must approve.
- Make memory feel creepy — clarity and control are essential.

---

## 13. Implementation Roadmap

| Phase | Description | Status |
|---|---|---|
| **Phase 1** | Manual user memories (CRUD UI + API) | PLANNED |
| **Phase 2** | AI-suggested memories (AI proposes, user approves) | PLANNED |
| **Phase 3** | Automatic memory retrieval (inject relevant memories into prompt) | PLANNED |
| **Phase 4** | Cross-feature personalization (calendar, finance, documents use memory) | FUTURE |

---

## 14. Memory Completion Checklist

Before claiming memory is implemented:

- [ ] Memory database table created
- [ ] CRUD API endpoints working
- [ ] User can view, edit, delete memories
- [ ] User can disable memory entirely
- [ ] Privacy reviewed (no cross-user leaks, no sensitive storage)
- [ ] Prompt integration safe (relevance-filtered, token-limited)
- [ ] Memory retrieval optimized (not slowing responses)
- [ ] Tests added
