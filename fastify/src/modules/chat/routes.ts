import fp from 'fastify-plugin';
import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { eq, desc } from 'drizzle-orm';
import { Type } from '@sinclair/typebox';
import {
  conversations,
  users,
  tokenLedger,
  transactions,
  budgets,
} from '../../db/schema.js';
import type { AiPersona } from '../../db/schema.js';
import { streamChat } from './claude.js';
import { config } from '../../config.js';

const ChatBody = Type.Object({
  message: Type.String({ minLength: 1 }),
  input_type: Type.Optional(
    Type.Union([
      Type.Literal('text'),
      Type.Literal('voice'),
      Type.Literal('image'),
    ]),
  ),
  conversation_history: Type.Optional(
    Type.Array(
      Type.Object({
        role: Type.Union([Type.Literal('user'), Type.Literal('assistant')]),
        content: Type.String(),
      }),
    ),
  ),
});

interface ParsedTransaction {
  type: string;
  amount: number;
  description: string;
  category: string;
}

function extractTransactions(text: string): {
  parsed: ParsedTransaction[];
  cleaned: string;
} {
  const parsed: ParsedTransaction[] = [];
  const cleaned = text.replace(
    /```transaction\s*\n([\s\S]*?)\n```/g,
    (_match, jsonStr: string) => {
      try {
        const tx = JSON.parse(jsonStr.trim());
        if (
          tx &&
          typeof tx.type === 'string' &&
          ['sale', 'expense', 'refund'].includes(tx.type) &&
          typeof tx.amount === 'number' &&
          tx.amount > 0 &&
          typeof tx.description === 'string' &&
          tx.description.length > 0
        ) {
          parsed.push({
            type: tx.type,
            amount: tx.amount,
            description: tx.description,
            category: tx.category || 'general',
          });
          return '';
        }
      } catch (_e) {
        // Invalid JSON — leave the block in the response unchanged
      }
      return _match;
    },
  );

  return { parsed, cleaned: cleaned.trimStart() };
}

interface BudgetItem {
  category: string;
  allocated_amount: number;
  notes: string;
}

interface ParsedBudget {
  title: string;
  items: BudgetItem[];
  period?: string;
  total?: number;
}

function extractBudgets(text: string): {
  parsed: ParsedBudget[];
  cleaned: string;
} {
  const parsed: ParsedBudget[] = [];
  const cleaned = text.replace(
    /```budget\s*\n([\s\S]*?)\n```/g,
    (_match, jsonStr: string) => {
      try {
        const data = JSON.parse(jsonStr.trim());
        let items: BudgetItem[];
        if (Array.isArray(data)) {
          items = data;
        } else if (data && Array.isArray(data.items)) {
          items = data.items;
        } else if (data && Array.isArray(data.line_items)) {
          items = data.line_items;
        } else if (data && Array.isArray(data.budget)) {
          items = data.budget;
        } else {
          return _match;
        }
        const valid = (items as unknown[]).filter((i: unknown) => {
          const it = i as Record<string, unknown>;
          return (
            typeof it.category === 'string' &&
            it.category.length > 0 &&
            typeof it.allocated_amount === 'number'
          );
        });
        if (valid.length > 0) {
          // Infer period from data or title
          const title =
            data?.title || data?.name || data?.budget_name || 'Budget';
          const titleLower = title.toLowerCase();
          let period = 'one_time';
          if (titleLower.includes('weekly') || titleLower.includes('week'))
            period = 'weekly';
          else if (
            titleLower.includes('monthly') ||
            titleLower.includes('month')
          )
            period = 'monthly';

          const total = (valid as unknown[]).reduce(
            (sum: number, i: unknown) =>
              sum +
              Number((i as Record<string, unknown>).allocated_amount || 0),
            0,
          );

          parsed.push({
            title,
            period,
            total,
            items: valid.map((i: unknown) => {
              const it = i as Record<string, unknown>;
              return {
                category: String(it.category),
                allocated_amount: Number(it.allocated_amount),
                notes: String(it.notes || ''),
              };
            }),
          });
          return '';
        }
      } catch (_e) {
        // Invalid JSON
      }
      return _match;
    },
  );

  return { parsed, cleaned };
}

