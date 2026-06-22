import { Type, Static } from '@sinclair/typebox';
import { Value } from '@sinclair/typebox/value';

const ConfigSchema = Type.Object({
  HOST: Type.String({ default: '0.0.0.0' }),
  PORT: Type.Number({ default: 3000 }),
  LOG_LEVEL: Type.String({ default: 'debug' }),
  DATABASE_URL: Type.String({ minLength: 1 }),
  JWT_SECRET: Type.String({ minLength: 32 }),
  JWT_PROVIDER: Type.Union(
    [
      Type.Literal('shared_secret'),
      Type.Literal('public_key'),
      Type.Literal('jwks'),
      Type.Literal('auto'),
    ],
    { default: 'auto' },
  ),
  JWT_PUBLIC_KEY: Type.String({ default: '' }),
  JWT_JWKS_URL: Type.String({ default: '' }),
  JWT_ALGORITHMS: Type.String({ default: '' }),
  JWT_ISSUER: Type.String({ default: '' }),
  JWT_AUDIENCE: Type.String({ default: '' }),
  JWT_REQUIRE_EXP: Type.Boolean({ default: true }),
  JWT_VERIFY_NBF: Type.Boolean({ default: true }),
  CORS_ALLOW_ORIGINS: Type.String({ default: 'http://localhost:5173' }),
  CRED_ENCRYPTION_KEY: Type.String({ default: '' }),
  RATE_LIMIT_MAX: Type.Number({ default: 200 }),
  RATE_LIMIT_WINDOW: Type.String({ default: '1 minute' }),
  EXPOSE_API_DOCS: Type.Boolean({ default: false }),
  LOG_PRETTY: Type.Boolean({ default: false }),

  // ─── AI Provider Keys ───
  DEEPSEEK_API_KEY: Type.String({ default: '' }),
  ASSEMBLYAI_API_KEY: Type.String({ default: '' }),
  DEEPGRAM_API_KEY: Type.String({ default: '' }),
  GROQ_API_KEY: Type.String({ default: '' }),
  ANTHROPIC_API_KEY: Type.String({ default: '' }),
  OPENAI_API_KEY: Type.String({ default: '' }),
  ELEVENLABS_API_KEY: Type.String({ default: '' }),

  // ─── DeepSeek Configuration ───
  DEEPSEEK_MODEL: Type.String({ default: 'deepseek-chat' }),
  DEEPSEEK_INPUT_COST_PER_1M: Type.Number({ default: 0.14 }),
  DEEPSEEK_OUTPUT_COST_PER_1M: Type.Number({ default: 0.28 }),

  // ─── Kokoro TTS ───
  KOKORO_TTS_URL: Type.String({ default: 'http://127.0.0.1:8001' }),

  // ─── Faster-Whisper STT (self-hosted) ───
  WHISPER_STT_URL: Type.String({ default: 'http://127.0.0.1:8002' }),

  // ─── Ollama Configuration ───
  OLLAMA_URL: Type.String({ default: 'http://127.0.0.1:11434' }),
  OLLAMA_MODEL: Type.String({ default: 'gemma4:latest' }),

  // ─── Stripe ───
  STRIPE_SECRET_KEY: Type.String({ default: '' }),
  STRIPE_WEBHOOK_SECRET: Type.String({ default: '' }),

  // ─── File Uploads ───
  UPLOAD_DIR: Type.String({ default: './uploads' }),
  MAX_FILE_SIZE_MB: Type.Number({ default: 10 }),
});

export type Config = Static<typeof ConfigSchema>;

