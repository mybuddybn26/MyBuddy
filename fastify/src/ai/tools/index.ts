import { budgets, transactions, documents, memories } from '../../db/schema.js';
import { eq, and, ilike } from 'drizzle-orm';
import type { DbClient } from '../../db/client.js';

export type ToolPermission = 'READ' | 'WRITE';

export interface ToolDef {
  name: string;
  description: string;
  permission: ToolPermission;
  handler: (
    db: DbClient,
    userId: string,
    params: Record<string, unknown>,
  ) => Promise<{ ok: boolean; data?: unknown; error?: string }>;
}

async function createBudget(
  db: DbClient,
  userId: string,
  params: Record<string, unknown>,
): Promise<{ ok: boolean; data?: unknown; error?: string }> {
  const title = String(params.title || '').trim();
  const items = (params.items || params.categories) as
    | Array<{ category: string; allocated_amount: number }>
    | undefined;
  if (!title || !items || !Array.isArray(items) || items.length === 0)
    return { ok: false, error: 'Budget requires title and items' };

  const lineItems = items.map((item) => ({
    id: crypto.randomUUID(),
    category: String(item.category || ''),
    allocated_amount: Number(item.allocated_amount || 0),
    spent_amount: 0,
  }));
  const total = lineItems.reduce((s, i) => s + i.allocated_amount, 0);
  if (total <= 0) return { ok: false, error: 'Budget total must be positive' };

  const period = typeof params.period === 'string' ? params.period : 'one_time';
  const [saved] = await db
    .insert(budgets)
    .values({
      userId,
      title,
      budgetType: period !== 'one_time' ? 'recurring' : 'snapshot',
      period,
      totalAmount: String(total),
      lineItems,
      source: 'ai_generated',
      status: 'active',
    })
    .returning();
  return {
    ok: true,
    data: { id: saved.id, title, items: lineItems, period, total },
  };
}

async function createTransaction(
  db: DbClient,
  userId: string,
  params: Record<string, unknown>,
): Promise<{ ok: boolean; data?: unknown; error?: string }> {
  const amount = Number(params.amount);
  const description = String(params.description || '').trim();
  const category = String(params.category || 'general').trim();
  if (!amount || amount <= 0)
    return { ok: false, error: 'Amount must be positive' };
  if (!description) return { ok: false, error: 'Description is required' };

  const type = String(params.type || 'expense').trim();
  const [saved] = await db
    .insert(transactions)
    .values({
      userId,
      type,
      amount: String(amount),
      description,
      category,
    })
    .returning();
  return {
    ok: true,
    data: { id: saved.id, type, amount, description, category },
  };
}

async function searchDocuments(
  db: DbClient,
  userId: string,
  params: Record<string, unknown>,
): Promise<{ ok: boolean; data?: unknown; error?: string }> {
  const query = String(params.query || '').trim();
  const rows = query
    ? await db
        .select()
        .from(documents)
        .where(
          and(
            eq(documents.userId, userId),
            ilike(documents.aiSummary, `%${query}%`),
          ),
        )
        .limit(10)
    : await db
        .select()
        .from(documents)
        .where(eq(documents.userId, userId))
        .limit(5);
  return { ok: true, data: rows };
}

async function createMemory(
  db: DbClient,
  userId: string,
  params: Record<string, unknown>,
): Promise<{ ok: boolean; data?: unknown; error?: string }> {
  const content = String(params.content || '').trim();
  if (!content) return { ok: false, error: 'Memory content is required' };
  const [saved] = await db
    .insert(memories)
    .values({
      userId,
      content,
      type: 'preference',
      importance: 3,
    })
    .returning();
  return { ok: true, data: { id: saved.id, content } };
}

export const TOOLS: ToolDef[] = [
  {
    name: 'createBudget',
    description: 'Create a budget with categories and amounts',
    permission: 'WRITE',
    handler: createBudget,
  },
  {
    name: 'createTransaction',
    description: 'Record a sale or expense',
    permission: 'WRITE',
    handler: createTransaction,
  },
  {
    name: 'searchDocuments',
    description: 'Search uploaded documents',
    permission: 'READ',
    handler: searchDocuments,
  },
  {
    name: 'createMemory',
    description: 'Save a user memory',
    permission: 'WRITE',
    handler: createMemory,
  },
];

export function getTool(name: string): ToolDef | undefined {
  return TOOLS.find((t) => t.name === name);
}

export interface ParsedToolCall {
  tool: string;
  params: Record<string, unknown>;
}

export function parseToolCalls(text: string): ParsedToolCall[] {
  const results: ParsedToolCall[] = [];
  const regex = /```tool_call\s*\n([\s\S]*?)\n```/g;
  let match;
  while ((match = regex.exec(text)) !== null) {
    try {
      const data = JSON.parse(match[1].trim());
      if (data && typeof data.tool === 'string') {
        results.push({ tool: data.tool, params: data.params || {} });
      }
    } catch {
      /* skip */
    }
  }
  return results;
}

export function stripToolCallBlocks(text: string): string {
  return text.replace(/```tool_call\s*\n[\s\S]*?\n```\n?/g, '');
}
