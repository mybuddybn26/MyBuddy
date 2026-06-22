# Architecture

## Project Structure

```
mybuddy/
├── fastify/     ← Backend (Fastify 5 + Drizzle + DeepSeek)
├── vitejs/      ← Frontend (React 19 + Vite + Tailwind)
├── whisper-stt/ ← Self-hosted STT (optional)
├── kokoro-tts/  ← Self-hosted TTS (optional)
```

## Key Principles

- **Separation of concerns** — backend never renders HTML; frontend never accesses DB directly.
- **Single API wrapper** — all frontend HTTP goes through `vitejs/src/api.ts`.
- **Centralized config** — all env vars in `fastify/src/config.ts` (TypeBox-validated).
- **Modular routes** — each domain has its own module in `fastify/src/modules/<name>/`.
- **Service layer** — business logic in services, routes stay thin.

## Adding a New Feature

1. **Backend**: Create module in `fastify/src/modules/<name>/routes.ts`, register in `app.ts`.
2. **Frontend**: Add API method in `vitejs/src/api.ts`, create UI in `vitejs/src/components/`.
3. **Database**: Add table in `fastify/src/db/schema.ts`, run `drizzle-kit push`.

## Plugin Order (Fastify — do NOT rearrange)

```
helmet → cors → rateLimit → swagger → error-handler → request-id → auth → authz → routes
```

## Common Mistakes

- Don't put business logic in route handlers — extract to services.
- Don't skip adding new API endpoints to `vitejs/src/api.ts`.
- Don't forget to register new plugins in `fastify/src/app.ts`.
- Don't change the load-bearing plugin order.

## Verification

- [ ] New module registered in `app.ts`
- [ ] New API method added to `vitejs/src/api.ts`
- [ ] Route uses TypeBox validation on input
- [ ] Error responses use `{ detail, request_id }` format
