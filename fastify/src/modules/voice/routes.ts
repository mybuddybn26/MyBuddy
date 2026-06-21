import fp from 'fastify-plugin';
import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { config } from '../../config.js';

async function transcribeAssemblyAI(
  buffer: Uint8Array,
  filename: string,
  mimetype: string,
): Promise<string> {
  const uploadRes = await fetch('https://api.assemblyai.com/v2/upload', {
    method: 'POST',
    headers: {
      authorization: config.ASSEMBLYAI_API_KEY,
      'content-type': mimetype,
    },
    body: buffer,
  });

  if (!uploadRes.ok) {
    const err = await uploadRes.text();
    throw new Error(`AssemblyAI upload failed (${uploadRes.status}): ${err}`);
  }

  const { upload_url } = (await uploadRes.json()) as { upload_url: string };

  const transcriptRes = await fetch(
    'https://api.assemblyai.com/v2/transcript',
    {
      method: 'POST',
      headers: {
        authorization: config.ASSEMBLYAI_API_KEY,
        'content-type': 'application/json',
      },
      body: JSON.stringify({ audio_url: upload_url }),
    },
  );

  if (!transcriptRes.ok) {
    const err = await transcriptRes.text();
    throw new Error(
      `AssemblyAI transcript create failed (${transcriptRes.status}): ${err}`,
    );
  }

  const { id } = (await transcriptRes.json()) as { id: string };

  let attempts = 0;
  while (attempts < 30) {
    const pollRes = await fetch(
      `https://api.assemblyai.com/v2/transcript/${id}`,
      {
        headers: { authorization: config.ASSEMBLYAI_API_KEY },
      },
    );

    if (!pollRes.ok) {
      const err = await pollRes.text();
      throw new Error(`AssemblyAI poll failed (${pollRes.status}): ${err}`);
    }

    const result = (await pollRes.json()) as {
      status: string;
      text?: string;
    };

    if (result.status === 'completed') {
      return result.text || '';
    }

    if (result.status === 'error') {
      throw new Error('AssemblyAI transcription returned error status');
    }

    attempts += 1;
    await new Promise((r) => setTimeout(r, 1000));
  }

  throw new Error('AssemblyAI transcription timed out');
}

async function transcribeGroq(
  buffer: Uint8Array,
  filename: string,
  mimetype: string,
): Promise<string> {
  const file = new File([buffer], filename, { type: mimetype });
  const formData = new FormData();
  formData.append('file', file);
  formData.append('model', 'whisper-large-v3-turbo');

  const apiKey = config.GROQ_API_KEY || config.OPENAI_API_KEY;
  const baseUrl = config.GROQ_API_KEY
    ? 'https://api.groq.com/openai/v1/audio/transcriptions'
    : 'https://api.openai.com/v1/audio/transcriptions';

  const res = await fetch(baseUrl, {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}` },
    body: formData,
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Groq transcription failed (${res.status}): ${err}`);
  }

  const result = (await res.json()) as { text: string };
  return result.text;
}

export default fp(async (app: FastifyInstance) => {
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

      // 1 ── Primary: AssemblyAI ──
      if (config.ASSEMBLYAI_API_KEY) {
        try {
          const transcript = await transcribeAssemblyAI(
            new Uint8Array(buffer),
            filename,
            mimetype,
          );
          request.log.info(
            { len: transcript.length },
            'AssemblyAI transcription OK',
          );
          return reply.send({ transcript });
        } catch (err) {
          const msg = err instanceof Error ? err.message : 'unknown';
          request.log.warn(
            { msg },
            'AssemblyAI failed, falling back to Whisper',
          );
        }
      }

      // 2 ── Self-hosted Faster-Whisper ──
      const whisperUrl = config.WHISPER_STT_URL || 'http://127.0.0.1:8002';

      try {
        const formData = new FormData();
        formData.append(
          'file',
          new File([new Uint8Array(buffer)], filename, { type: mimetype }),
        );

        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 30000);

        const whisperRes = await fetch(`${whisperUrl}/transcribe`, {
          method: 'POST',
          signal: controller.signal,
          body: formData,
        });
        clearTimeout(timeout);

        if (whisperRes.ok) {
          const result = (await whisperRes.json()) as {
            text: string;
            language: string;
          };
          request.log.info(
            { lang: result.language, len: result.text.length },
            'Faster-Whisper transcription OK',
          );
          return reply.send({ transcript: result.text });
        }

        const errText = await whisperRes.text();
        request.log.warn(
          { status: whisperRes.status },
          `Faster-Whisper failed, falling back to Groq: ${errText.slice(0, 200)}`,
        );
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'unknown';
        request.log.warn(
          { msg },
          `Faster-Whisper unreachable, falling back to Groq: ${msg}`,
        );
      }

      // 3 ── Fallback: Groq / OpenAI ──
      if (!config.GROQ_API_KEY && !config.OPENAI_API_KEY) {
        return reply.status(503).send({
          detail:
            'Voice transcription not configured. Set ASSEMBLYAI_API_KEY, start the Whisper service, or set a cloud API key.',
        });
      }

      try {
        const transcript = await transcribeGroq(
          new Uint8Array(buffer),
          filename,
          mimetype,
        );
        return reply.send({ transcript });
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'unknown';
        request.log.error({ msg }, 'Groq fallback transcription failed');
        return reply
          .status(502)
          .send({ detail: `Voice transcription failed: ${msg}` });
      }
    },
  );

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

      const ttsText = text.slice(0, 5000);

      // 1 ── Primary: ElevenLabs ──
      if (config.ELEVENLABS_API_KEY) {
        const elevenVoiceId = voice_id || '21m00Tcm4TlvDq8ikWAM';

        try {
          const controller = new AbortController();
          const timeout = setTimeout(() => controller.abort(), 30000);

          const elRes = await fetch(
            `https://api.elevenlabs.io/v1/text-to-speech/${elevenVoiceId}`,
            {
              method: 'POST',
              headers: {
                'xi-api-key': config.ELEVENLABS_API_KEY,
                'Content-Type': 'application/json',
              },
              signal: controller.signal,
              body: JSON.stringify({
                text: ttsText,
                model_id: 'eleven_multilingual_v2',
                voice_settings: {
                  stability: 0.5,
                  similarity_boost: 0.75,
                },
              }),
            },
          );
          clearTimeout(timeout);

          if (elRes.ok) {
            const audioBuffer = Buffer.from(await elRes.arrayBuffer());
            request.log.info(
              { len: audioBuffer.length, provider: 'elevenlabs' },
              'TTS OK',
            );
            reply.header('Content-Type', 'audio/mpeg');
            reply.header('Content-Length', audioBuffer.length);
            return reply.send(audioBuffer);
          }

          const errText = await elRes.text();
          request.log.warn(
            { status: elRes.status, err: errText.slice(0, 200) },
            'ElevenLabs TTS failed, falling back to Kokoro',
          );
        } catch (err) {
          const msg = err instanceof Error ? err.message : 'unknown';
          request.log.warn(
            { msg },
            `ElevenLabs TTS unreachable, falling back to Kokoro: ${msg}`,
          );
        }
      }

      // 2 ── Fallback: Self-hosted Kokoro-82M ──
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
            text: ttsText,
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
