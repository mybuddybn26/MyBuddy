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

  if (!cleaned || cleaned.length < 2) {
    throw new Error('Text is too short after formatting for speech');
  }

  const h = hashText(cleaned);

  const cached = getCached(h);
  if (cached) {
    return { buffer: cached.buffer, contentType: cached.contentType };
  }

  if (!config.ELEVENLABS_API_KEY) {
    throw new Error('ELEVENLABS_API_KEY is not configured');
  }

  const voiceId = '21m00Tcm4TlvDq8ikWAM';

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 30000);

  let res: Response;
  try {
    res = await fetch(
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
  } finally {
    clearTimeout(timeout);
  }

  if (!res.ok) {
    const errText = await res.text().catch(() => 'unknown');
    const detail = errText.slice(0, 300);
    if (res.status === 401) {
      throw new Error(
        'ElevenLabs: Invalid API key. Check your ELEVENLABS_API_KEY.',
      );
    }
    if (res.status === 402) {
      throw new Error(
        'ElevenLabs: No credits remaining. Add credits at elevenlabs.io to enable speech.',
      );
    }
    if (res.status === 429) {
      throw new Error('ElevenLabs: Rate limit exceeded. Try again later.');
    }
    throw new Error(`ElevenLabs TTS failed (${res.status}): ${detail}`);
  }

  const arrayBuffer = await res.arrayBuffer();
  if (arrayBuffer.byteLength < 100) {
    throw new Error('ElevenLabs returned empty audio response');
  }

  const buffer = Buffer.from(arrayBuffer);
  const contentType = res.headers.get('content-type') || 'audio/mpeg';

  setCache(h, buffer, contentType);

  return { buffer, contentType };
}
