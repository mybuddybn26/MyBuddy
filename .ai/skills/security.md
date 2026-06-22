# Security

## Environment Variables

- All secrets in `.env` (gitignored).
- Template in `.env.example` (committed, no real values).
- Access via `fastify/src/config.ts` (TypeBox-validated).
- Never hardcode keys in source code.

## Authentication

- JWT-based auth via `@fastify/jwt` + `jose`.
- Frontend auth module: `vitejs/src/auth.ts`.
- Tokens stored in localStorage, attached as Bearer header.
- Auto-refresh via `ensureFreshToken()`.

## API Security

- All routes require auth unless marked `config: { public: true }`.
- Input validated with TypeBox schemas.
- CORS configured via `CORS_ALLOW_ORIGINS` env var.
- Rate limiting via `@fastify/rate-limit`.

## File Uploads

- Max file size enforced via `MAX_FILE_SIZE_MB` config.
- MIME type validated on upload.
- Uploads stored locally in `UPLOAD_DIR`.

## Data Privacy

- Never log PII or conversation content.
- Delete temporary audio files after processing.
- `.env` is in `.gitignore` — never committed.

## CI Security

- Gitleaks runs in CI to detect secrets.
- `.env.test` and `.env.example` are allowlisted.
- Pre-commit hooks check for accidental secret commits.

## Common Mistakes

- Committing `.env` files with real keys.
- Exposing API keys in chat or logs.
- Not setting up `.gitignore` for new secret-containing files.

## Verification

- [ ] No secrets in committed code
- [ ] `.env` is gitignored
- [ ] API keys accessed via `config.NAME`
- [ ] File uploads have size limits
