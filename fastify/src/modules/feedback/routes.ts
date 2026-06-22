import fp from 'fastify-plugin';
import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { Type } from '@sinclair/typebox';
import { feedback, conversations } from '../../db/schema.js';
import { eq } from 'drizzle-orm';
import { config } from '../../config.js';

const FeedbackBody = Type.Object({
  conversationId: Type.String({ format: 'uuid' }),
  rating: Type.Union([Type.Literal('good'), Type.Literal('bad')]),
  reasons: Type.Optional(Type.Array(Type.String())),
  feedbackText: Type.Optional(Type.String({ maxLength: 1000 })),
});

export default fp(async (app: FastifyInstance) => {
  app.post(
    '/api/feedback',
    { schema: { tags: ['feedback'], body: FeedbackBody } },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const userId = request.authUser!.sub;
      const body = request.body as {
        conversationId: string;
        rating: 'good' | 'bad';
        reasons?: string[];
        feedbackText?: string;
      };

      const [conv] = await app.db
        .select()
        .from(conversations)
        .where(eq(conversations.id, body.conversationId))
        .limit(1);

      if (!conv) {
        return reply.status(404).send({ detail: 'Conversation not found' });
      }

      if (conv.userId !== userId) {
        return reply.status(403).send({ detail: 'Not your conversation' });
      }

      const model = config.DEEPSEEK_MODEL || 'deepseek-chat';

      await app.db.insert(feedback).values({
        userId,
        conversationId: body.conversationId,
        rating: body.rating,
        reasons: body.reasons || [],
        feedbackText: body.feedbackText || '',
        model,
      });

      return reply.send({ status: 'ok' });
    },
  );
});
