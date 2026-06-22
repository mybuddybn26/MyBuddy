import fp from 'fastify-plugin';
import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { Type } from '@sinclair/typebox';
import { config } from '../../config.js';
import { synthesizeSpeech } from './deepgramService.js';

const TTSBody = Type.Object({
  text: Type.String({ minLength: 1, maxLength: 5000 }),
});

export default fp(async (app: FastifyInstance) => {
  app.post(
    '/api/voice/tts/speak',
    { schema: { tags: ['voice', 'tts'], body: TTSBody } },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { text } = request.body as { text: string };

      if (!config.DEEPGRAM_API_KEY) {
        return reply.status(503).send({
          detail: 'Text-to-speech not configured. Set DEEPGRAM_API_KEY.',
        });
      }

      try {
        const { buffer, contentType } = await synthesizeSpeech(text);
        request.log.info({ len: buffer.length, provider: 'deepgram' }, 'TTS OK');
        reply.header('Content-Type', contentType);
        reply.header('Content-Length', buffer.length);
        reply.header('Cache-Control', 'private, max-age=3600');
        return reply.send(buffer);
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'TTS failed';
        request.log.error({ err: msg }, 'TTS synthesis failed');
        return reply.status(502).send({ detail: msg });
      }
    },
  );
});
