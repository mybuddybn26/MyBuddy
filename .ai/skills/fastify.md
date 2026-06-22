# Fastify (Backend)

> For the complete API contract, all endpoints, request/response formats, and frontend rules, see `.ai/API.md`.

## Framework

- **Fastify 5** with TypeScript ESM.
- **Plugins**: registered via `fp` (fastify-plugin) wrapper.
- **Validation**: TypeBox schemas on all route inputs.
- **Auth**: JWT verified via `jose` + `@fastify/jwt`.

## Route Pattern

```typescript
import fp from 'fastify-plugin';
import { Type } from '@sinclair/typebox';

const MyBody = Type.Object({ field: Type.String() });

export default fp(async (app: FastifyInstance) => {
  app.post('/api/my-route', { schema: { body: MyBody } }, async (request, reply) => {
    const body = request.body as { field: string };
    // ... business logic ...
    return reply.send({ data: result });
  });
});
```

## Registration

- Import route module in `fastify/src/app.ts`.
- Register with `await app.register(myRoutes)` after auth plugins.
- Registration order: auth routes first, then feature modules alphabetically.

## Error Handling

- Use `reply.status(n).send({ detail: 'message' })` — never raw strings.
- Centralized error handler in `plugins/error-handler.ts` maps Prisma codes to HTTP statuses.
- Log errors with `request.log.error()`.

## Config

- All env vars in `config.ts` with TypeBox schema validation.
- Access via `config.KEY_NAME` (never `process.env` directly).

## Database

- Drizzle ORM with PostgreSQL.
- Schema in `db/schema.ts`.
- Run `drizzle-kit push` for migrations.

## Common Mistakes

- Forgetting to register the route in `app.ts`.
- Not using TypeBox validation on request body.
- Returning raw error strings instead of `{ detail }`.
- Direct `process.env` access instead of `config.KEY_NAME`.

## Verification

- [ ] Route registered in `app.ts`
- [ ] TypeBox validation on input
- [ ] Error responses use `{ detail }`
- [ ] Config accessed via `config.NAME`
- [ ] `pnpm typecheck` passes
