import type { AiPersona } from '../../db/schema.js';
import { config } from '../../config.js';

/**
 * Build the system prompt from the user's AI persona settings.
 */
export function buildSystemPrompt(persona: AiPersona): string {
  const langMap: Record<string, string> = {
    en: 'English',
    ms: 'Bahasa Melayu',
    zh: 'Mandarin Chinese',
    mixed: 'a natural mix of English, Malay, and Mandarin as appropriate',
  };

  const toneMap: Record<string, string> = {
    formal: 'professional and polite',
    casual: 'friendly and conversational',
    slang:
      'casual with local slang and colloquial expressions (e.g. Brunei Malay style)',
  };

  const dialectNote =
    persona.dialect === 'brunei'
      ? ' Use Brunei Malay expressions where appropriate (e.g. "bisai", "banar", "apa khabar?").'
      : '';

  return `You are ${persona.name}, a helpful personal AI assistant.

PERSONALITY & LANGUAGE:
- Speak in ${langMap[persona.language] || 'English'}.
- Your tone is ${toneMap[persona.tone] || 'friendly and conversational'}.${dialectNote}
- Always greet the user warmly using your name "${persona.name}" when the conversation starts.

CAPABILITIES:
- When asked to create a budget (e.g. "Make me a $100 weekly food budget"), ALWAYS return a structured table as a JSON code block labeled \`budget\`. The response MUST include the budget JSON block. Example format:
\`\`\`budget
[
  {"category": "Vegetables", "allocated_amount": 15, "notes": "Fresh greens and root vegetables"},
  {"category": "Meat", "allocated_amount": 10, "notes": "Chicken and fish"}
]
\`\`\`
- When the user describes a sale or expense (e.g. "I sold 3 boxes of kuih for $10 each"), ALWAYS return structured data as a JSON code block labeled \`transaction\`. Example: \`\`\`transaction\n{"type": "sale", "amount": 30, "description": "Sold 3 boxes of kuih at 10 each", "category": "food"}\n\`\`\`
- When shown an image of a document, read it carefully and explain its contents in simple, plain language. Identify the document type (bill, letter, permit, statement, other).
- For general conversation, be helpful, warm, and supportive.

RESPONSE FORMAT:
- Keep responses concise and clear — your users may not be tech-savvy.
- Use simple language. Avoid jargon.
- When providing structured data, wrap it in a fenced code block with the appropriate label.`;
}

function buildMessages(
  messages: Array<{ role: 'user' | 'assistant'; content: string }>,
  persona: AiPersona,
) {
  return [
    { role: 'system', content: buildSystemPrompt(persona) },
    ...messages.map((m) => ({
      role: m.role,
      content:
        typeof m.content === 'string' ? m.content : JSON.stringify(m.content),
    })),
  ];
}

async function* streamDeepSeek(
  messages: Array<{ role: string; content: string }>,
): AsyncGenerator<{ type: 'text' | 'done'; content: string; tokens?: number }> {
  const response = await fetch('https://api.deepseek.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${config.DEEPSEEK_API_KEY}`,
    },
    body: JSON.stringify({
      model: config.DEEPSEEK_MODEL,
      messages,
      stream: true,
    }),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`DeepSeek error ${response.status}: ${text}`);
  }

  if (!response.body) {
    throw new Error('DeepSeek response body is empty');
  }

  const decoder = new TextDecoder();
  let buffer = '';

  for await (const chunk of response.body as unknown as AsyncIterable<Uint8Array>) {
    buffer += decoder.decode(chunk, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop() || '';

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || !trimmed.startsWith('data: ')) continue;

      const data = trimmed.slice(6);
      if (data === '[DONE]') continue;

      try {
        const json = JSON.parse(data);
        const delta = json.choices?.[0]?.delta;
        if (delta?.content) {
          yield { type: 'text', content: delta.content };
        }
        if (json.choices?.[0]?.finish_reason) {
          const promptTokens = json.usage?.prompt_tokens ?? 0;
          const completionTokens = json.usage?.completion_tokens ?? 0;
          yield {
            type: 'done',
            content: '',
            tokens: promptTokens + completionTokens,
          };
        }
      } catch (_e) {
        // ignore parse errors on partial chunks
      }
    }
  }
}

