import fp from 'fastify-plugin';
import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { Type } from '@sinclair/typebox';
import { eq, and, desc } from 'drizzle-orm';
import { memories } from '../../db/schema.js';

const CreateMemoryBody = Type.Object({
  type: Type.String({ default: 'preference' }),
  content: Type.String({ minLength: 1, maxLength: 2000 }),
  importance: Type.Optional(Type.Number({ minimum: 1, maximum: 5 })),
});

const UpdateMemoryBody = Type.Object({
  type: Type.Optional(Type.String()),
  content: Type.Optional(Type.String({ minLength: 1, maxLength: 2000 })),
  importance: Type.Optional(Type.Number({ minimum: 1, maximum: 5 })),
});

export default fp(async (app: FastifyInstance) => {
  app.get(
    '/api/memories',
    { schema: { tags: ['memory'] } },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const userId = request.authUser!.sub;
      const rows = await app.db
        .select()
        .from(memories)
        .where(eq(memories.userId, userId))
        .orderBy(desc(memories.updatedAt));
      return reply.send({ data: rows, count: rows.length });
    },
  );

  app.post(
    '/api/memories',
    { schema: { tags: ['memory'], body: CreateMemoryBody } },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const userId = request.authUser!.sub;
      const body = request.body as {
        type: string;
        content: string;
        importance?: number;
      };
      const [record] = await app.db
        .insert(memories)
        .values({
          userId,
          type: body.type,
          content: body.content,
          importance: body.importance || 1,
        })
        .returning();
      return reply.status(201).send(record);
    },
  );

  app.patch(
    '/api/memories/:id',
    { schema: { tags: ['memory'], body: UpdateMemoryBody } },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const userId = request.authUser!.sub;
      const { id } = request.params as { id: string };
      const body = request.body as Record<string, unknown>;

      const [record] = await app.db
        .select()
        .from(memories)
        .where(and(eq(memories.id, id), eq(memories.userId, userId)))
        .limit(1);

      if (!record)
        return reply.status(404).send({ detail: 'Memory not found' });

      const updates: Record<string, unknown> = { updatedAt: new Date() };
      if (body.type) updates.type = body.type;
      if (body.content) updates.content = body.content;
      if (body.importance !== undefined) updates.importance = body.importance;

      const [updated] = await app.db
        .update(memories)
        .set(updates)
        .where(eq(memories.id, id))
        .returning();
      return reply.send(updated);
    },
  );

  app.delete(
    '/api/memories/:id',
    { schema: { tags: ['memory'] } },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const userId = request.authUser!.sub;
      const { id } = request.params as { id: string };

      const [record] = await app.db
        .select()
        .from(memories)
        .where(and(eq(memories.id, id), eq(memories.userId, userId)))
        .limit(1);

      if (!record)
        return reply.status(404).send({ detail: 'Memory not found' });
      await app.db.delete(memories).where(eq(memories.id, id));
      return reply.status(204).send();
    },
  );
});
