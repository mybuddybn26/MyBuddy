import fp from 'fastify-plugin';
import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { Type } from '@sinclair/typebox';
import { config } from '../../config.js';
import { synthesizeSpeech, VALID_VOICES } from './deepgramService.js';

const TTSBody = Type.Object({
  text: Type.String({ minLength: 1, maxLength: 5000 }),
  voice_id: Type.Optional(Type.String()),
});

export default fp(async (app: FastifyInstance) => {
  app.get('/api/voice/tts/voices', { schema: { tags: ['voice', 'tts'] } }, async (_request, reply) => {
    const voices = VALID_VOICES.map((v) => ({ id: v, label: v.replace('aura-', '').replace('-en', '').replace(/^./, (c) => c.toUpperCase()) }));
    return reply.send({ voices, default: VALID_VOICES[0] });
  });

  app.post(
    '/api/voice/tts/speak',
    { schema: { tags: ['voice', 'tts'], body: TTSBody } },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { text, voice_id } = request.body as { text: string; voice_id?: string };

      if (!config.DEEPGRAM_API_KEY) {
        return reply.status(503).send({ detail: 'Text-to-speech not configured. Set DEEPGRAM_API_KEY.' });
      }

      if (voice_id && !VALID_VOICES.includes(voice_id)) {
        return reply.status(400).send({ detail: `Unsupported voice: ${voice_id}. Valid: ${VALID_VOICES.join(', ')}` });
      }

      try {
        const { buffer, contentType } = await synthesizeSpeech(text, voice_id);
        request.log.info({ len: buffer.length, provider: 'deepgram', voice: voice_id || 'default' }, 'TTS OK');
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