async function* streamOllama(
  messages: Array<{ role: string; content: string }>,
  model: string,
): AsyncGenerator<{ type: 'text' | 'done'; content: string; tokens?: number }> {
  const response = await fetch(`${config.OLLAMA_URL}/api/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ model, messages, stream: true }),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Ollama error: ${response.statusText} - ${text}`);
  }

  if (!response.body) {
    throw new Error('Ollama response body is empty');
  }

  const decoder = new TextDecoder();
  let buffer = '';

  for await (const chunk of response.body as unknown as AsyncIterable<Uint8Array>) {
    buffer += decoder.decode(chunk, { stream: true });
    const raw = buffer.split('\n');
    buffer = raw.pop() || '';
    const lines = raw.map((l) => l.trim()).filter((l) => l.length > 0);

    for (const line of lines) {
      try {
        const json = JSON.parse(line);
        if (json.message?.content) {
          yield { type: 'text', content: json.message.content };
        }
        if (json.done) {
          const promptTokens = json.prompt_eval_count ?? 0;
          const completionTokens = json.eval_count ?? 0;
          yield {
            type: 'done',
            content: '',
            tokens: promptTokens + completionTokens,
          };
        }
      } catch (_e) {
        // ignore
      }
    }
  }
}

/**
 * Stream a chat response — DeepSeek primary, Ollama fallback.
 */
export async function* streamChat(
  messages: Array<{
    role: 'user' | 'assistant';
    content: string;
  }>,
  persona: AiPersona,
): AsyncGenerator<{ type: 'text' | 'done'; content: string; tokens?: number }> {
  const formatted = buildMessages(messages, persona);

  // Try DeepSeek first if API key is configured
  if (config.DEEPSEEK_API_KEY) {
    try {
      yield* streamDeepSeek(formatted);
      return;
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'unknown';
      console.warn(`DeepSeek failed, falling back to Ollama: ${msg}`);
    }
  }

  // Fallback to Ollama
  yield* streamOllama(formatted, config.OLLAMA_MODEL);
}

/**
 * Analyze an image (document/photo) — DeepSeek Vision primary, Ollama fallback.
 */
export async function analyzeImage(
  imageBase64: string,
  _mediaType: 'image/jpeg' | 'image/png' | 'image/gif' | 'image/webp',
  userPrompt: string,
  persona: AiPersona,
): Promise<{ text: string; tokens: number }> {
  const prompt =
    userPrompt || 'What does this document say? Explain it in simple language.';

  // Try DeepSeek Vision
  if (config.DEEPSEEK_API_KEY) {
    try {
      const response = await fetch(
        'https://api.deepseek.com/v1/chat/completions',
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${config.DEEPSEEK_API_KEY}`,
          },
          body: JSON.stringify({
            model: config.DEEPSEEK_MODEL,
            messages: [
              {
                role: 'system',
                content: buildSystemPrompt(persona),
              },
              {
                role: 'user',
                content: [
                  {
                    type: 'image_url',
                    image_url: {
                      url: `data:${_mediaType};base64,${imageBase64}`,
                    },
                  },
                  { type: 'text', text: prompt },
                ],
              },
            ],
            max_tokens: 2048,
          }),
        },
      );

      if (response.ok) {
        const json = (await response.json()) as Record<string, unknown>;
        const choices = json['choices'] as
          | Array<Record<string, unknown>>
          | undefined;
        const text = choices?.[0]?.['message']
          ? String(
              (choices[0]['message'] as Record<string, unknown>)['content'] ||
                '',
            )
          : '';
        const usage = json['usage'] as Record<string, number> | undefined;
        const tokens =
          (usage?.['prompt_tokens'] ?? 0) + (usage?.['completion_tokens'] ?? 0);
        return { text, tokens };
      }
    } catch (err) {
      console.warn(
        `DeepSeek Vision failed, falling back to Ollama: ${err instanceof Error ? err.message : 'unknown'}`,
      );
    }
  }

  // Fallback to Ollama
  const response = await fetch(`${config.OLLAMA_URL}/api/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: config.OLLAMA_MODEL,
      messages: [
        { role: 'system', content: buildSystemPrompt(persona) },
        { role: 'user', content: prompt, images: [imageBase64] },
      ],
      stream: false,
    }),
  });

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(
      `Ollama image analysis failed: ${response.statusText} - ${errText}`,
    );
  }

  const json = (await response.json()) as Record<string, unknown>;
  const msg = json['message'] as Record<string, unknown> | undefined;
  const text = msg?.['content'] ? String(msg['content']) : '';
  const tokens =
    Number(json['prompt_eval_count'] ?? 0) + Number(json['eval_count'] ?? 0);
  return { text, tokens };
}
