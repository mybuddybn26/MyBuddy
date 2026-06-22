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

  if (!config.DEEPGRAM_API_KEY) {
    throw new Error('DEEPGRAM_API_KEY is not configured');
  }

  const voice = 'aura-asteria-en';

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 30000);

  let res: Response;
  try {
    res = await fetch(
      `https://api.deepgram.com/v1/speak?model=${voice}`,
      {
        method: 'POST',
        headers: {
          Authorization: `Token ${config.DEEPGRAM_API_KEY}`,
          'Content-Type': 'application/json',
        },
        signal: controller.signal,
        body: JSON.stringify({ text: cleaned }),
      },
    );
  } finally {
    clearTimeout(timeout);
  }

  if (!res.ok) {
    const errText = await res.text().catch(() => 'unknown');
    const detail = errText.slice(0, 300);
    if (res.status === 401) {
      throw new Error('Deepgram: Invalid API key. Check your DEEPGRAM_API_KEY.');
    }
    if (res.status === 402) {
      throw new Error('Deepgram: No credits remaining. Add credits at deepgram.com.');
    }
    if (res.status === 429) {
      throw new Error('Deepgram: Rate limit exceeded. Try again later.');
    }
    throw new Error(`Deepgram TTS failed (${res.status}): ${detail}`);
  }

  const arrayBuffer = await res.arrayBuffer();
  if (arrayBuffer.byteLength < 100) {
    throw new Error('Deepgram returned empty audio response');
  }

  const buffer = Buffer.from(arrayBuffer);
  const contentType = res.headers.get('content-type') || 'audio/mp3';

  setCache(h, buffer, contentType);

  return { buffer, contentType };
}
