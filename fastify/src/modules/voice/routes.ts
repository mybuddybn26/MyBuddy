import fp from 'fastify-plugin';
import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { config } from '../../config.js';

export default fp(async (app: FastifyInstance) => {
  // ─── Transcribe Audio (Faster-Whisper self-hosted, Groq fallback) ───
  app.post(
    '/api/voice/transcribe',
    { schema: { tags: ['voice'] } },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const data = await request.file();
      if (!data) {
        return reply.status(400).send({ detail: 'No audio file provided' });
      }

      const buffer = await data.toBuffer();
      if (buffer.length < 100) {
        return reply.status(400).send({ detail: 'Audio file is too short' });
      }

      const filename = data.filename || 'audio.webm';
      const mimetype = data.mimetype || 'audio/webm';

      // ── Primary: Self-hosted Faster-Whisper ──
      const whisperUrl = config.WHISPER_STT_URL || 'http://127.0.0.1:8002';

      try {
        const formData = new FormData();
        formData.append('file', new File([new Uint8Array(buffer)], filename, { type: mimetype }));

        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 30000);

        const whisperRes = await fetch(`${whisperUrl}/transcribe`, {
          method: 'POST',
          signal: controller.signal,
          body: formData,
        });
        clearTimeout(timeout);

        if (whisperRes.ok) {
          const result = (await whisperRes.json()) as { text: string; language: string };
          request.log.info(
            `Faster-Whisper transcription OK (lang=${result.language}, len=${result.text.length})`,
          );
          return reply.send({ transcript: result.text });
        }

        const errText = await whisperRes.text();
        request.log.warn(
          `Faster-Whisper failed (${whisperRes.status}), falling back: ${errText.slice(0, 200)}`,
        );
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'unknown';
        request.log.warn(`Faster-Whisper unreachable, falling back to Groq: ${msg}`);
      }

      // ── Fallback: Groq Whisper ──
      if (!config.GROQ_API_KEY && !config.OPENAI_API_KEY) {
        return reply
          .status(503)
          .send({ detail: 'Voice transcription not configured. Start the Whisper service or set a cloud API key.' });
      }

      const file = new File([new Uint8Array(buffer)], filename, { type: mimetype });
      const fallbackForm = new FormData();
      fallbackForm.append('file', file);
      fallbackForm.append('model', 'whisper-large-v3-turbo');

      const apiKey = config.GROQ_API_KEY || config.OPENAI_API_KEY;
      const baseUrl = config.GROQ_API_KEY
        ? 'https://api.groq.com/openai/v1/audio/transcriptions'
        : 'https://api.openai.com/v1/audio/transcriptions';

      const fallbackRes = await fetch(baseUrl, {
        method: 'POST',
        headers: { Authorization: `Bearer ${apiKey}` },
        body: fallbackForm,
      });

      if (!fallbackRes.ok) {
        const errText = await fallbackRes.text();
        request.log.error({ errText, status: fallbackRes.status }, 'Groq fallback transcription failed');
        return reply
          .status(502)
          .send({ detail: `Voice transcription failed: ${errText}` });
      }

      const groqResult = (await fallbackRes.json()) as { text: string };
      return reply.send({ transcript: groqResult.text });
    },
  );

  // ─── Text-to-Speech (Kokoro-82M self-hosted) ───
  app.post(
    '/api/voice/tts',
    { schema: { tags: ['voice'] } },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { text, voice_id } = request.body as {
        text: string;
        voice_id?: string;
      };

      if (!text) {
        return reply.status(400).send({ detail: 'No text provided' });
      }

      // Determine lang_code from user's persona
      const userId = request.authUser!.sub;
      const { users } = await import('../../db/schema.js');
      const { eq } = await import('drizzle-orm');
      const [user] = await app.db
        .select()
        .from(users)
        .where(eq(users.id, userId))
        .limit(1);

      const langHint =
        (user?.aiPersona as { language?: string })?.language || 'en';
      // Kokoro-82M has no Malay or Brunei voice — map to English for those
      const langMap: Record<string, string> = {
        en: 'a',
        zh: 'z',
        ms: 'a',
        mixed: 'a',
      };
      const langCode = langMap[langHint] || 'a';

      const kokoroUrl = config.KOKORO_TTS_URL || 'http://127.0.0.1:5050';

      try {
        const response = await fetch(`${kokoroUrl}/tts`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            text,
            lang_code: langCode,
            voice: voice_id || '',
          }),
        });

        if (!response.ok) {
          const err = await response.text();
          request.log.error({ err }, 'Kokoro TTS failed');
          return reply.status(502).send({ detail: 'TTS generation failed' });
        }

        const audioBuffer = Buffer.from(await response.arrayBuffer());

        reply.header('Content-Type', 'audio/wav');
        reply.header('Content-Length', audioBuffer.length);
        return reply.send(audioBuffer);
      } catch (err) {
        request.log.error({ err }, 'Kokoro TTS unavailable');
        return reply.status(503).send({ detail: 'TTS service not available' });
      }
    },
  );
});
