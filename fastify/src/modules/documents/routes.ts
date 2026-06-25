import fp from 'fastify-plugin';
import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { eq, desc } from 'drizzle-orm';
import { Type } from '@sinclair/typebox';
import { documents, users, aiUsage } from '../../db/schema.js';
import type { AiPersona } from '../../db/schema.js';
import { config } from '../../config.js';
import { documentAnalysisPrompt } from '../../ai/prompts/index.js';
import { CREDIT_COSTS, deductCredits } from '../../lib/creditCosts.js';
import { isRemoteUrl, downloadFile } from '../../lib/storage.js';
import { readFileSync, existsSync } from 'node:fs';
import { join, extname } from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const pdfParse: (
  buf: Buffer,
) => Promise<{ text: string }> = require('pdf-parse');

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

const VALID_DOC_TYPES = [
  'bill',
  'letter',
  'permit',
  'statement',
  'other',
] as const;

function normalizeDocumentType(raw: string): string {
  const t = raw.toLowerCase().trim();
  if ((VALID_DOC_TYPES as readonly string[]).includes(t)) return t;
  // Map common AI-returned values to valid types
  if (t === 'receipt' || t === 'invoice') return 'bill';
  return 'other';
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

      // Read file — from Cloudinary URL or local disk
      let fileBuffer: Buffer;
      let ext: string;
      if (isRemoteUrl(record.imageUrl)) {
        const data = await downloadFile(record.imageUrl);
        fileBuffer = Buffer.from(data);
        const urlExt = record.imageUrl.split('.').pop()?.split('?')[0] || 'jpg';
        ext = `.${urlExt}`;
        request.log.info(
          { url: record.imageUrl, size: fileBuffer.length },
          'doc: downloaded from remote',
        );
      } else {
        const filename = record.imageUrl.replace(/^\/uploads\//, '');
        const filepath = join(config.UPLOAD_DIR, filename);
        if (!existsSync(filepath)) {
          return reply.status(404).send({ detail: 'File not found on disk' });
        }
        fileBuffer = readFileSync(filepath);
        ext = extname(filename).toLowerCase();
        request.log.info(
          { filename, size: fileBuffer.length },
          'doc: loaded from disk',
        );
      }
      const isPdf = ext === '.pdf';
      request.log.info(
        { url: record.imageUrl, ext, isPdf, size: fileBuffer.length },
        'doc: file loaded',
      );

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

      let summary: string;
      let docType = 'other';
      let success = false; // eslint-disable-line no-useless-assignment

      try {
        if (isPdf) {
          // ─── PDF: extract text, send to AI chat ───
          let pdfData: { text?: string };
          try {
            pdfData = await pdfParse(fileBuffer);
          } catch (err) {
            request.log.error(
              { err: err instanceof Error ? err.message : String(err) },
              'doc: pdfParse failed',
            );
            return reply.status(422).send({
              detail:
                'Buddy could not read this PDF. Try uploading the file as an image instead.',
            });
          }

          const pdfText = pdfData.text?.trim();

          request.log.info(
            { pdfTextLen: pdfText?.length || 0, fileSize: fileBuffer.length },
            'doc: PDF text extracted',
          );

          if (!pdfText) {
            return reply.status(422).send({
              detail:
                'Buddy could not read text from this PDF. Try uploading a clearer scan or use a photo instead.',
            });
          }

          const truncatedText = pdfText.slice(0, 12000);
          const pdfAnalysisPrompt = `Analyze this document text and return a structured summary.

          Document text:
          ${truncatedText}

          Return your response in this format only:

          SUMMARY:
          [2-3 sentence simple explanation]

          TYPE: [bill/letter/permit/statement/other]

          DETAILS:
          - Company/Sender: [name or N/A]
          - Amount: [amount if any, or N/A]
          - Date: [date if any, or N/A]
          - Due Date: [due date if any, or N/A]
          - Reference: [ref number if any, or N/A]

          ACTION:
          [one short practical suggestion, e.g. "Pay before 30 June" or "Save for records"]`;

          const { streamChat } = await import('../chat/aiService.js');
          const messages = [
            { role: 'user' as const, content: pdfAnalysisPrompt },
          ];
          request.log.info('doc: starting AI analysis (PDF)');
          let fullText = '';
          for await (const chunk of streamChat(messages, persona)) {
            if (chunk.type === 'text') fullText += chunk.content;
          }
          summary = fullText.trim();

          // Infer doc type from response
          const lower = summary.toLowerCase();
          const typeMatch = lower.match(/type:\s*(\w+)/i);
          docType = normalizeDocumentType(typeMatch ? typeMatch[1] : 'other');

          success = true;
        } else {
          // ─── Image: OCR → DeepSeek text analysis ───
          let ocrText = '';
          try {
            const Tesseract = (await import('tesseract.js')).default;
            const ocrResult = await Tesseract.recognize(fileBuffer, 'eng+msa', {
              logger: () => {}, // silent
            });
            ocrText = ocrResult.data.text?.trim() || '';
            request.log.info(
              {
                ocrLen: ocrText.length,
                ocrConfidence: ocrResult.data.confidence,
              },
              'doc: OCR complete',
            );
          } catch (err) {
            request.log.warn({ err }, 'doc: OCR failed');
            ocrText = '';
          }

          const textOk = ocrText.length > 5;
          request.log.info(
            { textOk, ocrLen: ocrText.length },
            'doc: OCR analysis path',
          );

          if (textOk) {
            // ─── OCR succeeded → analyze with DeepSeek ───
            const truncatedText = ocrText.slice(0, 12000);
            const analysisPrompt = `Analyze this document text extracted via OCR and return a structured summary.

            Document text:
            ${truncatedText}

            Return your response in this format only:

            SUMMARY:
            [2-3 sentence simple explanation]

            TYPE: [bill/letter/permit/statement/other]

            DETAILS:
            - Company/Sender: [name or N/A]
            - Amount: [amount if any, or N/A]
            - Date: [date if any, or N/A]
            - Due Date: [due date if any, or N/A]
            - Reference: [ref number if any, or N/A]

            ACTION:
            [one short practical suggestion, e.g. "Pay before 30 June" or "Save for records"]`;

            const { streamChat } = await import('../chat/aiService.js');
            const messages = [
              { role: 'user' as const, content: analysisPrompt },
            ];
            let fullText = '';
            for await (const chunk of streamChat(messages, persona)) {
              if (chunk.type === 'text') fullText += chunk.content;
            }
            summary = fullText.trim();

            // Infer doc type from OCR response
            const lower = summary.toLowerCase();
            const typeMatch = lower.match(/type:\s*(\w+)/i);
            docType = normalizeDocumentType(typeMatch ? typeMatch[1] : 'other');

            success = true;
          } else {
            // ─── OCR failed → OpenAI vision fallback ───
            if (config.OPENAI_API_KEY) {
              const imageBase64 = fileBuffer.toString('base64');
              const mediaType = getMimeFromExt(`file${ext}`);
              const { analyzeImage } = await import('../chat/aiService.js');
              const result = await analyzeImage(
                imageBase64,
                mediaType,
                documentAnalysisPrompt,
                persona,
              );
              summary = result.text;

              const lower = summary.toLowerCase();
              if (
                lower.includes('bill') ||
                lower.includes('invoice') ||
                lower.includes('receipt')
              )
                docType = 'bill';
              else if (
                lower.includes('letter') ||
                lower.includes('correspondence')
              )
                docType = 'letter';
              else if (lower.includes('permit') || lower.includes('license'))
                docType = 'permit';
              else if (lower.includes('statement') || lower.includes('bank'))
                docType = 'statement';

              if (result.usage) {
                const costPer1M =
                  result.usage.provider === 'deepseek'
                    ? (result.usage.completionTokens *
                        config.DEEPSEEK_OUTPUT_COST_PER_1M +
                        result.usage.promptTokens *
                          config.DEEPSEEK_INPUT_COST_PER_1M) /
                      1_000_000
                    : 0;
                await app.db
                  .insert(aiUsage)
                  .values({
                    userId,
                    model: result.usage.model,
                    provider: result.usage.provider,
                    promptTokens: result.usage.promptTokens,
                    completionTokens: result.usage.completionTokens,
                    totalTokens:
                      result.usage.promptTokens + result.usage.completionTokens,
                    estimatedCost: String(costPer1M),
                    feature: 'document',
                    status: 'success',
                  })
                  .catch(() => {});
              }

              success = true;
            } else {
              return reply.status(422).send({
                detail:
                  'Buddy could not read this document clearly. Try a clearer photo.',
              });
            }
          }
        }

        // Deduct credits only on success
        if (success) {
          await deductCredits(
            app.db,
            userId,
            CREDIT_COSTS.documentAnalysis,
            'document_analysis',
          );
        }
      } catch (err) {
        request.log.error(
          { err: err instanceof Error ? err.message : String(err), isPdf },
          'doc: analysis failed',
        );
        await app.db
          .insert(aiUsage)
          .values({
            userId,
            model: config.DEEPSEEK_MODEL,
            provider: 'deepseek',
            feature: 'document',
            status: 'failed',
          })
          .catch(() => {});
        const msg = err instanceof Error ? err.message : '';
        if (msg.includes('fetch') || msg.includes('network')) {
          return reply.status(502).send({
            detail:
              'Document analysis is not configured yet. Please try again later.',
          });
        }
        return reply.status(502).send({
          detail: 'Buddy could not summarize this document. Please try again.',
        });
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
