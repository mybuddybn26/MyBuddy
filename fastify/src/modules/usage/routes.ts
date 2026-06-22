import fp from 'fastify-plugin';
import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { eq, desc, sql, and, gte } from 'drizzle-orm';
import { aiUsage } from '../../db/schema.js';

export default fp(async (app: FastifyInstance) => {
  app.get(
    '/api/usage/me',
    { schema: { tags: ['usage'] } },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const userId = request.authUser!.sub;

      const rows = await app.db
        .select({
          totalRequests: sql<number>`count(*)::int`,
          totalInputTokens: sql<number>`coalesce(sum(${aiUsage.promptTokens}), 0)::int`,
          totalOutputTokens: sql<number>`coalesce(sum(${aiUsage.completionTokens}), 0)::int`,
          totalTokens: sql<number>`coalesce(sum(${aiUsage.totalTokens}), 0)::int`,
          estimatedCost: sql<string>`coalesce(sum(${aiUsage.estimatedCost}), '0')::text`,
        })
        .from(aiUsage)
        .where(eq(aiUsage.userId, userId));

      const summary = rows[0] || { totalRequests: 0, totalInputTokens: 0, totalOutputTokens: 0, totalTokens: 0, estimatedCost: '0' };

      const byFeature = await app.db
        .select({
          feature: aiUsage.feature,
          count: sql<number>`count(*)::int`,
          tokens: sql<number>`coalesce(sum(${aiUsage.totalTokens}), 0)::int`,
        })
        .from(aiUsage)
        .where(eq(aiUsage.userId, userId))
        .groupBy(aiUsage.feature);

      const byModel = await app.db
        .select({
          model: aiUsage.model,
          count: sql<number>`count(*)::int`,
          tokens: sql<number>`coalesce(sum(${aiUsage.totalTokens}), 0)::int`,
        })
        .from(aiUsage)
        .where(eq(aiUsage.userId, userId))
        .groupBy(aiUsage.model);

      const yesterday = new Date(Date.now() - 86400000);
      const dailyRows = await app.db
        .select({
          date: sql<string>`to_char(${aiUsage.createdAt}, 'YYYY-MM-DD')`,
          tokens: sql<number>`coalesce(sum(${aiUsage.totalTokens}), 0)::int`,
          cost: sql<string>`coalesce(sum(${aiUsage.estimatedCost}), '0')::text`,
        })
        .from(aiUsage)
        .where(and(eq(aiUsage.userId, userId), gte(aiUsage.createdAt, yesterday)))
        .groupBy(sql`to_char(${aiUsage.createdAt}, 'YYYY-MM-DD')`)
        .orderBy(sql`to_char(${aiUsage.createdAt}, 'YYYY-MM-DD')`);

      return reply.send({
        summary,
        byFeature,
        byModel,
        daily: dailyRows,
      });
    },
  );

  app.get(
    '/api/usage/me/history',
    { schema: { tags: ['usage'] } },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const userId = request.authUser!.sub;
      const query = request.query as { limit?: string; offset?: string };
      const limit = Math.min(parseInt(query.limit || '50', 10), 100);
      const offset = parseInt(query.offset || '0', 10);

      const rows = await app.db
        .select()
        .from(aiUsage)
        .where(eq(aiUsage.userId, userId))
        .orderBy(desc(aiUsage.createdAt))
        .limit(limit)
        .offset(offset);

      return reply.send({ data: rows, count: rows.length });
    },
  );
});
