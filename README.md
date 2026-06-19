# mybuddy

Scaffolded with [Projx](https://github.com/ukanhaupa/projx).

## Stack

| Layer | Technology |
| ----- | ---------- |
| **fastify/** | Fastify, Drizzle, TypeBox, TypeScript |
| **vitejs/** | React 19, TypeScript, Vite, React Router |
| **Identity** | OIDC / JWT |
| **Containers** | Docker, Docker Compose |

## Getting Started

```bash
./scripts/setup.sh           # Install all dependencies
# Ensure PostgreSQL is running locally, then run `npm run dev` in each service.
# Production stack: docker compose up --build
```

### fastify/

```bash
cd fastify && cp .env.example .env && npm install && npx drizzle-kit push --force && npm run dev
```

API docs at `http://localhost:3000/docs`.

### vitejs/

```bash
cd vitejs && cp .env.example .env && npm install && npm run dev
```

## Testing

```bash
cd fastify && npm run test
cd vitejs && npx vitest run
```

## Update

```bash
npx create-projx@latest update
```

---

[![Built with Projx](https://img.shields.io/badge/Built%20with-Projx-blue)](https://github.com/ukanhaupa/projx)
