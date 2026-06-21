import fp from 'fastify-plugin';
import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { eq, desc, and, gte, lte, sql } from 'drizzle-orm';
import { Type } from '@sinclair/typebox';
import { transactions } from '../../db/schema.js';

const CreateTransactionBody = Type.Object({
  type: Type.Union([
    Type.Literal('sale'),
    Type.Literal('expense'),
    Type.Literal('refund'),
  ]),
  amount: Type.Number({ minimum: 0.01 }),
  description: Type.String({ minLength: 1 }),
  category: Type.Optional(Type.String()),
  raw_voice_log: Type.Optional(Type.String()),
  transacted_at: Type.Optional(Type.String({ format: 'date-time' })),
});

export default fp(async (app: FastifyInstance) => {
  // ─── Create Transaction ───
  app.post(
    '/api/transactions',
    { schema: { tags: ['transactions'], body: CreateTransactionBody } },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const userId = request.authUser!.sub;
      const body = request.body as {
        type: 'sale' | 'expense' | 'refund';
        amount: number;
        description: string;
        category?: string;
        raw_voice_log?: string;
        transacted_at?: string;
      };

      const [record] = await app.db
        .insert(transactions)
        .values({
          userId,
          type: body.type,
          amount: body.amount.toFixed(2),
          description: body.description,
          category: body.category || 'general',
          rawVoiceLog: body.raw_voice_log,
          transactedAt: body.transacted_at
            ? new Date(body.transacted_at)
            : new Date(),
        })
        .returning();

      return reply.status(201).send(record);
    },
  );

  // ─── List Transactions ───
  app.get(
    '/api/transactions',
    { schema: { tags: ['transactions'] } },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const userId = request.authUser!.sub;
      const query = request.query as {
        type?: string;
        from?: string;
        to?: string;
        limit?: string;
        offset?: string;
      };

      const conditions = [eq(transactions.userId, userId)];

      if (query.type) {
        conditions.push(eq(transactions.type, query.type));
      }
      if (query.from) {
        conditions.push(gte(transactions.transactedAt, new Date(query.from)));
      }
      if (query.to) {
        conditions.push(lte(transactions.transactedAt, new Date(query.to)));
      }

      const limit = Math.min(parseInt(query.limit || '50', 10), 100);
      const offset = parseInt(query.offset || '0', 10);

      const rows = await app.db
        .select()
        .from(transactions)
        .where(and(...conditions))
        .orderBy(desc(transactions.transactedAt))
        .limit(limit)
        .offset(offset);

      return reply.send({ data: rows, count: rows.length });
    },
  );

  // ─── Transaction Summary (daily/weekly totals) ───
  app.get(
    '/api/transactions/summary',
    { schema: { tags: ['transactions'] } },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const userId = request.authUser!.sub;
      const query = request.query as { period?: 'day' | 'week' };
      const period = query.period || 'day';

      const now = new Date();
      const startOfDay = new Date(now);
      startOfDay.setHours(0, 0, 0, 0);

      const startOfWeek = new Date(now);
      startOfWeek.setDate(now.getDate() - now.getDay());
      startOfWeek.setHours(0, 0, 0, 0);

      const since = period === 'week' ? startOfWeek : startOfDay;

      const result = await app.db
        .select({
          type: transactions.type,
          total: sql<string>`SUM(${transactions.amount})::text`,
          count: sql<number>`COUNT(*)::int`,
        })
        .from(transactions)
        .where(
          and(
            eq(transactions.userId, userId),
            gte(transactions.transactedAt, since),
          ),
        )
        .groupBy(transactions.type);

      const summary: Record<string, { total: number; count: number }> = {};
      for (const row of result) {
        summary[row.type] = {
          total: parseFloat(row.total || '0'),
          count: row.count,
        };
      }

      const sales = summary.sale?.total || 0;
      const expenses = summary.expense?.total || 0;
      const refunds = summary.refund?.total || 0;

      return reply.send({
        period,
        since: since.toISOString(),
        sales: { total: sales, count: summary.sale?.count || 0 },
        expenses: { total: expenses, count: summary.expense?.count || 0 },
        refunds: { total: refunds, count: summary.refund?.count || 0 },
        net_revenue: sales - expenses - refunds,
      });
    },
  );

  // ─── Update Transaction ───
  app.patch(
    '/api/transactions/:id',
    { schema: { tags: ['transactions'] } },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const userId = request.authUser!.sub;
      const { id } = request.params as { id: string };
      const body = request.body as Record<string, unknown>;

      const [existing] = await app.db
        .select()
        .from(transactions)
        .where(eq(transactions.id, id))
        .limit(1);

      if (!existing || existing.userId !== userId) {
        return reply.status(404).send({ detail: 'Transaction not found' });
      }

      const updates: Record<string, unknown> = {};
      if (body.type) updates.type = body.type;
      if (body.amount !== undefined) updates.amount = String(body.amount);
      if (body.description) updates.description = body.description;
      if (body.category) updates.category = body.category;

      const [updated] = await app.db
        .update(transactions)
        .set(updates)
        .where(eq(transactions.id, id))
        .returning();

      return reply.send(updated);
    },
  );

  // ─── Delete Transaction ───
  app.delete(
    '/api/transactions/:id',
    { schema: { tags: ['transactions'] } },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const userId = request.authUser!.sub;
      const { id } = request.params as { id: string };

      const [existing] = await app.db
        .select()
        .from(transactions)
        .where(eq(transactions.id, id))
        .limit(1);

      if (!existing || existing.userId !== userId) {
        return reply.status(404).send({ detail: 'Transaction not found' });
      }

      await app.db.delete(transactions).where(eq(transactions.id, id));

      return reply.status(204).send();
    },
  );
});
