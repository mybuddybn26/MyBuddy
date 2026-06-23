import fp from 'fastify-plugin';
import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { config } from '../../config.js';

async function transcribeAssemblyAI(
  buffer: Uint8Array,
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
  const blob = new Blob([buffer.buffer as ArrayBuffer], { type: mimetype });
  const formData = new FormData();
  formData.append('file', blob, filename);
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
            mimetype,
          );
          request.log.info(
            { len: transcript.length },
            'AssemblyAI transcription OK',
          );
          return reply.send({ transcript });
        } catch (err) {
          const msg = err instanceof Error ? err.message : 'unknown';
          request.log.warn({ msg }, 'AssemblyAI failed, falling back to Groq');
        }
      }

      // 2 ── Fallback: Groq / OpenAI ──
      if (!config.GROQ_API_KEY && !config.OPENAI_API_KEY) {
        return reply.status(503).send({
          detail:
            'Voice transcription not configured. Set ASSEMBLYAI_API_KEY or GROQ_API_KEY.',
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

      if (!config.ELEVENLABS_API_KEY) {
        return reply.status(503).send({
          detail: 'Text-to-speech not configured. Set ELEVENLABS_API_KEY.',
        });
      }

      const elevenVoiceId = voice_id || '21m00Tcm4TlvDq8ikWAM';

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

      if (!elRes.ok) {
        const errText = await elRes.text();
        request.log.error(
          { status: elRes.status, err: errText.slice(0, 200) },
          'ElevenLabs TTS failed',
        );
        return reply
          .status(502)
          .send({ detail: `TTS generation failed: ${errText}` });
      }

      const audioBuffer = Buffer.from(await elRes.arrayBuffer());
      request.log.info(
        { len: audioBuffer.length, provider: 'elevenlabs' },
        'TTS OK',
      );
      reply.header('Content-Type', 'audio/mpeg');
      reply.header('Content-Length', audioBuffer.length);
      return reply.send(audioBuffer);
    },
  );
});
