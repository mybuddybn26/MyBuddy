FROM node:22-bookworm-slim AS base

RUN apt-get update \
    && apt-get install -y --no-install-recommends ca-certificates \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

FROM base AS deps
COPY package.json package-lock.json ./
RUN npm ci

FROM base AS build
ENV NODE_OPTIONS="--max-old-space-size=768"
COPY --from=deps /app/node_modules ./node_modules
COPY package.json tsconfig.json tsconfig.build.json drizzle.config.ts ./
COPY src ./src
RUN npm run build

FROM build AS migrate
CMD ["sh", "-c", "npx drizzle-kit push --force"]

FROM base AS runtime
ENV NODE_ENV=production
RUN npm install -g pm2@5.4.3
RUN chown -R node /app
USER node

COPY --from=build --chown=node:node /app/node_modules ./node_modules
COPY --from=build --chown=node:node /app/dist ./dist
COPY --chown=node:node package.json ecosystem.config.cjs* ./

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=10s --start-period=20s --retries=3 \
    CMD ["node", "-e", "require('http').get('http://localhost:3000/api/health', r => process.exit(r.statusCode === 200 ? 0 : 1)).on('error', () => process.exit(1))"]

CMD ["sh", "-c", "if [ -f ecosystem.config.cjs ]; then pm2-runtime ecosystem.config.cjs; else node dist/server.js; fi"]
