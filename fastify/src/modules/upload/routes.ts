import fp from 'fastify-plugin';
import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { config } from '../../config.js';
import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { createWriteStream } from 'node:fs';
import { pipeline } from 'node:stream/promises';

const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/gif', 'image/webp', 'application/pdf'];

export default fp(async (app: FastifyInstance) => {
  // Ensure upload directory exists
  const uploadDir = config.UPLOAD_DIR;
  await mkdir(uploadDir, { recursive: true });

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

      const ext = data.mimetype.split('/')[1] || 'jpg';
      const filename = `${randomUUID()}.${ext}`;
      const filepath = join(uploadDir, filename);

      await pipeline(data.file, createWriteStream(filepath));

      // Return the URL path (frontend prepends the API base)
      const url = `/uploads/${filename}`;

      return reply.status(201).send({ url, filename });
    },
  );
});
