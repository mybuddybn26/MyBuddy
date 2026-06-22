import fp from 'fastify-plugin';
import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { eq, desc, sql, and } from 'drizzle-orm';
import { aiUsage } from '../../db/schema.js';

export default fp(async (app: FastifyInstance) => {
  // ─── User-facing usage (no costs, no provider data) ───
  app.get(
    '/api/usage/me',
    { schema: { tags: ['usage'] } },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const userId = request.authUser!.sub;

      const rows = await app.db
        .select({
          totalRequests: sql<number>`count(*)::int`,
          totalTokens: sql<number>`coalesce(sum(${aiUsage.totalTokens}), 0)::int`,
        })
        .from(aiUsage)
        .where(eq(aiUsage.userId, userId));

      const summary = rows[0] || { totalRequests: 0, totalTokens: 0 };

      const byFeature = await app.db
        .select({
          feature: aiUsage.feature,
          count: sql<number>`count(*)::int`,
          tokens: sql<number>`coalesce(sum(${aiUsage.totalTokens}), 0)::int`,
        })
        .from(aiUsage)
        .where(and(eq(aiUsage.userId, userId), eq(aiUsage.status, 'success')))
        .groupBy(aiUsage.feature);

      return reply.send({
        summary,
        byFeature,
      });
    },
  );

  // ─── Admin-only usage (full analytics) ───
  app.get(
    '/api/usage/admin',
    { schema: { tags: ['usage', 'admin'] } },
    async (request: FastifyRequest, reply: FastifyReply) => {
      if (request.authUser?.role !== 'admin') {
        return reply.status(403).send({ detail: 'Admin access required' });
      }

      const totals = await app.db
        .select({
          totalRequests: sql<number>`count(*)::int`,
          totalTokens: sql<number>`coalesce(sum(${aiUsage.totalTokens}), 0)::int`,
          estimatedCost: sql<string>`coalesce(sum(${aiUsage.estimatedCost}), '0')::text`,
        })
        .from(aiUsage);

      const byFeature = await app.db
        .select({
          feature: aiUsage.feature,
          count: sql<number>`count(*)::int`,
          tokens: sql<number>`coalesce(sum(${aiUsage.totalTokens}), 0)::int`,
          cost: sql<string>`coalesce(sum(${aiUsage.estimatedCost}), '0')::text`,
        })
        .from(aiUsage)
        .groupBy(aiUsage.feature);

      const byModel = await app.db
        .select({
          model: aiUsage.model,
          count: sql<number>`count(*)::int`,
          tokens: sql<number>`coalesce(sum(${aiUsage.totalTokens}), 0)::int`,
          cost: sql<string>`coalesce(sum(${aiUsage.estimatedCost}), '0')::text`,
        })
        .from(aiUsage)
        .groupBy(aiUsage.model);

      const byUser = await app.db
        .select({
          userId: aiUsage.userId,
          count: sql<number>`count(*)::int`,
          tokens: sql<number>`coalesce(sum(${aiUsage.totalTokens}), 0)::int`,
          cost: sql<string>`coalesce(sum(${aiUsage.estimatedCost}), '0')::text`,
        })
        .from(aiUsage)
        .groupBy(aiUsage.userId)
        .orderBy(sql`coalesce(sum(${aiUsage.totalTokens}), 0) desc`);

      const daily = await app.db
        .select({
          date: sql<string>`to_char(${aiUsage.createdAt}, 'YYYY-MM-DD')`,
          tokens: sql<number>`coalesce(sum(${aiUsage.totalTokens}), 0)::int`,
          cost: sql<string>`coalesce(sum(${aiUsage.estimatedCost}), '0')::text`,
        })
        .from(aiUsage)
        .groupBy(sql`to_char(${aiUsage.createdAt}, 'YYYY-MM-DD')`)
        .orderBy(sql`to_char(${aiUsage.createdAt}, 'YYYY-MM-DD') desc`)
        .limit(30);

      return reply.send({ totals, byFeature, byModel, byUser, daily });
    },
  );

  // ─── User history (filtered, no costs) ───
  app.get(
    '/api/usage/me/history',
    { schema: { tags: ['usage'] } },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const userId = request.authUser!.sub;
      const query = request.query as { limit?: string; offset?: string };
      const limit = Math.min(parseInt(query.limit || '50', 10), 100);
      const offset = parseInt(query.offset || '0', 10);

      const rows = await app.db
        .select({
          id: aiUsage.id,
          model: aiUsage.model,
          feature: aiUsage.feature,
          totalTokens: aiUsage.totalTokens,
          status: aiUsage.status,
          createdAt: aiUsage.createdAt,
        })
        .from(aiUsage)
        .where(eq(aiUsage.userId, userId))
        .orderBy(desc(aiUsage.createdAt))
        .limit(limit)
        .offset(offset);

      return reply.send({ data: rows, count: rows.length });
    },
  );
});
