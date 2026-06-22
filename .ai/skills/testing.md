# Testing

> For the complete verification specification, commands, manual checklists, and testing gaps, see `.ai/TESTING.md`.

## Stack

- **Backend**: Vitest + real PostgreSQL
- **Frontend**: Vitest + React Testing Library + jsdom

## Quality Gates

```bash
cd fastify && pnpm typecheck   # 0 errors
cd vitejs && pnpm typecheck    # 0 errors
```

## Test Location

- Backend tests: `fastify/tests/` — mirrors `src/` structure.
- Frontend tests: `vitejs/tests/` — mirrors `src/` structure.
- **Never** put tests inside `src/`.

## Writing Tests

- Query by role/label/text, not by class or test-id.
- Frontend: use `@testing-library/react` render + queries.
- Backend: use Vitest with real DB connection (requires `DATABASE_URL`).

## Verification Before Committing

1. `pnpm typecheck` in both directories
2. Ensure no broken imports
3. Ensure existing functionality still works

## Common Mistakes

- Putting test files in `src/` instead of `tests/`.
- Skipping typecheck before pushing.
- Not testing error states.

## Verification

- [ ] TypeScript compiles in both projects
- [ ] No test files in `src/`
- [ ] New features have corresponding tests (when applicable)
