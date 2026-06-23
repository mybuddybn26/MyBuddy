# DEPLOYMENT.md — Buddy Deployment Specification

> **Permanent deployment specification for Buddy.**
> Every production deployment, environment change, and infrastructure decision must follow this document.

---

## 1. Deployment Philosophy

Production deployments must be:

- **Repeatable** — same steps produce same result every time.
- **Secure** — secrets never in code; HTTPS enforced; health checks active.
- **Tested** — `pnpm typecheck` + `pnpm build` pass before deployment.
- **Reversible** — rollback path known before pushing changes.
- **Observable** — logs, health checks, and restart policies configured.

---

## 2. Production Environment (Render + Neon)

| Layer        | Technology                | Details                                      |
| ------------ | ------------------------- | -------------------------------------------- |
| **Frontend** | Render Static Site (Free) | React 19 + Vite 6; auto-deploy from GitHub   |
| **Backend**  | Render Web Service (Free) | Fastify 5 + Node 22; auto-deploy from GitHub |
| **Database** | Neon PostgreSQL (Free)    | Serverless PostgreSQL; 0.5 GB storage        |
| **SSL**      | Render/Neon managed       | Automatic TLS termination                    |
| **CI/CD**    | GitHub Actions → Render   | Auto-deploy on push to main via Blueprint    |

### Alternative: Self-Hosted (Docker Compose)

| Layer                | Technology                | Details                                               |
| -------------------- | ------------------------- | ----------------------------------------------------- |
| **Frontend**         | React 19 + Vite 6         | Built via `vite build`, served by nginx               |
| **Backend**          | Fastify 5 + Node 20+      | Built via `tsc`, run via `node dist/server.js`        |
| **Database**         | PostgreSQL                | Connection via `DATABASE_URL` env var                 |
| **Containerization** | Docker + Docker Compose   | 4 services: fastify-migrate, fastify, vitejs, certbot |
| **SSL**              | Let's Encrypt via Certbot | Auto-renewal via cron                                 |
| **Package Manager**  | pnpm                      | Used for installs                                     |

---

## 3. Render Blueprint Deployment

### Quick Deploy

1. Push this repo to GitHub.
2. Create a **Neon PostgreSQL** project at https://neon.tech (free tier).
3. On Render dashboard, create a new **Blueprint** pointing to this repo.
   - `render.yaml` configures `buddy-api` (backend web service) automatically.
   - **Frontend must be created manually** — Render Blueprint does not support `type: static`.
4. **Manually create** the frontend static site in Render dashboard:
   - New → Static Site → connect same GitHub repo
   - Build command: `cd vitejs && pnpm install --frozen-lockfile && pnpm build`
   - Publish directory: `vitejs/dist`
   - Env var: `VITE_API_URL` → backend URL (e.g. `https://buddy-api.onrender.com`)
   - Rewrite rule: `/*` → `/index.html` (SPA routing)
5. Set these env vars on `buddy-api` in Render dashboard (secrets with `sync: false`):
   - `DATABASE_URL` — Neon PostgreSQL connection string (includes `sslmode=require`)
   - `JWT_SECRET` — 48+ char random string (`openssl rand -base64 48`)
   - `CORS_ALLOW_ORIGINS` — Render frontend URL (e.g. `https://mybuddy-app.onrender.com`)
   - `DEEPSEEK_API_KEY`, `ASSEMBLYAI_API_KEY`, `DEEPGRAM_API_KEY` — AI/voice provider keys
   - `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET` — optional (payments)
   - `CRED_ENCRYPTION_KEY` — 32-byte base64 (`openssl rand -base64 32`)
6. Deploy — Render builds and starts both services automatically.

### render.yaml Services

| Service     | Type        | Source                                    |
| ----------- | ----------- | ----------------------------------------- |
| `buddy-api` | Web Service | Blueprint (`render.yaml`) — auto-deployed |
| `buddy-app` | Static Site | Manual in dashboard — no `static` in YAML |

### Render-Specific Notes

- **PORT**: Render sets `PORT` env var automatically — `config.ts` reads `process.env.PORT ?? 3000`.
- **HOST**: Set to `0.0.0.0` in Render env vars or rely on config default.
- **Start command**: `node dist/server.js` — no `--env-file` (env vars come from Render dashboard).
- **Auto-deploy**: Enabled — push to `main` triggers automatic redeploy.
- **Build isolation**: Render runs `buildCommand` from repo root; paths use `cd fastify` or `cd vitejs`.
- **Ephemeral filesystem**: Uploads stored in `/tmp/uploads` are lost on restart. Use S3/Cloudinary for production file storage.

