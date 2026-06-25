// Centralized Buddy Credits pricing — single source of truth for all feature costs

import type { FastifyReply } from 'fastify';
import { eq } from 'drizzle-orm';
import { users, tokenLedger } from '../db/schema.js';

const INSUFFICIENT_CREDITS =
  "You're out of Buddy Credits. Upgrade or wait for your monthly refresh.";

export async function deductCredits(
  db: any,
  userId: string,
  cost: number,
  reason: string,
): Promise<number | null> {
  const [user] = await db
    .select()
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);

  if (!user || user.tokenBalance < cost) {
    return null;
  }

  const remaining = user.tokenBalance - cost;

  await db
    .update(users)
    .set({ tokenBalance: remaining })
    .where(eq(users.id, userId));

  await db.insert(tokenLedger).values({
    userId,
    changeAmount: -cost,
    reason,
  });

  return remaining;
}

export function rejectInsufficientCredits(reply: FastifyReply) {
  return reply.status(402).send({ detail: INSUFFICIENT_CREDITS });
}

export const CREDIT_COSTS = {
  deepseekChat: 1,
  openaiBruneiChat: 5,
  voiceMinute: 30,
  documentAnalysis: 20,
  budgetGeneration: 5,
  transactionParse: 2,
  pdfExport: 50,
} as const;

export const SUBSCRIPTION_PLANS = {
  free: {
    name: 'Free',
    priceBND: 0,
    monthlyCredits: 500,
    features: ['Basic chat', 'Limited voice & documents'],
  },
  plus: {
    name: 'Plus',
    priceBND: 2.99,
    monthlyCredits: 5000,
    features: [
      'More voice',
      'More document scans',
      'Vendor mode & basic reports',
      'Better daily usage',
    ],
  },
  pro: {
    name: 'Pro',
    priceBND: 5,
    monthlyCredits: 15000,
    features: [
      'Highest voice allowance',
      'More documents',
      'Vendor reports',
      'Advanced exports',
      'Longer memory',
    ],
  },
} as const;

export function getMonthlyCredits(tier: string): number {
  const plan = SUBSCRIPTION_PLANS[tier as keyof typeof SUBSCRIPTION_PLANS];
  return plan?.monthlyCredits ?? SUBSCRIPTION_PLANS.free.monthlyCredits;
}

export function getCreditBalanceDisplay(balance: number): string {
  return `${balance} Buddy Credit${balance !== 1 ? 's' : ''}`;
}