function loadConfig(): Config {
  const raw = {
    HOST: process.env.HOST ?? '0.0.0.0',
    PORT: Number(process.env.PORT ?? 3000),
    LOG_LEVEL: process.env.LOG_LEVEL ?? 'debug',
    DATABASE_URL: process.env.DATABASE_URL ?? '',
    JWT_SECRET: process.env.JWT_SECRET ?? '',
    JWT_PROVIDER: process.env.JWT_PROVIDER ?? 'auto',
    JWT_PUBLIC_KEY: process.env.JWT_PUBLIC_KEY ?? '',
    JWT_JWKS_URL: process.env.JWT_JWKS_URL ?? '',
    JWT_ALGORITHMS: process.env.JWT_ALGORITHMS ?? '',
    JWT_ISSUER: process.env.JWT_ISSUER ?? '',
    JWT_AUDIENCE: process.env.JWT_AUDIENCE ?? '',
    JWT_REQUIRE_EXP: process.env.JWT_REQUIRE_EXP !== 'false',
    JWT_VERIFY_NBF: process.env.JWT_VERIFY_NBF !== 'false',
    CORS_ALLOW_ORIGINS:
      process.env.CORS_ALLOW_ORIGINS ?? 'http://localhost:5173',
    CRED_ENCRYPTION_KEY: process.env.CRED_ENCRYPTION_KEY ?? '',
    RATE_LIMIT_MAX: Number(process.env.RATE_LIMIT_MAX ?? 200),
    RATE_LIMIT_WINDOW: process.env.RATE_LIMIT_WINDOW ?? '1 minute',
    EXPOSE_API_DOCS: process.env.EXPOSE_API_DOCS === 'true',
    LOG_PRETTY: process.env.LOG_PRETTY === 'true',

    // AI Provider Keys
    DEEPSEEK_API_KEY: process.env.DEEPSEEK_API_KEY ?? '',
    ASSEMBLYAI_API_KEY: process.env.ASSEMBLYAI_API_KEY ?? '',
    DEEPGRAM_API_KEY: process.env.DEEPGRAM_API_KEY ?? '',
    GROQ_API_KEY: process.env.GROQ_API_KEY ?? '',
    ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY ?? '',
    OPENAI_API_KEY: process.env.OPENAI_API_KEY ?? '',
    ELEVENLABS_API_KEY: process.env.ELEVENLABS_API_KEY ?? '',

    // DeepSeek Configuration
    DEEPSEEK_MODEL: process.env.DEEPSEEK_MODEL ?? 'deepseek-chat',
    DEEPSEEK_INPUT_COST_PER_1M: Number(process.env.DEEPSEEK_INPUT_COST_PER_1M ?? 0.14),
    DEEPSEEK_OUTPUT_COST_PER_1M: Number(process.env.DEEPSEEK_OUTPUT_COST_PER_1M ?? 0.28),

    // Kokoro TTS
    KOKORO_TTS_URL: process.env.KOKORO_TTS_URL ?? 'http://127.0.0.1:8001',

    // Faster-Whisper STT
    WHISPER_STT_URL: process.env.WHISPER_STT_URL ?? 'http://127.0.0.1:8002',

    // Ollama Configuration
    OLLAMA_URL: process.env.OLLAMA_URL ?? 'http://127.0.0.1:11434',
    OLLAMA_MODEL: process.env.OLLAMA_MODEL ?? 'gemma4:latest',

    // Stripe
    STRIPE_SECRET_KEY: process.env.STRIPE_SECRET_KEY ?? '',
    STRIPE_WEBHOOK_SECRET: process.env.STRIPE_WEBHOOK_SECRET ?? '',

    // File Uploads
    UPLOAD_DIR: process.env.UPLOAD_DIR ?? './uploads',
    MAX_FILE_SIZE_MB: Number(process.env.MAX_FILE_SIZE_MB ?? 10),
  };

  if (!Value.Check(ConfigSchema, raw)) {
    const errors = [...Value.Errors(ConfigSchema, raw)];
    const messages = errors.map((e) => `${e.path}: ${e.message}`).join(', ');
    throw new Error(`Invalid configuration: ${messages}`);
  }

  if (!raw.DATABASE_URL) {
    throw new Error('DATABASE_URL is required');
  }

  if (!raw.JWT_SECRET || raw.JWT_SECRET.length < 32) {
    throw new Error(
      'JWT_SECRET is required and must be at least 32 characters. Generate one with: openssl rand -base64 48',
    );
  }

  return raw;
}

export const config = loadConfig();