---

## 4. Docker Compose (Self-Hosted Alternative)

| Service           | Purpose                                   | Ports                  | Health Check              |
| ----------------- | ----------------------------------------- | ---------------------- | ------------------------- |
| `fastify-migrate` | Run database migrations before app starts | —                      | Completes then exits      |
| `fastify`         | Backend API                               | 3000 (internal)        | HTTP GET /api/health/live |
| `vitejs`          | Frontend SPA via nginx                    | 80 (HTTP), 443 (HTTPS) | HTTPS wget spider         |
| `certbot`         | SSL certificate renewal                   | —                      | Auto-renews every 12h     |

### Startup Order

```
fastify-migrate (must complete) → fastify (must be healthy) → vitejs (must be healthy) → certbot (optional, ssl profile)
```

### Restart Policy

All services: `restart: unless-stopped`

---

## 4. Environment Variables

### Required (all environments)

| Variable       | Purpose                        | Severity     |
| -------------- | ------------------------------ | ------------ |
| `DATABASE_URL` | PostgreSQL connection string   | **Critical** |
| `JWT_SECRET`   | JWT signing key (min 32 chars) | **Critical** |

### Required for AI Features

| Variable                | Purpose                      |
| ----------------------- | ---------------------------- |
| `DEEPSEEK_API_KEY`      | AI chat/vision               |
| `ASSEMBLYAI_API_KEY`    | Speech-to-text               |
| `DEEPGRAM_API_KEY`      | Text-to-speech               |
| `STRIPE_SECRET_KEY`     | Payments                     |
| `STRIPE_WEBHOOK_SECRET` | Payment webhook verification |

### Optional

| Variable             | Default                  | Purpose                    |
| -------------------- | ------------------------ | -------------------------- |
| `CORS_ALLOW_ORIGINS` | `http://localhost:5173`  | Allowed origins            |
| `GROQ_API_KEY`       | —                        | STT fallback               |
| `OLLAMA_URL`         | `http://127.0.0.1:11434` | Local AI fallback          |
| `ELEVENLABS_API_KEY` | —                        | TTS (if credits available) |
| `KOKORO_TTS_URL`     | `http://127.0.0.1:8001`  | Self-hosted TTS            |
| `WHISPER_STT_URL`    | `http://127.0.0.1:8002`  | Self-hosted STT            |

### Frontend

- `DOMAIN` — server domain for SSL (default: `localhost`).
- `VITE_API_URL` — API base URL (empty in Docker — nginx proxies `/api`).

### Rules

- **Never commit `.env` files** — template in `.env.example`.
- **Backend-only secrets** — frontend never receives API keys.
- **Production values differ from dev** — review every value before deploying.

---

## 5. Build Process

```bash
# Backend
cd fastify
pnpm install --frozen-lockfile
pnpm typecheck
pnpm build            # tsc -p tsconfig.build.json → dist/
pnpm db:push          # Apply schema changes (dev) or db:migrate (prod)

# Frontend
cd vitejs
pnpm install --frozen-lockfile
pnpm typecheck
pnpm build            # vite build → dist/

# Docker (production)
docker compose up --build

# Validate nginx config (before deploying)
bash scripts/validate-nginx-config.sh
```

> **Nginx HTTP/2 syntax**: Use `listen 443 ssl http2;` (parameter on listen directive), NOT `http2 on;` (standalone directive). The standalone form was deprecated in nginx 1.25+ and removed in newer versions.

---

## 6. Database Deployment

### Development

```bash
cd fastify && npx drizzle-kit push
```

### Production

```bash
cd fastify && npx drizzle-kit generate && npx drizzle-kit migrate
```

### Safety Rules

- **Never run `drizzle-kit push` on production** — use `generate` + `migrate` to review SQL first.
- **Back up database** before applying migrations.
- **Test migrations** on a staging database first.
- **No destructive changes** (DROP TABLE, DROP COLUMN) without explicit approval and backup.

### Rollback

- No automated rollback — manual snapshot restore from backup.
- Cascade deletes are irreversible — verify before adding.

---

## 7. External Services

