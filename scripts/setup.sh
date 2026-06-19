#!/usr/bin/env bash
set -e

git config core.hooksPath .githooks
echo "Git hooks configured."

(
  cd fastify
  npm install
  if [ -f drizzle.config.ts ]; then
    if [ -n "$DATABASE_URL" ]; then
      npx drizzle-kit push --force
    else
      echo "Fastify: skipping Drizzle schema push (DATABASE_URL not set)."
    fi
  fi
)
if [ ! -f fastify/.env ] && [ -f fastify/.env.example ]; then
  cp fastify/.env.example fastify/.env
  echo "fastify/.env created from .env.example."
fi
echo "Fastify dependencies installed."

(
  cd vitejs
  npm install
)
if [ ! -f vitejs/.env ] && [ -f vitejs/.env.example ]; then
  cp vitejs/.env.example vitejs/.env
  echo "vitejs/.env created from .env.example."
fi
echo "React + Vite dependencies installed."

echo ""
echo "Done. Ensure PostgreSQL is running locally, then run 'npm run dev' (or 'uv run main.py') in each service."
