# DATABASE.md — Buddy Database Engineering Specification

> **Permanent database specification for Buddy.**
> Every schema change, query, or migration must follow this document.
> Protect user data above convenience.

---

## 1. Database Philosophy

Database changes must be:

- **Safe** — never risk data loss. Test migration paths before applying.
- **Reversible when possible** — migrations should have a known rollback path.
- **Migration-based** — never manually edit the production database. Use `drizzle-kit push` for dev, `drizzle-kit migrate` for prod.
- **Type-safe** — Drizzle's TypeScript integration ensures schema ↔ code alignment.
- **Documented** — every table is documented here; new tables update this file.
- **Privacy-conscious** — don't store what isn't needed. Delete temporary data.

Protect user data above development convenience.

---

## 2. Technology Stack

| Layer | Technology | Details |
|---|---|---|
| **Database** | PostgreSQL | Via `pg` driver (node-postgres) |
| **ORM** | Drizzle ORM v0.44.5 | `drizzle-orm/pg-core` for schema, `drizzle-orm/node-postgres` for queries |
| **Migrations** | `drizzle-kit` v0.31.4 | Push mode for dev; `drizzle-kit generate` + `drizzle-kit migrate` for prod |
| **Config** | `fastify/drizzle.config.ts` | Schema: `./src/db/schema.ts`, Output: `./drizzle/`, Dialect: `postgresql` |
| **Connection** | `fastify/src/db/client.ts` | Pool from `config.DATABASE_URL`, exported as `db` |
| **Schema File** | `fastify/src/db/schema.ts` | All table definitions (currently ~154 lines, 7 tables) |

---

## 3. Schema Overview

### Table: `users`

- **Purpose**: User accounts — authentication, token balance, AI persona preferences.
- **Key columns**: `id` (UUID PK), `phone_email` (unique), `password_hash`, `display_name`, `ai_persona` (JSONB), `token_balance` (default 200), `subscription_tier` (default 'free').
- **Relationships**: Parent of all user-owned tables (conversations, transactions, documents, token_ledger, budgets, feedback).
- **Used by**: Auth module, chat module, persona module, tokens module, billing module.

### Table: `conversations`

- **Purpose**: Chat history — one row per message (both user and assistant).
- **Key columns**: `id` (UUID PK), `user_id` (FK → users), `role` ('user'|'assistant'), `content` (text), `input_type` ('text'|'voice'|'image'), `tokens_used`.
- **Relationships**: FK → users (cascade delete). Referenced by feedback table.
- **Used by**: Chat module (POST /api/chat, GET /api/chat/history), feedback module.

### Table: `transactions`

- **Purpose**: Micro-accounting ledger — sales, expenses, refunds tracked per user.
- **Key columns**: `id` (UUID PK), `user_id` (FK → users), `type` ('sale'|'expense'|'refund'), `amount` (numeric 10,2), `description`, `category`, `raw_voice_log` (nullable — original voice transcript).
- **Relationships**: FK → users (cascade delete).
- **Used by**: Transactions module, auto-parsed from chat AI responses.

### Table: `documents`

- **Purpose**: Uploaded document records — image URL, AI analysis summary, document type classification.
- **Key columns**: `id` (UUID PK), `user_id` (FK → users), `image_url`, `ai_summary`, `doc_type` ('bill'|'letter'|'permit'|'statement'|'other'), `generated_pdf_url`, `paid_amount` (numeric 10,2).
- **Relationships**: FK → users (cascade delete).
- **Used by**: Documents module, PDF generation module.

### Table: `token_ledger`

- **Purpose**: Token usage tracking — every token change (spend, purchase, grant) is recorded.
- **Key columns**: `id` (UUID PK), `user_id` (FK → users), `change_amount` (integer — positive for credits, negative for debits), `reason` ('monthly_grant'|'pack_purchase'|'task_use'|'pdf_fee'), `stripe_payment_id` (nullable).
- **Relationships**: FK → users (cascade delete).
- **Used by**: Chat module (deduct 1 token per message), billing module (Stripe purchases).

### Table: `budgets`

- **Purpose**: AI-generated budget plans — editable line items with tracking.
- **Key columns**: `id` (UUID PK), `user_id` (FK → users), `title`, `budget_type` ('snapshot'|'recurring'), `period` ('weekly'|'monthly'|'one_time'), `total_amount` (numeric 10,2), `line_items` (JSONB — array of BudgetLineItem), `status` ('active'|'archived'), `source` ('ai_generated'|'manual'|'ai_edited').
- **Relationships**: FK → users (cascade delete).
- **Used by**: Budgets module, auto-generated from chat AI responses.

