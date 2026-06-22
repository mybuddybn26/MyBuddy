import {
  integer,
  jsonb,
  numeric,
  pgTable,
  text,
  timestamp,
  uuid,
} from 'drizzle-orm/pg-core';

// ─── AI Persona JSONB shape ───
export interface AiPersona {
  name: string;
  language: 'en' | 'ms' | 'zh' | 'mixed';
  tone: 'formal' | 'casual' | 'slang';
  dialect: 'standard' | 'brunei';
  voice_id?: string;
}

// ─── 1. users ───
export const users = pgTable('users', {
  id: uuid('id').primaryKey().defaultRandom(),
  phoneEmail: text('phone_email').notNull().unique(),
  passwordHash: text('password_hash').notNull(),
  displayName: text('display_name').notNull().default('User'),
  aiPersona: jsonb('ai_persona').$type<AiPersona>().notNull().default({
    name: 'Buddy',
    language: 'en',
    tone: 'casual',
    dialect: 'standard',
  }),
  tokenBalance: integer('token_balance').notNull().default(200),
  subscriptionTier: text('subscription_tier').notNull().default('free'),
  createdAt: timestamp('created_at', { withTimezone: true })
    .notNull()
    .defaultNow(),
});

// ─── 2. conversations ───
export const conversations = pgTable('conversations', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  role: text('role').notNull(), // 'user' | 'assistant'
  content: text('content').notNull(),
  inputType: text('input_type').notNull().default('text'), // 'text' | 'voice' | 'image'
  tokensUsed: integer('tokens_used').notNull().default(0),
  createdAt: timestamp('created_at', { withTimezone: true })
    .notNull()
    .defaultNow(),
});

// ─── 3. transactions (micro-accounting ledger) ───
export const transactions = pgTable('transactions', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  type: text('type').notNull(), // 'sale' | 'expense' | 'refund'
  amount: numeric('amount', { precision: 10, scale: 2 }).notNull(),
  description: text('description').notNull(),
  category: text('category').notNull().default('general'),
  rawVoiceLog: text('raw_voice_log'), // original transcription for audit
  transactedAt: timestamp('transacted_at', { withTimezone: true })
    .notNull()
    .defaultNow(),
});

// ─── 4. documents (Snap & Simplify + PDF generator) ───
export const documents = pgTable('documents', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  imageUrl: text('image_url').notNull(),
  aiSummary: text('ai_summary').notNull().default(''),
  docType: text('doc_type').notNull().default('other'), // 'bill' | 'letter' | 'permit' | 'statement' | 'other'
  generatedPdfUrl: text('generated_pdf_url'),
  paidAmount: numeric('paid_amount', { precision: 10, scale: 2 })
    .notNull()
    .default('0.00'),
  createdAt: timestamp('created_at', { withTimezone: true })
    .notNull()
    .defaultNow(),
});

// ─── 5. token_ledger (usage tracking) ───
export const tokenLedger = pgTable('token_ledger', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  changeAmount: integer('change_amount').notNull(), // +100 top-up, -1 task, +200 monthly
  reason: text('reason').notNull(), // 'monthly_grant' | 'pack_purchase' | 'task_use' | 'pdf_fee'
  stripePaymentId: text('stripe_payment_id'),
  createdAt: timestamp('created_at', { withTimezone: true })
    .notNull()
    .defaultNow(),
});

// ─── Budget line item shape ───
export interface BudgetLineItem {
  id: string;
  category: string;
  allocated_amount: number;
  spent_amount: number;
}

// ─── 6. budgets (AI-generated budget plans, editable sheets) ───
export const budgets = pgTable('budgets', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  title: text('title').notNull(),
  budgetType: text('budget_type').notNull().default('snapshot'), // 'snapshot' | 'recurring'
  period: text('period').notNull().default('one_time'), // 'weekly' | 'monthly' | 'one_time'
  totalAmount: numeric('total_amount', { precision: 10, scale: 2 })
    .notNull()
    .default('0.00'),
  lineItems: jsonb('line_items')
    .$type<BudgetLineItem[]>()
    .notNull()
    .default([]),
  status: text('status').notNull().default('active'), // 'active' | 'archived'
  source: text('source').notNull().default('ai_generated'), // 'ai_generated' | 'manual' | 'ai_edited'
  createdAt: timestamp('created_at', { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true })
    .notNull()
    .defaultNow(),
});

// ─── 7. feedback (AI response ratings) ───
export const feedback = pgTable('feedback', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  conversationId: uuid('conversation_id')
    .notNull()
    .references(() => conversations.id, { onDelete: 'cascade' }),
  rating: text('rating').notNull(), // 'good' | 'bad'
  reasons: jsonb('reasons').$type<string[]>().notNull().default([]),
  feedbackText: text('feedback_text').default(''),
  model: text('model').default(''),
  createdAt: timestamp('created_at', { withTimezone: true })
    .notNull()
    .defaultNow(),
});

// ─── 8. ai_usage (DeepSeek token tracking) ───
export const aiUsage = pgTable('ai_usage', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  conversationId: uuid('conversation_id')
    .references(() => conversations.id, { onDelete: 'set null' }),
  model: text('model').notNull(),
  provider: text('provider').notNull().default('deepseek'),
  promptTokens: integer('prompt_tokens').notNull().default(0),
  completionTokens: integer('completion_tokens').notNull().default(0),
  totalTokens: integer('total_tokens').notNull().default(0),
  estimatedCost: numeric('estimated_cost', { precision: 10, scale: 6 })
    .notNull()
    .default('0'),
  feature: text('feature').notNull().default('chat'),
  status: text('status').notNull().default('success'),
  createdAt: timestamp('created_at', { withTimezone: true })
    .notNull()
    .defaultNow(),
});

// projx-anchor: tables
