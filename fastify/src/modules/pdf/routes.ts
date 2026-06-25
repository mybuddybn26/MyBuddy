import fp from 'fastify-plugin';
import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { eq } from 'drizzle-orm';
import { Type } from '@sinclair/typebox';
import PDFDocument from 'pdfkit';
import { users, documents, tokenLedger } from '../../db/schema.js';
import { CREDIT_COSTS } from '../../lib/creditCosts.js';
import type { AiPersona } from '../../db/schema.js';

const GenerateReportBody = Type.Object({
  document_id: Type.String({ minLength: 1 }),
});

const PDF_COST = CREDIT_COSTS.pdfExport;

const DATE_REGEX =
  /\b(\d{1,2}[/-]\d{1,2}[/-]\d{2,4}|\d{4}-\d{2}-\d{2}|\d{1,2}\s+(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\s+\d{4})\b/i;
const AMOUNT_REGEX =
  /\$\s*([\d,]+\.?\d*)|BND\s*([\d,]+\.?\d*)|([\d,]+\.?\d*)\s*(?:dollars|BND)/i;

function extractFields(text: string) {
  const dateMatch = text.match(DATE_REGEX);
  const amountMatch = text.match(AMOUNT_REGEX);
  return {
    date: dateMatch ? dateMatch[0] : 'N/A',
    amount: amountMatch
      ? amountMatch[1] || amountMatch[2] || amountMatch[3]
      : 'N/A',
  };
}

export default fp(async (app: FastifyInstance) => {
  app.post(
    '/api/pdf/generate-report',
    { schema: { tags: ['pdf'], body: GenerateReportBody } },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const userId = request.authUser!.sub;
      const { document_id } = request.body as { document_id: string };

      const [user] = await app.db
        .select()
        .from(users)
        .where(eq(users.id, userId))
        .limit(1);

      if (!user) {
        return reply.status(404).send({ detail: 'User not found' });
      }

      if (user.tokenBalance < PDF_COST) {
        return reply.status(402).send({
          detail: `Report generation requires ${PDF_COST} Buddy Credits. You have ${user.tokenBalance}.`,
        });
      }

      const [record] = await app.db
        .select()
        .from(documents)
        .where(eq(documents.id, document_id))
        .limit(1);

      if (!record || record.userId !== userId) {
        return reply.status(404).send({ detail: 'Document not found' });
      }

      const persona = (user.aiPersona as AiPersona) || {
        name: 'Buddy',
        language: 'en',
        tone: 'casual',
        dialect: 'standard',
      };

      const summary = record.aiSummary || 'No analysis available.';
      const docType =
        record.docType === 'bill'
          ? 'Receipt/Invoice'
          : record.docType === 'statement'
            ? 'Statement'
            : record.docType === 'letter'
              ? 'Letter'
              : record.docType === 'permit'
                ? 'Permit'
                : 'Document';

      const fields = extractFields(summary);

      // ─── AI-powered insights extraction ───
      let insights: string;
      try {
        const { streamChat } = await import('../chat/aiService.js');
        const insightPrompt = `Based on this ${docType} analysis, generate 3-4 key insights and suggested actions. Be practical and concise.

Document type: ${docType}
Analysis: ${summary.slice(0, 4000)}

Return EXACTLY in this format, one per line with no markdown:

INSIGHT: [one insight]
INSIGHT: [one insight]
INSIGHT: [one insight]
ACTION: [one action]
ACTION: [one action]`;

        const messages = [{ role: 'user' as const, content: insightPrompt }];
        let fullText = '';
        for await (const chunk of streamChat(messages, persona)) {
          if (chunk.type === 'text') fullText += chunk.content;
        }

        const insightLines = fullText
          .split('\n')
          .filter((l) => l.match(/^(INSIGHT|ACTION):/i));
        insights = insightLines
          .map((l) => l.replace(/^(INSIGHT|ACTION):\s*/i, '').trim())
          .join('\n');
      } catch {
        insights = '';
      }

      const insightList = insights
        ? insights.split('\n').filter(Boolean)
        : ['No additional insights available.'];

      // ─── Generate PDF ───
      const pdf = new PDFDocument({ size: 'A4', margin: 50 });
      const chunks: Buffer[] = [];
      pdf.on('data', (chunk: Buffer) => chunks.push(chunk));

      // Cover header
      pdf.rect(0, 0, pdf.page.width, 90).fill('#1e40af');
      pdf
        .fontSize(24)
        .fillColor('#ffffff')
        .text('MyBuddy AI Report', 50, 30, { align: 'left' })
        .fontSize(10)
        .text(
          `Generated: ${new Date().toLocaleDateString('en-GB')}  •  Type: ${docType}`,
          50,
          62,
          { align: 'left' },
        );

      let y = 120;

      // ── Document Information ──
      pdf.fontSize(14).fillColor('#1e40af').text('Document Information', 50, y);
      y += 25;
      pdf.fontSize(10).fillColor('#334155');
      const infoRows = [
        `Type: ${docType}`,
        `Amount: ${fields.amount}`,
        `Date: ${fields.date}`,
        `Reference: N/A`,
      ];
      for (const row of infoRows) {
        pdf.text(row, 55, y);
        y += 16;
      }
      y += 10;

      // ── AI Summary ──
      pdf.fontSize(14).fillColor('#1e40af').text('AI Summary', 50, y);
      y += 25;
      pdf
        .fontSize(11)
        .fillColor('#334155')
        .text(summary, 55, y, {
          width: pdf.page.width - 110,
          lineGap: 3,
        });
      y = pdf.y + 20;

      // ── Key Insights ──
      pdf.fontSize(14).fillColor('#1e40af').text('Key Insights', 50, y);
      y += 25;
      pdf.fontSize(10).fillColor('#334155');
      for (const line of insightList) {
        if (line.toLowerCase().startsWith('insight:')) {
          pdf.text(`• ${line.replace(/^insight:\s*/i, '')}`, 55, y, {
            width: pdf.page.width - 110,
          });
          y = pdf.y + 8;
        }
      }
      y += 10;

      // ── Suggested Actions ──
      pdf.fontSize(14).fillColor('#1e40af').text('Suggested Actions', 50, y);
      y += 25;
      pdf.fontSize(10).fillColor('#334155');
      for (const line of insightList) {
        if (line.toLowerCase().startsWith('action:')) {
          pdf.text(`→ ${line.replace(/^action:\s*/i, '')}`, 55, y, {
            width: pdf.page.width - 110,
          });
          y = pdf.y + 8;
        }
      }
      // Footer (no y tracking needed)
      pdf
        .fontSize(8)
        .fillColor('#94a3b8')
        .text(
          'Generated by MyBuddy AI. Verify all information before use.',
          50,
          pdf.page.height - 50,
          { align: 'center' },
        );

      pdf.end();

      const pdfBuffer = await new Promise<Buffer>((resolve) => {
        pdf.on('end', () => resolve(Buffer.concat(chunks)));
      });

      // Deduct credits after successful generation
      await app.db
        .update(users)
        .set({ tokenBalance: user.tokenBalance - PDF_COST })
        .where(eq(users.id, userId));

      await app.db.insert(tokenLedger).values({
        userId,
        changeAmount: -PDF_COST,
        reason: 'pdf_report',
      });

      reply.header('Content-Type', 'application/pdf');
      reply.header(
        'Content-Disposition',
        `attachment; filename="mybuddy-report-${record.id.slice(0, 8)}.pdf"`,
      );
      return reply.send(pdfBuffer);
    },
  );
});
