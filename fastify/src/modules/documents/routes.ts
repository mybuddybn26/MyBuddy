import fp from 'fastify-plugin';
import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { eq, desc } from 'drizzle-orm';
import { Type } from '@sinclair/typebox';
import { documents, users, aiUsage } from '../../db/schema.js';
import type { AiPersona } from '../../db/schema.js';
import { config } from '../../config.js';
import { documentAnalysisPrompt } from '../../ai/prompts/index.js';
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

function getMimeFromExt(
  filename: string,
): 'image/jpeg' | 'image/png' | 'image/gif' | 'image/webp' {
  const ext = filename.split('.').pop()?.toLowerCase() || 'jpg';
  const map: Record<
    string,
    'image/jpeg' | 'image/png' | 'image/gif' | 'image/webp'
  > = {
    jpg: 'image/jpeg',
    jpeg: 'image/jpeg',
    png: 'image/png',
    gif: 'image/gif',
    webp: 'image/webp',
  };
  return map[ext] || 'image/jpeg';
}

const CreateDocumentBody = Type.Object({
  image_url: Type.String({ minLength: 1 }),
  ai_summary: Type.Optional(Type.String()),
  doc_type: Type.Optional(
    Type.Union([
      Type.Literal('bill'),
      Type.Literal('letter'),
      Type.Literal('permit'),
      Type.Literal('statement'),
      Type.Literal('other'),
    ]),
  ),
});

export default fp(async (app: FastifyInstance) => {
  // ─── Create Document ───
  app.post(
    '/api/documents',
    { schema: { tags: ['documents'], body: CreateDocumentBody } },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const userId = request.authUser!.sub;
      const body = request.body as {
        image_url: string;
        ai_summary?: string;
        doc_type?: string;
      };

      const [record] = await app.db
        .insert(documents)
        .values({
          userId,
          imageUrl: body.image_url,
          aiSummary: body.ai_summary || '',
          docType: body.doc_type || 'other',
        })
        .returning();

      return reply.status(201).send(record);
    },
  );

  // ─── List Documents ───
  app.get(
    '/api/documents',
    { schema: { tags: ['documents'] } },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const userId = request.authUser!.sub;
      const query = request.query as { limit?: string; offset?: string };
      const limit = Math.min(parseInt(query.limit || '20', 10), 50);
      const offset = parseInt(query.offset || '0', 10);

      const rows = await app.db
        .select()
        .from(documents)
        .where(eq(documents.userId, userId))
        .orderBy(desc(documents.createdAt))
        .limit(limit)
        .offset(offset);

      return reply.send({ data: rows, count: rows.length });
    },
  );

  // ─── Get Single Document ───
  app.get(
    '/api/documents/:id',
    { schema: { tags: ['documents'] } },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const userId = request.authUser!.sub;
      const { id } = request.params as { id: string };

      const [record] = await app.db
        .select()
        .from(documents)
        .where(eq(documents.id, id))
        .limit(1);

      if (!record || record.userId !== userId) {
        return reply.status(404).send({ detail: 'Document not found' });
      }

      return reply.send(record);
    },
  );

  // ─── Analyze Document (AI image analysis) ───
  app.post(
    '/api/documents/:id/analyze',
    { schema: { tags: ['documents'] } },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const userId = request.authUser!.sub;
      const { id } = request.params as { id: string };

      const [record] = await app.db
        .select()
        .from(documents)
        .where(eq(documents.id, id))
        .limit(1);

      if (!record || record.userId !== userId) {
        return reply.status(404).send({ detail: 'Document not found' });
      }

      // Read image from disk
      const filename = record.imageUrl.replace(/^\/uploads\//, '');
      const filepath = join(config.UPLOAD_DIR, filename);

      if (!existsSync(filepath)) {
        return reply
          .status(404)
          .send({ detail: 'Image file not found on disk' });
      }

      const imageBuffer = readFileSync(filepath);
      const imageBase64 = imageBuffer.toString('base64');
      const mediaType = getMimeFromExt(filename);

      // Get user persona for AI prompt
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

      // Run AI analysis
      const { analyzeImage } = await import('../chat/aiService.js');
      let summary = '';
      let docType = 'other';

      try {
        const result = await analyzeImage(
          imageBase64,
          mediaType,
          documentAnalysisPrompt,
          persona,
        );
        summary = result.text;

        // Try to infer doc_type from AI response
        const lower = summary.toLowerCase();
        if (
          lower.includes('bill') ||
          lower.includes('invoice') ||
          lower.includes('receipt')
        ) {
          docType = 'bill';
        } else if (
          lower.includes('letter') ||
          lower.includes('correspondence')
        ) {
          docType = 'letter';
        } else if (lower.includes('permit') || lower.includes('license')) {
          docType = 'permit';
        } else if (
          lower.includes('statement') ||
          lower.includes('bank') ||
          lower.includes('account')
        ) {
          docType = 'statement';
        }

        // Record usage
        if (result.usage) {
          const costPer1M = result.usage.provider === 'deepseek'
            ? (result.usage.completionTokens * config.DEEPSEEK_OUTPUT_COST_PER_1M + result.usage.promptTokens * config.DEEPSEEK_INPUT_COST_PER_1M) / 1_000_000
            : 0;
          await app.db.insert(aiUsage).values({
            userId,
            model: result.usage.model,
            provider: result.usage.provider,
            promptTokens: result.usage.promptTokens,
            completionTokens: result.usage.completionTokens,
            totalTokens: result.usage.promptTokens + result.usage.completionTokens,
            estimatedCost: String(costPer1M),
            feature: 'document',
            status: 'success',
          }).catch(() => {});
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'AI analysis failed';
        return reply.status(502).send({ detail: msg });
      }

      // Update document with real AI summary and detected type
      const [updated] = await app.db
        .update(documents)
        .set({ aiSummary: summary, docType })
        .where(eq(documents.id, id))
        .returning();

      return reply.send({
        id: updated.id,
        ai_summary: updated.aiSummary,
        doc_type: updated.docType,
        summary,
      });
    },
  );

  // ─── Update Document ───
  app.patch(
    '/api/documents/:id',
    { schema: { tags: ['documents'] } },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const userId = request.authUser!.sub;
      const { id } = request.params as { id: string };
      const body = request.body as Record<string, unknown>;

      const [record] = await app.db
        .select()
        .from(documents)
        .where(eq(documents.id, id))
        .limit(1);

      if (!record || record.userId !== userId) {
        return reply.status(404).send({ detail: 'Document not found' });
      }

      const updates: Record<string, unknown> = {};
      if (body.doc_type) updates.docType = body.doc_type;
      if (body.ai_summary !== undefined) updates.aiSummary = body.ai_summary;

      const [updated] = await app.db
        .update(documents)
        .set(updates)
        .where(eq(documents.id, id))
        .returning();

      return reply.send(updated);
    },
  );

  // ─── Delete Document ───
  app.delete(
    '/api/documents/:id',
    { schema: { tags: ['documents'] } },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const userId = request.authUser!.sub;
      const { id } = request.params as { id: string };

      const [record] = await app.db
        .select()
        .from(documents)
        .where(eq(documents.id, id))
        .limit(1);

      if (!record || record.userId !== userId) {
        return reply.status(404).send({ detail: 'Document not found' });
      }

      await app.db.delete(documents).where(eq(documents.id, id));

      return reply.status(204).send();
    },
  );
});