export default fp(async (app: FastifyInstance) => {
  // ─── Stream Chat (SSE) ───
  app.post(
    '/api/chat',
    { schema: { tags: ['chat'], body: ChatBody } },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const userId = request.authUser!.sub;
      const body = request.body as {
        message: string;
        input_type?: string;
        conversation_history?: Array<{
          role: 'user' | 'assistant';
          content: string;
        }>;
      };

      // Get user persona + check token balance
      const [user] = await app.db
        .select()
        .from(users)
        .where(eq(users.id, userId))
        .limit(1);

      if (!user) {
        return reply.status(404).send({ detail: 'User not found' });
      }

      if (user.tokenBalance <= 0) {
        return reply.status(402).send({
          detail: 'No tokens remaining. Please top up to continue.',
          token_balance: 0,
        });
      }

      const persona = user.aiPersona as AiPersona;

      // Build message history
      const history = body.conversation_history || [];
      const messages = [
        ...history,
        { role: 'user' as const, content: body.message },
      ];

      // Save user message
      await app.db.insert(conversations).values({
        userId,
        role: 'user',
        content: body.message,
        inputType: body.input_type || 'text',
      });

      // Stream response via SSE
      const requestOrigin = request.headers.origin;
      const allowedOrigins = (
        config.CORS_ALLOW_ORIGINS || 'http://localhost:5173'
      )
        .split(',')
        .map((o) => o.trim());
      const allowOrigin =
        requestOrigin && allowedOrigins.includes(requestOrigin)
          ? requestOrigin
          : allowedOrigins[0] || 'http://localhost:5173';

      reply.raw.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        Connection: 'keep-alive',
        'X-Accel-Buffering': 'no',
        'Access-Control-Allow-Origin': allowOrigin,
        'Access-Control-Allow-Credentials': 'true',
      });

      let fullResponse = '';
      let totalTokens = 0;

      try {
        for await (const chunk of streamChat(messages, persona)) {
          if (chunk.type === 'text') {
            fullResponse += chunk.content;
            reply.raw.write(
              `data: ${JSON.stringify({ type: 'text', content: chunk.content })}\n\n`,
            );
          } else if (chunk.type === 'done') {
            totalTokens = chunk.tokens || 0;
          }
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'AI service error';
        reply.raw.write(
          `data: ${JSON.stringify({ type: 'error', content: msg })}\n\n`,
        );
      }

      // Save assistant response
      if (fullResponse) {
        // Extract and process any transaction JSON blocks
        const txResult = extractTransactions(fullResponse);
        // Also extract budget blocks
        const budgetResult = extractBudgets(txResult.cleaned);

        for (const tx of txResult.parsed) {
          try {
            await app.db.insert(transactions).values({
              userId,
              type: tx.type,
              amount: String(tx.amount),
              description: tx.description,
              category: tx.category,
              rawVoiceLog: body.input_type === 'voice' ? body.message : null,
            });
            request.log.info(
              `Auto-parsed transaction: ${tx.type} $${tx.amount} — ${tx.description}`,
            );
          } catch (dbErr) {
            request.log.warn(
              `Failed to insert auto-parsed transaction: ${dbErr instanceof Error ? dbErr.message : String(dbErr)}`,
            );
          }
        }

        // Insert budgets into DB — store line items with generated IDs
        for (const budget of budgetResult.parsed) {
          try {
            const lineItems = budget.items.map((item) => ({
              id: crypto.randomUUID(),
              category: item.category,
              allocated_amount: item.allocated_amount,
              spent_amount: 0,
            }));
            const isRecurring = budget.period !== 'one_time';

            const [saved] = await app.db
              .insert(budgets)
              .values({
                userId,
                title: budget.title,
                budgetType: isRecurring ? 'recurring' : 'snapshot',
                period: budget.period || 'one_time',
                totalAmount: String(budget.total || 0),
                lineItems,
                source: 'ai_generated',
                status: 'active',
              })
              .returning();
            reply.raw.write(
              `data: ${JSON.stringify({ type: 'budget', id: saved.id, title: budget.title, items: lineItems, budget_type: isRecurring ? 'recurring' : 'snapshot', period: budget.period })}\n\n`,
            );
          } catch (dbErr) {
            request.log.warn(
              `Failed to insert budget: ${dbErr instanceof Error ? dbErr.message : String(dbErr)}`,
            );
          }
        }

        // Save cleaned response (without raw JSON blocks) to conversations
        const displayText =
          txResult.parsed.length > 0 || budgetResult.parsed.length > 0
            ? budgetResult.cleaned
            : fullResponse;
        await app.db.insert(conversations).values({
          userId,
          role: 'assistant',
          content: displayText,
          inputType: 'text',
          tokensUsed: totalTokens,
        });
      }

      // Deduct 1 token
      await app.db
        .update(users)
        .set({ tokenBalance: user.tokenBalance - 1 })
        .where(eq(users.id, userId));

      await app.db.insert(tokenLedger).values({
        userId,
        changeAmount: -1,
        reason: 'task_use',
      });

      reply.raw.write(
        `data: ${JSON.stringify({ type: 'done', token_balance: user.tokenBalance - 1 })}\n\n`,
      );
      reply.raw.end();
    },
  );

  // ─── Chat History ───
  app.get(
    '/api/chat/history',
    { schema: { tags: ['chat'] } },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const userId = request.authUser!.sub;
      const query = request.query as { limit?: string; offset?: string };
      const limit = Math.min(parseInt(query.limit || '50', 10), 100);
      const offset = parseInt(query.offset || '0', 10);

      const rows = await app.db
        .select()
        .from(conversations)
        .where(eq(conversations.userId, userId))
        .orderBy(desc(conversations.createdAt))
        .limit(limit)
        .offset(offset);

      return reply.send({ data: rows.reverse(), count: rows.length });
    },
  );
});
