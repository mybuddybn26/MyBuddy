import fp from 'fastify-plugin';
import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { eq } from 'drizzle-orm';
import { Type } from '@sinclair/typebox';
import { users } from '../../db/schema.js';
import type { AiPersona } from '../../db/schema.js';

const UpdatePersonaBody = Type.Object({
  name: Type.Optional(Type.String({ minLength: 1, maxLength: 50 })),
  language: Type.Optional(
    Type.Union([
      Type.Literal('en'),
      Type.Literal('ms'),
      Type.Literal('zh'),
      Type.Literal('mixed'),
    ]),
  ),
  tone: Type.Optional(
    Type.Union([
      Type.Literal('formal'),
      Type.Literal('casual'),
      Type.Literal('slang'),
    ]),
  ),
  dialect: Type.Optional(
    Type.Union([Type.Literal('standard'), Type.Literal('brunei')]),
  ),
  voice_id: Type.Optional(Type.String()),
});

export default fp(async (app: FastifyInstance) => {
  // ─── Get Current Persona ───
  app.get(
    '/api/persona',
    { schema: { tags: ['persona'] } },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const userId = request.authUser!.sub;

      const [user] = await app.db
        .select()
        .from(users)
        .where(eq(users.id, userId))
        .limit(1);

      if (!user) {
        return reply.status(404).send({ detail: 'User not found' });
      }

      return reply.send(user.aiPersona);
    },
  );

  // ─── Update Persona ───
  app.patch(
    '/api/persona',
    { schema: { tags: ['persona'], body: UpdatePersonaBody } },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const userId = request.authUser!.sub;
      const updates = request.body as Partial<AiPersona>;

      const [user] = await app.db
        .select()
        .from(users)
        .where(eq(users.id, userId))
        .limit(1);

      if (!user) {
        return reply.status(404).send({ detail: 'User not found' });
      }

      const current = user.aiPersona as AiPersona;
      const merged: AiPersona = { ...current, ...updates };

      await app.db
        .update(users)
        .set({ aiPersona: merged })
        .where(eq(users.id, userId));

      return reply.send(merged);
    },
  );
});
