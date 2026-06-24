import fp from 'fastify-plugin';
import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { eq, desc, and } from 'drizzle-orm';
import { Type } from '@sinclair/typebox';
import {
  conversations,
  users,
  tokenLedger,
  transactions,
  budgets,
  aiUsage,
  memories,
} from '../../db/schema.js';
import type { AiPersona } from '../../db/schema.js';
import { streamChat } from './aiService.js';
import { config } from '../../config.js';
import {
  parseToolCalls,
  stripToolCallBlocks,
  getTool,
} from '../../ai/tools/index.js';
import { CREDIT_COSTS } from '../../lib/creditCosts.js';

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

const FINANCIAL_KEYWORDS =
  /\b(budget|budgets|spend|spent|spending|cost|costs|costing|price|prices|expensive|cheap|save|saving|savings|income|earn|earned|earning|profit|profits|revenue|expense|expenses|transaction|transactions|sale|sales|sell|sold|pay|paid|payment|payments|bill|bills|invoice|invoices|money|fund|funds|wallet|balance|credit|debit|loan|loans|owe|owed|tax|taxes|wage|wages|salary|total|amount|price|funds|financial|finance|accounting|bookkeeping)/i;

function hasFinancialIntent(message: string): boolean {
  return FINANCIAL_KEYWORDS.test(message);
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

      const persona = user.aiPersona as AiPersona;

      const creditCost =
        persona.dialect === 'brunei'
          ? CREDIT_COSTS.openaiBruneiChat
          : CREDIT_COSTS.deepseekChat;

      if (user.tokenBalance < creditCost) {
        return reply.status(402).send({
          detail:
            'Not enough Buddy Credits. Upgrade or wait for your monthly refresh.',
          token_balance: user.tokenBalance,
        });
      }

      // Load relevant user memories (max 5, highest importance)
      const memoryRows = await app.db
        .select()
        .from(memories)
        .where(eq(memories.userId, userId))
        .orderBy(desc(memories.importance))
        .limit(5);
      const memoryTexts = memoryRows.map((m) => m.content);

      // Detect manual memory commands
      const msg = body.message;
      const rememberMatch = msg.match(/^remember\s+that\s+(.+)$/i);
      const forgetMatch = msg.match(/^forget\s+that\s+(.+)$/i);
      let memoryAction: { type: 'create' | 'delete'; content: string } | null =
        null;
      if (rememberMatch) {
        memoryAction = { type: 'create', content: rememberMatch[1].trim() };
      } else if (forgetMatch) {
        memoryAction = { type: 'delete', content: forgetMatch[1].trim() };
      }

      // Handle memory commands
      if (memoryAction?.type === 'create') {
        await app.db.insert(memories).values({
          userId,
          content: memoryAction.content,
          type: 'preference',
          importance: 3,
        });
        reply.raw.writeHead(200, {
          'Content-Type': 'text/event-stream',
          'Cache-Control': 'no-cache',
          Connection: 'keep-alive',
        });
        reply.raw.write(
          `data: ${JSON.stringify({ type: 'text', content: `I'll remember that. ${memoryAction.content}` })}\n\n`,
        );
        reply.raw.write(
          `data: ${JSON.stringify({ type: 'done', token_balance: user.tokenBalance })}\n\n`,
        );
        reply.raw.end();
        return;
      }

      if (memoryAction?.type === 'delete') {
        const content = memoryAction.content.toLowerCase().trim();
        await app.db
          .delete(memories)
          .where(
            and(eq(memories.userId, userId), eq(memories.content, content)),
          );
        reply.raw.writeHead(200, {
          'Content-Type': 'text/event-stream',
          'Cache-Control': 'no-cache',
          Connection: 'keep-alive',
        });
        reply.raw.write(
          `data: ${JSON.stringify({ type: 'text', content: `I've removed that memory. "${memoryAction.content}" is now forgotten.` })}\n\n`,
        );
        reply.raw.write(
          `data: ${JSON.stringify({ type: 'done', token_balance: user.tokenBalance })}\n\n`,
        );
        reply.raw.end();
        return;
      }

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
      let savedConversationId: string | undefined;
      let usageData: {
        promptTokens: number;
        completionTokens: number;
        model: string;
        provider: string;
      } | null = null;

      try {
        for await (const chunk of streamChat(
          messages,
          persona,
          undefined,
          memoryTexts,
        )) {
          if (chunk.type === 'text') {
            fullResponse += chunk.content;
            reply.raw.write(
              `data: ${JSON.stringify({ type: 'text', content: chunk.content })}\n\n`,
            );
          } else if (chunk.type === 'done') {
            totalTokens = chunk.tokens || 0;
            if (chunk.usage) usageData = chunk.usage;
          }
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'AI service error';
        reply.raw.write(
          `data: ${JSON.stringify({ type: 'error', content: msg })}\n\n`,
        );
        // Record failed usage
        await app.db
          .insert(aiUsage)
          .values({
            userId,
            model: config.DEEPSEEK_MODEL,
            provider: 'deepseek',
            feature: 'chat',
            status: 'failed',
          })
          .catch(() => {});
      }

      // Save assistant response
      if (fullResponse) {
        // Check for structured tool calls first
        const toolCalls = parseToolCalls(fullResponse);
        let toolHandled = false;

        for (const tc of toolCalls) {
          const tool = getTool(tc.tool);
          if (!tool) continue;

          if (tool.permission === 'READ') {
            const result = await tool.handler(app.db, userId, tc.params);
            const msg = result.ok
              ? `data: ${JSON.stringify({ type: 'tool_result', tool: tc.tool, result: result.data })}\n\n`
              : `data: ${JSON.stringify({ type: 'text', content: result.error || 'Tool failed' })}\n\n`;
            reply.raw.write(msg);
          } else {
            // WRITE — send confirmation request
            const confirmationId = crypto.randomUUID();
            const store = app as unknown as {
              _tc?: Record<
                string,
                {
                  tool: string;
                  params: Record<string, unknown>;
                  userId: string;
                }
              >;
            };
            if (!store._tc) store._tc = {};
            store._tc[confirmationId] = {
              tool: tc.tool,
              params: tc.params,
              userId,
            };
            reply.raw.write(
              `data: ${JSON.stringify({ type: 'tool_confirm', confirmationId, tool: tc.tool, params: tc.params, label: tc.tool === 'createBudget' ? 'Create Budget' : tc.tool === 'createTransaction' ? 'Save Transaction' : tc.tool === 'createMemory' ? 'Save Memory' : tc.tool })}\n\n`,
            );
          }
          toolHandled = true;
        }

        const cleanedResponse = stripToolCallBlocks(fullResponse);
        const displayText = toolHandled
          ? cleanedResponse
              .replace(/```transaction\s*\n[\s\S]*?\n```\n?/g, '')
              .replace(/```budget\s*\n[\s\S]*?\n```\n?/g, '')
              .trim()
          : cleanedResponse;

        // Legacy extraction fallback
        if (!toolHandled) {
          const hasIntent = hasFinancialIntent(body.message);
          if (hasIntent) {
            const txResult = extractTransactions(displayText);
            const budgetResult = extractBudgets(txResult.cleaned);
            for (const tx of txResult.parsed) {
              try {
                await app.db.insert(transactions).values({
                  userId,
                  type: tx.type,
                  amount: String(tx.amount),
                  description: tx.description,
                  category: tx.category,
                  rawVoiceLog:
                    body.input_type === 'voice' ? body.message : null,
                });
              } catch (dbErr) {
                request.log.warn(
                  {
                    err: dbErr instanceof Error ? dbErr.message : String(dbErr),
                  },
                  'Legacy transaction insert failed',
                );
              }
            }
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
                  {
                    err: dbErr instanceof Error ? dbErr.message : String(dbErr),
                  },
                  'Legacy budget insert failed',
                );
              }
            }
          }
        }

        const [saved] = await app.db
          .insert(conversations)
          .values({
            userId,
            role: 'assistant',
            content: displayText || fullResponse.slice(0, 500),
            inputType: 'text',
            tokensUsed: totalTokens,
          })
          .returning({ id: conversations.id });
        savedConversationId = saved.id;
      }

      // Deduct credits based on feature
      await app.db
        .update(users)
        .set({ tokenBalance: user.tokenBalance - creditCost })
        .where(eq(users.id, userId));

      await app.db.insert(tokenLedger).values({
        userId,
        changeAmount: -creditCost,
        reason:
          creditCost === CREDIT_COSTS.openaiBruneiChat
            ? 'brunei_chat'
            : 'chat_use',
      });

      const newBalance = user.tokenBalance - creditCost;

      if (usageData) {
        const costPer1M =
          usageData.provider === 'deepseek'
            ? (usageData.completionTokens * config.DEEPSEEK_OUTPUT_COST_PER_1M +
                usageData.promptTokens * config.DEEPSEEK_INPUT_COST_PER_1M) /
              1_000_000
            : 0;
        await app.db.insert(aiUsage).values({
          userId,
          conversationId: savedConversationId,
          model: usageData.model,
          provider: usageData.provider,
          promptTokens: usageData.promptTokens,
          completionTokens: usageData.completionTokens,
          totalTokens: usageData.promptTokens + usageData.completionTokens,
          estimatedCost: String(costPer1M),
          feature: body.input_type === 'voice' ? 'voice' : 'chat',
          status: 'success',
        });
      }

      reply.raw.write(
        `data: ${JSON.stringify({ type: 'done', token_balance: newBalance, conversationId: savedConversationId })}\n\n`,
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
