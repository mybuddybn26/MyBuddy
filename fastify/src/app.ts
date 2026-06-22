import Fastify, { type FastifyInstance, type FastifyRequest } from 'fastify';
import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import rateLimit from '@fastify/rate-limit';
import multipart from '@fastify/multipart';
import { config } from './config.js';
import errorHandler from './plugins/error-handler.js';
import authPlugin from './plugins/auth.js';
import authzPlugin from './plugins/authz.js';
import requestIdPlugin from './plugins/request-id.js';
import swaggerPlugin from './plugins/swagger.js';
import { checkDatabase, closeDatabase, db } from './db/client.js';

// Module routes
import authRoutes from './modules/auth/routes.js';
import chatRoutes from './modules/chat/routes.js';
import voiceRoutes from './modules/voice/routes.js';
import ttsRoutes from './services/tts/ttsRoutes.js';
import uploadRoutes from './modules/upload/routes.js';
import transactionRoutes from './modules/transactions/routes.js';
import documentRoutes from './modules/documents/routes.js';
import personaRoutes from './modules/persona/routes.js';
import tokenRoutes from './modules/tokens/routes.js';
import billingRoutes from './modules/billing/routes.js';
import pdfRoutes from './modules/pdf/routes.js';
import budgetRoutes from './modules/budgets/routes.js';
import feedbackRoutes from './modules/feedback/routes.js';
import usageRoutes from './modules/usage/routes.js';
// projx-anchor: imports
// projx-anchor: entity-imports

export interface BuildAppOptions {
  logger?: boolean | object;
}

export async function buildApp(
  options: BuildAppOptions = {},
): Promise<FastifyInstance> {
  const app = Fastify({
    logger: options.logger ?? { level: config.LOG_LEVEL },
    genReqId: (req) =>
      (req.headers['x-request-id'] as string) || crypto.randomUUID(),
  });

  app.decorate('db', db);
  await app.register(helmet, { contentSecurityPolicy: false });
  await app.register(cors, {
    origin: config.CORS_ALLOW_ORIGINS.split(',').map((o) => o.trim()),
    credentials: true,
  });
  await app.register(rateLimit, {
    max: config.RATE_LIMIT_MAX,
    timeWindow: config.RATE_LIMIT_WINDOW,
    keyGenerator: (request: FastifyRequest) =>
      request.authUser?.sub ?? request.ip,
  });
  await app.register(multipart, {
    limits: {
      fileSize: config.MAX_FILE_SIZE_MB * 1024 * 1024,
    },
  });

  await app.register(swaggerPlugin);
  await app.register(errorHandler);
  await app.register(requestIdPlugin);
  await app.register(authPlugin);
  await app.register(authzPlugin);

  // projx-anchor: plugins

  // ─── Static file serving for uploads ───
  app.get(
    '/uploads/:filename',
    { config: { public: true }, schema: { tags: ['upload'] } },
    async (request, reply) => {
      const { filename } = request.params as { filename: string };
      const { createReadStream, existsSync } = await import('node:fs');
      const { join } = await import('node:path');
      const filepath = join(config.UPLOAD_DIR, filename);

      if (!existsSync(filepath)) {
        return reply.status(404).send({ detail: 'File not found' });
      }

      const ext = filename.split('.').pop() || 'bin';
      const mimeMap: Record<string, string> = {
        jpg: 'image/jpeg',
        jpeg: 'image/jpeg',
        png: 'image/png',
        gif: 'image/gif',
        webp: 'image/webp',
      };

      reply.header('Content-Type', mimeMap[ext] || 'application/octet-stream');
      return reply.send(createReadStream(filepath));
    },
  );

  app.get(
    '/api/health',
    {
      config: { public: true },
      schema: {
        tags: ['health'],
      },
    },
    async (_request, reply) => {
      const checks: Record<string, string> = { app: 'ok' };
      try {
        await checkDatabase();
        checks.database = 'ok';
      } catch (e) {
        checks.database = `error: ${e instanceof Error ? e.message : String(e)}`;
        return reply.status(503).send({ status: 'unhealthy', checks });
      }
      return reply.send({ status: 'healthy', checks });
    },
  );

  // ─── Register all feature modules ───
  await app.register(authRoutes);
  await app.register(chatRoutes);
  await app.register(voiceRoutes);
  await app.register(ttsRoutes);
  await app.register(uploadRoutes);
  await app.register(transactionRoutes);
  await app.register(documentRoutes);
  await app.register(personaRoutes);
  await app.register(tokenRoutes);
  await app.register(billingRoutes);
  await app.register(pdfRoutes);
  await app.register(budgetRoutes);
  await app.register(feedbackRoutes);
  await app.register(usageRoutes);

  // projx-anchor: entity-registrations

  app.addHook('onClose', async () => {
    await closeDatabase();
  });

  return app;
}

declare module 'fastify' {
  interface FastifyInstance {
    db: typeof db;
  }
}
