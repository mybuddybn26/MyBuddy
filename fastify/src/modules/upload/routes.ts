import fp from 'fastify-plugin';
import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { uploadFile } from '../../lib/storage.js';

const ALLOWED_TYPES = [
  'image/jpeg',
  'image/png',
  'image/gif',
  'image/webp',
  'application/pdf',
];

export default fp(async (app: FastifyInstance) => {
  // ─── Upload Image ───
  app.post(
    '/api/upload/image',
    { schema: { tags: ['upload'] } },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const data = await request.file();
      if (!data) {
        return reply.status(400).send({ detail: 'No file provided' });
      }

      if (!ALLOWED_TYPES.includes(data.mimetype)) {
        return reply.status(400).send({
          detail: `Invalid file type: ${data.mimetype}. Allowed: ${ALLOWED_TYPES.join(', ')}`,
        });
      }

      const buffer = await data.toBuffer();
      const result = await uploadFile(
        new Uint8Array(buffer),
        data.filename || 'upload',
        data.mimetype,
      );

      request.log.info(
        { provider: result.provider, filename: result.filename },
        'upload: file stored',
      );

      return reply.status(201).send({
        url: result.url,
        filename: result.filename,
        provider: result.provider,
      });
    },
  );
});