### Table: `feedback`

- **Purpose**: AI response ratings — users can like/dislike AI messages with optional detailed feedback.
- **Key columns**: `id` (UUID PK), `user_id` (FK → users), `conversation_id` (FK → conversations), `rating` ('good'|'bad'), `reasons` (JSONB — string array), `feedback_text` (nullable), `model` (AI model name).
- **Relationships**: FK → users (cascade delete), FK → conversations (cascade delete).
- **Used by**: Feedback module (POST /api/feedback, DELETE /api/feedback).

---

## 4. Relationships

### Entity Relationship Diagram (Logical)

```
users (1) ─────< (N) conversations
users (1) ─────< (N) transactions
users (1) ─────< (N) documents
users (1) ─────< (N) token_ledger
users (1) ─────< (N) budgets
users (1) ─────< (N) feedback
conversations (1) ─────< (N) feedback
```

### Foreign Key Rules
- All FKs use `ON DELETE CASCADE` — deleting a user removes all their data.
- All FKs use `ON UPDATE NO ACTION` — primary keys never change (UUIDs).
- FK columns are always `NOT NULL`.

### Ownership
- Every table (except `feedback` which references both) has `user_id` as the ownership column.
- All queries filter by `user_id` — users can only access their own data.
- Feedback is owned by user but linked to a specific conversation.

---

## 5. Migration Rules

### Current Setup
- **Development**: `drizzle-kit push` applies schema changes directly. No migration files are maintained.
- **Drizzle Kit Config**: `fastify/drizzle.config.ts` — strict mode enabled, verbose logging.
- **Output**: Generated SQL files go to `fastify/drizzle/`.
- **Connection**: Uses `DATABASE_URL` from environment.

### Rules
1. **Never manually edit** the production database — always use Drizzle tooling.
2. **Use `drizzle-kit push`** for development schema changes.
3. **Use `drizzle-kit generate` + `drizzle-kit migrate`** for production deployments.
4. **Review generated SQL** before applying — `drizzle-kit push` shows the SQL it will execute.
5. **Never drop columns or tables** without explicit instruction — data loss is irreversible.
6. **Breaking schema changes** require a DECISIONS.md entry if they change data access patterns.
7. **Add new columns with defaults** — never leave existing rows with NULL required fields.

---

## 6. Query Patterns

### Preferred: Drizzle Query Builder

```typescript
// Select
const [user] = await app.db.select().from(users).where(eq(users.id, id)).limit(1);

// Insert with returning
const [created] = await app.db.insert(table).values({...}).returning();

// Update with returning
const [updated] = await app.db.update(table).set({...}).where(eq(table.id, id)).returning();

// Delete
await app.db.delete(table).where(eq(table.id, id));

// Ordered + paginated
const rows = await app.db.select().from(table)
  .where(eq(table.userId, userId))
  .orderBy(desc(table.createdAt))
  .limit(limit).offset(offset);
```

### Raw SQL (Allowed When Justified)

Raw SQL is allowed only for:
- Performance optimization (Drizzle is verified as the bottleneck).
- Complex queries (recursive CTEs, window functions, materialized views).
- PostgreSQL-specific features not supported by Drizzle.
- Migrations requiring raw DDL.
- Reporting or analytics queries.

**Requirements:**
```typescript
// Raw SQL justification:
// Drizzle query builder cannot express this full-text ranking cleanly.
// User input is parameterized through sql placeholders.
const results = await app.db.execute(sql`...`);
```

- Parameterized queries only — never concatenate user input.
- Document the justification in a comment above the query.
- Add to DECISIONS.md if it introduces a major pattern.

---

## 7. Transactions

Use `app.db.transaction()` when multiple operations must succeed or fail together:

```typescript
await app.db.transaction(async (tx) => {
  await tx.insert(conversations).values({...});
  await tx.update(users).set({ tokenBalance: sql`token_balance - 1` }).where(eq(users.id, userId));
  await tx.insert(tokenLedger).values({...});
});
```

**When transactions are required:**
- Chat response: save user message + save assistant message + deduct token + record token ledger entry.
- Budget creation: insert budget + update token balance.
- Billing: update token balance + insert token ledger entry.
- Document processing: insert document + update metadata.

