import fp from 'fastify-plugin';
import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { eq, desc } from 'drizzle-orm';
import { users, tokenLedger } from '../../db/schema.js';
import { getMonthlyCredits } from '../../lib/creditCosts.js';

export default fp(async (app: FastifyInstance) => {
  // ─── Get Buddy Credits Balance + Recent History ───
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

      const monthlyLimit = getMonthlyCredits(user.subscriptionTier);

      const history = await app.db
        .select()
        .from(tokenLedger)
        .where(eq(tokenLedger.userId, userId))
        .orderBy(desc(tokenLedger.createdAt))
        .limit(20);

      const used = Math.max(0, monthlyLimit - user.tokenBalance);
      return reply.send({
        balance: user.tokenBalance,
        monthly_limit: monthlyLimit,
        usage_percent: Math.round((used / monthlyLimit) * 100),
        plan: user.subscriptionTier,
        history,
      });
    },
  );

  // ─── Admin: Reset all credit balances (demo/admin endpoint) ───
  app.post(
    '/api/admin/reset-tokens',
    { schema: { tags: ['tokens'] } },
    async (_request: FastifyRequest, reply: FastifyReply) => {
      const allUsers = await app.db.select().from(users);

      for (const user of allUsers) {
        const limit = getMonthlyCredits(user.subscriptionTier);
        await app.db
          .update(users)
          .set({ tokenBalance: limit })
          .where(eq(users.id, user.id));

        await app.db.insert(tokenLedger).values({
          userId: user.id,
          changeAmount: limit,
          reason: 'monthly_grant',
        });
      }

      return reply.send({
        detail: `Reset credits for ${allUsers.length} users`,
        count: allUsers.length,
      });
    },
  );
});
