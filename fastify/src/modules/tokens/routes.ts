import fp from 'fastify-plugin';
import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { eq, desc } from 'drizzle-orm';
import { users, tokenLedger } from '../../db/schema.js';

export default fp(async (app: FastifyInstance) => {
  // ─── Get Token Balance + Recent History ───
  app.get(
    '/api/tokens/balance',
    { schema: { tags: ['tokens'] } },
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

      const history = await app.db
        .select()
        .from(tokenLedger)
        .where(eq(tokenLedger.userId, userId))
        .orderBy(desc(tokenLedger.createdAt))
        .limit(20);

      return reply.send({
        balance: user.tokenBalance,
        monthly_limit: 200,
        usage_percent: Math.round(((200 - user.tokenBalance) / 200) * 100),
        history,
      });
    },
  );

  // ─── Admin: Reset all token balances to 200 (demo/admin endpoint) ───
  // TODO: Replace with a real scheduler (node-cron / Supabase scheduled function)
  app.post(
    '/api/admin/reset-tokens',
    { schema: { tags: ['tokens'] } },
    async (_request: FastifyRequest, reply: FastifyReply) => {
      const allUsers = await app.db.select().from(users);

      for (const user of allUsers) {
        await app.db
          .update(users)
          .set({ tokenBalance: 200 })
          .where(eq(users.id, user.id));

        await app.db.insert(tokenLedger).values({
          userId: user.id,
          changeAmount: 200,
          reason: 'monthly_grant',
        });
      }

      return reply.send({
        detail: `Reset tokens to 200 for ${allUsers.length} users`,
        count: allUsers.length,
      });
    },
  );
});
