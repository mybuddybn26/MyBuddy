# Drizzle ORM

## Schema

- Tables defined in `fastify/src/db/schema.ts` using `pgTable`.
- Primary keys: `uuid('id').primaryKey().defaultRandom()`.
- Foreign keys: `.references(() => parentTable.id, { onDelete: 'cascade' })`.
- Timestamps: `timestamp('created_at', { withTimezone: true }).notNull().defaultNow()`.
- JSONB: `jsonb('field').$type<MyType>().notNull().default(...)`.

## Queries

- **Select**: `app.db.select().from(table).where(eq(table.id, id)).limit(1)`
- **Insert**: `app.db.insert(table).values({...}).returning()`
- **Update**: `app.db.update(table).set({...}).where(eq(table.id, id)).returning()`
- **Delete**: `app.db.delete(table).where(eq(table.id, id))`
- **Order**: `.orderBy(desc(table.createdAt))`
- **Limit/Offset**: `.limit(n).offset(m)`

## Migrations

- Run `npx drizzle-kit push` to apply schema changes directly.
- No migration files needed — push is used for development.

## Adding a New Table

1. Add `pgTable` definition in `db/schema.ts`.
2. Export the table constant.
3. Run `drizzle-kit push` to create the table.
4. Import in route files as needed.

## Common Mistakes

- Forgetting to `.returning()` after insert/update when you need the created record.
- Using raw SQL without justification — prefer Drizzle query builder for normal logic. Raw SQL is allowed when justified (see ARCHITECTURE.md §7 for requirements).
- Not adding foreign key references.

## Verification

- [ ] Table defined with proper types
- [ ] Foreign keys configured correctly
- [ ] `drizzle-kit push` runs successfully
