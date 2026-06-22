import { config } from '../../config.js';
import { formatForSpeech } from './speechFormatter.js';
import { getCached, setCache } from './audioCache.js';
import { createHash } from 'node:crypto';

export interface TTSResult {
  buffer: Buffer;
  contentType: string;
}

function hashText(text: string): string {
  return createHash('sha256').update(text).digest('hex').slice(0, 16);
}

export async function synthesizeSpeech(text: string): Promise<TTSResult> {
  const cleaned = formatForSpeech(text);
  const h = hashText(cleaned);

  const cached = getCached(h);
  if (cached) {
    return { buffer: cached.buffer, contentType: cached.contentType };
  }

  const voiceId = '21m00Tcm4TlvDq8ikWAM'; // Rachel — warm, natural

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 30000);

  const res = await fetch(
    `https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`,
    {
      method: 'POST',
      headers: {
        'xi-api-key': config.ELEVENLABS_API_KEY,
        'Content-Type': 'application/json',
      },
      signal: controller.signal,
      body: JSON.stringify({
        text: cleaned,
        model_id: 'eleven_multilingual_v2',
        voice_settings: {
          stability: 0.5,
          similarity_boost: 0.75,
        },
      }),
    },
  );
  clearTimeout(timeout);

  if (!res.ok) {
    const errText = await res.text().catch(() => 'unknown');
    throw new Error(`ElevenLabs TTS failed (${res.status}): ${errText.slice(0, 200)}`);
  }

  const buffer = Buffer.from(await res.arrayBuffer());
  const contentType = res.headers.get('content-type') || 'audio/mpeg';

  setCache(h, buffer, contentType);

  return { buffer, contentType };
}
