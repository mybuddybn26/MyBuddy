import fp from 'fastify-plugin';
import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { eq, desc } from 'drizzle-orm';
import { Type } from '@sinclair/typebox';
import { budgets, users } from '../../db/schema.js';
import type { BudgetLineItem, AiPersona } from '../../db/schema.js';
import { CREDIT_COSTS, deductCredits } from '../../lib/creditCosts.js';

const CreateBudgetBody = Type.Object({
  title: Type.String({ minLength: 1 }),
  budget_type: Type.Optional(
    Type.Union([Type.Literal('snapshot'), Type.Literal('recurring')]),
  ),
  period: Type.Optional(
    Type.Union([
      Type.Literal('weekly'),
      Type.Literal('monthly'),
      Type.Literal('one_time'),
    ]),
  ),
  total_amount: Type.Optional(Type.Number()),
  line_items: Type.Array(
    Type.Object({
      id: Type.String(),
      category: Type.String(),
      allocated_amount: Type.Number(),
      spent_amount: Type.Optional(Type.Number()),
    }),
  ),
});

const UpdateBudgetBody = Type.Object({
  title: Type.Optional(Type.String()),
  line_items: Type.Optional(
    Type.Array(
      Type.Object({
        id: Type.String(),
        category: Type.String(),
        allocated_amount: Type.Number(),
        spent_amount: Type.Optional(Type.Number()),
      }),
    ),
  ),
  status: Type.Optional(
    Type.Union([Type.Literal('active'), Type.Literal('archived')]),
  ),
  source: Type.Optional(
    Type.Union([
      Type.Literal('ai_generated'),
      Type.Literal('manual'),
      Type.Literal('ai_edited'),
    ]),
  ),
});

const AiEditBody = Type.Object({
  message: Type.String({ minLength: 1 }),
});