---

## 8. Data Validation

- **Backend**: TypeBox schemas validate request bodies before database writes.
- **Frontend**: Never trusts frontend data — backend validates all inputs.
- **Schema**: Drizzle column types enforce basic constraints (NOT NULL, data types).
- **JSONB fields**: Arrays and objects validated at application level before insert.

---

## 9. AI Data Rules

| Data Type | Storage | Retention |
|---|---|---|
| Chat messages | `conversations` table | Persistent (user history) |
| AI responses | `conversations` table | Persistent (user history) |
| Document summaries | `documents.ai_summary` | Persistent |
| Voice transcripts | `conversations.content` (input_type='voice') | Same as chat |
| Raw voice audio | Not stored (processed + deleted) | Transient |
| TTS audio cache | In-memory (Map, 50 entries max) | Session only |
| Feedback | `feedback` table | Persistent |

**Rules:**
- Never store raw audio recordings unless user explicitly enables it.
- Voice transcripts stored as normal chat messages — no separate storage.
- Temporary files deleted after processing.

---

## 10. Financial Data Rules

- **Money columns**: `numeric(10,2)` for all amounts — never use floats.
- **Currencies**: Stored as decimal strings, default currency is BND (Brunei Dollar).
- **Token balance**: Integer — stored in both `users.token_balance` and `token_ledger` for audit trail.
- **Never silently modify** financial records — all changes tracked via `token_ledger`.
- **Budget amounts**: Stored as numeric strings, converted to numbers only for calculations.

---

## 11. File/Document Storage

- **Uploaded images**: Stored on disk in `config.UPLOAD_DIR` (default `./uploads`).
- **Metadata**: Stored in `documents` table (URL, AI summary, type, PDF URL).
- **PDF generation**: Via `pdfkit` library, output stored in uploads directory.
- **Cleanup**: No automatic cleanup implemented — uploaded files persist indefinitely.
- **Future consideration**: Implement periodic cleanup for orphaned uploads.

---

## 12. Performance

- **Indexes**: Auto-created by Drizzle for primary keys and foreign keys. No additional custom indexes configured.
- **Pagination**: Chat history uses `LIMIT` + `OFFSET` (max 100 records per request).
- **N+1 prevention**: Use `.returning()` for insert/update to avoid follow-up SELECTs.
- **Connection pooling**: `pg.Pool` manages connections efficiently.
- **Bottleneck watch**: Chat history queries the full `conversations` table ordered by `created_at DESC` — may need index on `(user_id, created_at)` at scale.

---

## 13. Security

### Access Control
- All queries filter by `request.authUser.sub` — users can only access their own data.
- Route handlers must verify ownership before mutation: `if (record.userId !== userId) return 403`.
- Auth plugin runs before all routes — unauthenticated requests rejected early.

### SQL Injection Prevention
- **Drizzle query builder**: Automatically parameterized — safe by default.
- **Raw SQL**: Must use `sql` template tag or `$1, $2` placeholders — never concatenate strings.
- See ARCHITECTURE.md §7 for raw SQL requirements.

### Sensitive Data
- `password_hash` stored as bcrypt hash — never plaintext.
- API keys in `.env` (gitignored) — never in database.
- Conversation content may contain personal information — treat as sensitive.

---

## 14. Adding New Tables

1. **Design**: Define columns, types, defaults, constraints.
2. **Check existing**: Avoid duplicating data already stored in other tables.
3. **Add to schema**: Insert `pgTable` definition in `fastify/src/db/schema.ts` before `// projx-anchor: tables`.
4. **Create migration**: Run `drizzle-kit push` to apply the new table.
5. **Update documentation**: Add table entry to DATABASE.md §3 (this file).
6. **Update BUDDY.md** file structure if the table is significant.
7. **Test**: Verify the table is created, queries work, relationships are correct.

---

## 15. Database Verification Checklist

Before completing any database task:

- [ ] Schema definition in `schema.ts` is correct
- [ ] `drizzle-kit push` executed successfully
- [ ] Foreign keys reference correct parent tables
- [ ] Ownership checks present in route handlers
- [ ] No raw SQL without justification comment
- [ ] No user input concatenated in SQL
- [ ] No accidental data loss (columns dropped without instruction)
- [ ] `pnpm typecheck` passes in `fastify/`
- [ ] DATABASE.md updated with new table/column documentation
