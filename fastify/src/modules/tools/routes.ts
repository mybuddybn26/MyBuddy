import fp from 'fastify-plugin';
import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { Type } from '@sinclair/typebox';
import { getTool } from '../../ai/tools/index.js';

const ConfirmBody = Type.Object({
  confirmationId: Type.String({ minLength: 1 }),
});

type Pending = Record<string, { tool: string; params: Record<string, unknown>; userId: string }>;

export default fp(async (app: FastifyInstance) => {
  const store = app as unknown as { _tc?: Pending };
  if (!store._tc) store._tc = {};
  const confirmations = store._tc;

  app.post(
    '/api/tools/confirm',
    { schema: { tags: ['tools'], body: ConfirmBody } },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { confirmationId } = request.body as { confirmationId: string };
      const pending = confirmations[confirmationId];
      if (!pending) return reply.status(404).send({ detail: 'Confirmation not found' });

      const tool = getTool(pending.tool);
      if (!tool) return reply.status(400).send({ detail: `Unknown tool: ${pending.tool}` });

      const result = await tool.handler(app.db, pending.userId, pending.params);
      delete confirmations[confirmationId];

      if (result.ok) return reply.send({ ok: true, tool: pending.tool, data: result.data });
      return reply.status(422).send({ ok: false, error: result.error });
    },
  );

  app.post(
    '/api/tools/cancel',
    { schema: { tags: ['tools'], body: ConfirmBody } },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { confirmationId } = request.body as { confirmationId: string };
      delete confirmations[confirmationId];
      return reply.send({ ok: true, cancelled: true });
    },
  );
});