| Service        | Production Requirement                            |
| -------------- | ------------------------------------------------- |
| **DeepSeek**   | Valid API key with sufficient credits             |
| **AssemblyAI** | Valid API key (50 free hours, then paid)          |
| **Deepgram**   | Valid API key with credits                        |
| **Stripe**     | Live keys in production, test keys in development |

### Health Check Dependencies

- If any external API is unreachable, the app degrades gracefully (fallback providers, error messages) — but core chat/voice won't work without AI/STT/TTS.

---

## 8. File Storage

- **Uploads**: Stored in `config.UPLOAD_DIR` (default `./uploads`).
- **Docker**: Volume mount required for persistent uploads (not currently configured in docker-compose — **gap**).
- **Cleanup**: No automatic cleanup — orphaned files accumulate.
- **Public access**: `/uploads/:filename` served directly — configure CDN or auth for production.

---

## 9. Security Before Production

- [ ] HTTPS enforced (nginx + Let's Encrypt configured via certbot)
- [ ] JWT secret is strong (48+ bytes, generated via `crypto.randomBytes`)
- [ ] CORS restricted to production domain
- [ ] Rate limiting enabled (200 req/min default — adjust for expected load)
- [ ] Admin endpoints reviewed and secured
- [ ] `.env` not committed; secrets managed via environment or secret manager
- [ ] Error messages don't leak stack traces (`LOG_LEVEL=info` in production)
- [ ] CSP headers configured (not currently — gap)

---

## 10. Monitoring (Future)

Production monitoring not yet configured. Recommended:

- **Health checks**: Existing Docker health checks cover uptime.
- **Logs**: Docker logs or centralized logging (ELK, Datadog, etc.).
- **Errors**: Track 500 errors, AI failures, payment failures.
- **Latency**: API response times, AI response times.
- **Costs**: DeepSeek token usage, AssemblyAI hours, Deepgram characters.

---

## 11. Scaling Rules

Current architecture is single-instance. At scale:

| Component    | Scaling Strategy                                                                   |
| ------------ | ---------------------------------------------------------------------------------- |
| **Frontend** | Static files — serve via CDN                                                       |
| **Backend**  | Horizontal scaling via load balancer (stateless except uploads/TTS cache)          |
| **Database** | Connection pooling already configured; add read replicas for query-heavy workloads |
| **AI**       | DeepSeek handles scaling; Ollama is local only                                     |
| **Voice**    | TTS cache reduces API calls; STT is per-user                                       |

---

## 12. Rollback Plan

1. **Code rollback**: `git revert` the problematic commit, rebuild, redeploy.
2. **Database rollback**: Restore from pre-migration backup. No automated migration reversal.
3. **Docker rollback**: `docker compose down && git checkout <stable> && docker compose up --build -d`.
4. **Certificate rollback**: Certbot auto-renews — no manual intervention needed.

---

## 13. Deployment Checklist

Before deploying to production:

- [ ] `pnpm typecheck` passes in both `fastify/` and `vitejs/`
- [ ] `pnpm build` succeeds in both projects
- [ ] All env vars configured with production values
- [ ] Database migrations applied successfully
- [ ] External API keys set and verified
- [ ] CORS origins set to production domain
- [ ] Rate limits configured for expected traffic
- [ ] Health checks passing (`/api/health` returns 200)
- [ ] HTTPS working (SSL certificate valid)
- [ ] Auth working (login, token refresh)
- [ ] AI chat responding
- [ ] Voice STT + TTS working
- [ ] File uploads working with persistent storage
- [ ] Error responses safe (no stack traces)
- [ ] Rollback plan documented and accessible

---

## 14. Production Readiness Assessment

| Area               | Status  | Action Needed                                        |
| ------------------ | ------- | ---------------------------------------------------- |
| Containerization   | Ready   | Docker Compose with health checks                    |
| SSL                | Ready   | Let's Encrypt auto-renew via certbot                 |
| Database           | Ready   | Drizzle migrations                                   |
| AI/STT/TTS         | Ready   | Requires API keys with credits                       |
| Upload persistence | **Gap** | Docker volume for upload dir not configured          |
| Monitoring         | **Gap** | No production monitoring                             |
| CI/CD              | **Gap** | GitHub Actions for testing only — no deploy pipeline |
| Backups            | **Gap** | No automated database backup                         |
| Scaling            | **Gap** | Single-instance, no load balancing                   |