export default fp(async (app: FastifyInstance) => {
  // ─── List Budgets ───
  app.get(
    '/api/budgets',
    { schema: { tags: ['budgets'] } },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const userId = request.authUser!.sub;
      const query = request.query as { status?: string };
      const status = query.status || 'active';

      const rows = await app.db
        .select()
        .from(budgets)
        .where(eq(budgets.userId, userId))
        .orderBy(desc(budgets.updatedAt))
        .limit(50);

      const filtered =
        status === 'all' ? rows : rows.filter((r) => r.status === status);

      return reply.send({ data: filtered, count: filtered.length });
    },
  );

  // ─── Get Single Budget ───
  app.get(
    '/api/budgets/:id',
    { schema: { tags: ['budgets'] } },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const userId = request.authUser!.sub;
      const { id } = request.params as { id: string };

      const [record] = await app.db
        .select()
        .from(budgets)
        .where(eq(budgets.id, id))
        .limit(1);

      if (!record || record.userId !== userId) {
        return reply.status(404).send({ detail: 'Budget not found' });
      }

      return reply.send(record);
    },
  );

  // ─── Create Budget (manual) ───
  app.post(
    '/api/budgets',
    { schema: { tags: ['budgets'], body: CreateBudgetBody } },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const userId = request.authUser!.sub;
      const body = request.body as {
        title: string;
        budget_type?: string;
        period?: string;
        total_amount?: number;
        line_items: Array<{
          id: string;
          category: string;
          allocated_amount: number;
          spent_amount?: number;
        }>;
      };

      const lineItems: BudgetLineItem[] = body.line_items.map((item) => ({
        id: item.id || crypto.randomUUID(),
        category: item.category,
        allocated_amount: item.allocated_amount,
        spent_amount: item.spent_amount || 0,
      }));

      const total = lineItems.reduce((s, i) => s + i.allocated_amount, 0);

      const [record] = await app.db
        .insert(budgets)
        .values({
          userId,
          title: body.title,
          budgetType: body.budget_type || 'snapshot',
          period: body.period || 'one_time',
          totalAmount: String(body.total_amount || total),
          lineItems,
          source: 'manual',
          status: 'active',
        })
        .returning();

      return reply.status(201).send(record);
    },
  );

  // ─── Update Budget (PATCH) ───
  app.patch(
    '/api/budgets/:id',
    { schema: { tags: ['budgets'], body: UpdateBudgetBody } },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const userId = request.authUser!.sub;
      const { id } = request.params as { id: string };
      const body = request.body as {
        title?: string;
        line_items?: Array<{
          id: string;
          category: string;
          allocated_amount: number;
          spent_amount?: number;
        }>;
        status?: string;
        source?: string;
      };

      const [existing] = await app.db
        .select()
        .from(budgets)
        .where(eq(budgets.id, id))
        .limit(1);

      if (!existing || existing.userId !== userId) {
        return reply.status(404).send({ detail: 'Budget not found' });
      }

      const updates: Record<string, unknown> = {
        updatedAt: new Date(),
      };

      if (body.title) updates.title = body.title;
      if (body.status) updates.status = body.status;
      if (body.source) updates.source = body.source;

      if (body.line_items) {
        const lineItems: BudgetLineItem[] = body.line_items.map((item) => ({
          id: item.id || crypto.randomUUID(),
          category: item.category,
          allocated_amount: item.allocated_amount,
          spent_amount: item.spent_amount || 0,
        }));
        updates.lineItems = lineItems;
        updates.totalAmount = String(
          lineItems.reduce((s, i) => s + i.allocated_amount, 0),
        );
      }

      const [updated] = await app.db
        .update(budgets)
        .set(updates)
        .where(eq(budgets.id, id))
        .returning();

      return reply.send(updated);
    },
  );

  // ─── Delete Budget ───
  app.delete(
    '/api/budgets/:id',
    { schema: { tags: ['budgets'] } },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const userId = request.authUser!.sub;
      const { id } = request.params as { id: string };

      const [existing] = await app.db
        .select()
        .from(budgets)
        .where(eq(budgets.id, id))
        .limit(1);

      if (!existing || existing.userId !== userId) {
        return reply.status(404).send({ detail: 'Budget not found' });
      }

      await app.db.delete(budgets).where(eq(budgets.id, id));

      return reply.status(204).send();
    },
  );

  // ─── AI Edit Budget (propose changes, don't apply until confirmed) ───
  app.post(
    '/api/budgets/:id/ai-edit',
    { schema: { tags: ['budgets'], body: AiEditBody } },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const userId = request.authUser!.sub;
      const { id } = request.params as { id: string };
      const { message } = request.body as { message: string };

      const [budget] = await app.db
        .select()
        .from(budgets)
        .where(eq(budgets.id, id))
        .limit(1);

      if (!budget || budget.userId !== userId) {
        return reply.status(404).send({ detail: 'Budget not found' });
      }

      // Get user persona
      const [user] = await app.db
        .select()
        .from(users)
        .where(eq(users.id, userId))
        .limit(1);

      const persona = (user?.aiPersona as AiPersona) || {
        name: 'Buddy',
        language: 'en',
        tone: 'casual',
        dialect: 'standard',
      };

      // Build prompt for AI to propose budget edits
      const currentBudget = JSON.stringify(
        (budget.lineItems as BudgetLineItem[]).map((item) => ({
          id: item.id,
          category: item.category,
          allocated_amount: item.allocated_amount,
          spent_amount: item.spent_amount,
        })),
      );

      const aiPrompt = `The user wants to edit their budget titled "${budget.title}".

Current line items:
${currentBudget}

Budget total: $${budget.totalAmount}
Period: ${budget.period}

User's request: "${message}"

Respond with a JSON code block labeled \`proposal\` containing:
1. "summary": a short description of what you changed
2. "line_items": the FULL updated array of all line items (include existing unchanged ones too)
Each line item must have: id, category, allocated_amount, spent_amount.

Only change what the user asked for. Keep existing IDs for unchanged items.`;

      try {
        const { streamChat } = await import('../chat/aiService.js');
        const messages = [{ role: 'user' as const, content: aiPrompt }];

        let fullText = '';
        for await (const chunk of streamChat(
          messages,
          persona,
          'financial',
          undefined,
        )) {
          if (chunk.type === 'text') {
            fullText += chunk.content;
          }
        }

        // Parse the proposal JSON from AI response
        const match = fullText.match(/```proposal\s*\n([\s\S]*?)\n```/);
        if (match) {
          const proposal = JSON.parse(match[1].trim());

          // Deduct credits for AI budget generation (only on success)
          await deductCredits(
            app.db,
            userId,
            CREDIT_COSTS.budgetGeneration,
            'budget_generation',
          );

          const summary = proposal.summary || 'Budget updated by AI';
          const proposedItems = (
            proposal.line_items as Array<Record<string, unknown>>
          ).map((item) => ({
            id: String(item.id || ''),
            category: String(item.category || ''),
            allocated_amount: Number(item.allocated_amount || 0),
            spent_amount: Number(item.spent_amount || 0),
          }));

          const proposedTotal = proposedItems.reduce(
            (s, i) => s + i.allocated_amount,
            0,
          );

          return reply.send({
            summary,
            proposed_line_items: proposedItems,
            proposed_total: proposedTotal,
            current_line_items: budget.lineItems,
            current_total: Number(budget.totalAmount),
          });
        }

        return reply.status(422).send({
          detail:
            'AI could not generate a valid proposal. Try rephrasing your request.',
        });
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'AI edit failed';
        return reply.status(502).send({ detail: msg });
      }
    },
  );
});
