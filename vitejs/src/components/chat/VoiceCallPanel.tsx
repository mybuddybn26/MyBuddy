import { useState, useRef, useCallback, useEffect } from 'react';
import { PhoneOff, LoaderCircle, X } from 'lucide-react';
import { VoiceRecorder } from '../../voice/voiceRecorder';
import { VoicePlayer } from '../../voice/voicePlayer';
import {
  type VoiceCallState,
  STATE_LABELS,
  isCallActive,
} from '../../voice/voiceState';
import { api } from '../../api';

interface VoiceCallPanelProps {
  open: boolean;
  onClose: () => void;
  onBubble?: (
    phase: string,
    role: 'user' | 'assistant',
    content: string,
  ) => void;
  onRevealText?: (text: string) => void;
}

const FALSE_POSITIVES = new Set([
  'thank you',
  'thanks',
  'thank',
  'bye',
  'you',
  'okay',
  'ok',
  'yes',
  'no',
  'hmm',
  'uh',
  'um',
  'oh',
  'ah',
  'hi',
  'hello',
  'hey',
  'so',
  'yeah',
  'yep',
  'nope',
  'maybe',
  'sure',
  'right',
  'good',
  'great',
  'fine',
  'well',
  'sorry',
  'please',
  'what',
  'who',
  'when',
  'where',
  'why',
  'how',
]);

function containsNonEnglish(text: string): boolean {
  const cyrillic = /[\u0400-\u04FF]/.test(text);
  if (cyrillic) return true;
  const eastAsian = /[\u3040-\u30FF\u4E00-\u9FFF\uAC00-\uD7AF]/.test(text);
  if (eastAsian) return true;
  const unusual = text.match(/[\u00C0-\u00FF\u0100-\u024F\u1E00-\u1EFF]/g);
  if (unusual && unusual.length > text.length * 0.3) return true;
  return false;
}

function words(text: string): string[] {
  return text.split(/\s+/).filter((w) => w.length > 0);
}

const HALLUCINATION_PHRASES = new Set([
  'продолжение следует',
  'subtitles',
  'captions',
  'subtitle',
  'caption',
  'transcribed by',
  'auto-generated',
  'automatic speech recognition',
]);

function scoreTranscript(
  text: string,
  peak: number,
  avgRms: number,
  voicedFrames: number,
  duration: number,
): { accept: boolean; reason: string } {
  const trimmed = text.trim();
  const w = words(trimmed);
  const meaningWords = w.filter((x) => x.length > 1);
  const mwCount = meaningWords.length;
  const lower = trimmed
    .toLowerCase()
    .replace(/[.!?,]$/, '')
    .trim();
  const isQuestion =
    /^(what|how|why|when|where|who|can|could|do|does|is|are|will|would|should|explain|tell|show|help|make|create|i want|i need|i would|please|stop|end|why did)/i.test(
      trimmed,
    );
  const hasEnglish = /[a-zA-Z]{3,}/.test(trimmed);

  if (!trimmed) return { accept: false, reason: 'empty' };
  if (trimmed.length < 2) return { accept: false, reason: 'too short' };

  if (
    FALSE_POSITIVES.has(lower) &&
    duration < 2500 &&
    peak < 30 &&
    voicedFrames < 50
  )
    return { accept: false, reason: `false positive "${lower}"` };

  if (mwCount === 0) return { accept: false, reason: 'no meaningful words' };
  if (mwCount === 1 && duration < 2000 && !isQuestion)
    return { accept: false, reason: 'single short word, no question' };

  if (HALLUCINATION_PHRASES.has(lower) || /продолжение/i.test(trimmed))
    return { accept: false, reason: 'known hallucination phrase' };

  if (!hasEnglish && containsNonEnglish(trimmed))
    return { accept: false, reason: 'non-English text in English voice mode' };

  if (duration < 400 && mwCount < 2)
    return { accept: false, reason: 'too short + too few words' };

  if (avgRms < 2 && peak < 10 && mwCount < 3 && !isQuestion)
    return {
      accept: false,
      reason: `near-silence (rms:${avgRms.toFixed(1)}, peak:${peak})`,
    };

  const signals =
    0 +
    (mwCount >= 2 ? 2 : mwCount >= 1 ? 1 : 0) +
    (isQuestion ? 2 : 0) +
    (peak > 30 ? 2 : peak > 15 ? 1 : 0) +
    (voicedFrames > 100 ? 2 : voicedFrames > 30 ? 1 : 0) +
    (duration > 1500 ? 1 : 0);

  if (signals >= 3)
    return {
      accept: true,
      reason: `score ${signals}/7 (words:${mwCount}, peak:${peak}, voiced:${voicedFrames})`,
    };
  if (signals >= 2 && peak > 10 && mwCount >= 2)
    return { accept: true, reason: `borderline: score ${signals}/7` };

  return {
    accept: false,
    reason: `insufficient: score ${signals}/7 (words:${mwCount}, peak:${peak}, voiced:${voicedFrames})`,
  };
}

function Waveform({
  active,
  level,
  color,
}: {
  active: boolean;
  level: number;
  color: string;
}) {
  const [heights, setHeights] = useState<number[]>([4, 4, 4, 4, 4]);
  const rafRef = useRef(0);
  useEffect(() => {
    if (!active) {
      setHeights([4, 4, 4, 4, 4]);
      return;
    }
    const animate = () => {
      setHeights(
        Array.from({ length: 5 }, (_, i) => {
          const base = 4 + (level / 100) * 20;
          const v = Math.sin(Date.now() / 150 + i * 1.2) * 4;
          return Math.max(3, Math.min(30, base + v));
        }),
      );
      rafRef.current = requestAnimationFrame(animate);
    };
    rafRef.current = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(rafRef.current);
  }, [active, level]);
  return (
    <div className='flex items-end gap-0.5 h-6'>
      {heights.map((h, i) => (
        <span
          key={i}
          className='w-1 rounded-full'
          style={{
            height: `${h}px`,
            backgroundColor: color,
            opacity: 0.4 + (level / 100) * 0.6,
          }}
        />
      ))}
    </div>
  );
}

export function VoiceCallPanel({
  open,
  onClose,
  onBubble,
  onRevealText,
}: VoiceCallPanelProps) {
  const [state, setState] = useState<VoiceCallState>('idle');
  const [userTranscript, setUserTranscript] = useState('');
  const [assistantTranscript, setAssistantTranscript] = useState('');
  const [audioLevel, setAudioLevel] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const stateRef = useRef<VoiceCallState>('idle');
  const recorderRef = useRef<VoiceRecorder | null>(null);
  const playerRef = useRef<VoicePlayer | null>(null);
  const historyRef = useRef<
    Array<{ role: 'user' | 'assistant'; content: string }>
  >([]);
  const processingRef = useRef(false);
  const isSpeakingRef = useRef(false);
  const startListeningRef = useRef<() => void>(() => {});
  const speakRef = useRef<(text: string) => Promise<void>>(async () => {});
  const thinkRef = useRef<(text: string) => Promise<void>>(async () => {});

  const setCallState = useCallback((s: VoiceCallState) => {
    stateRef.current = s;
    setState(s);
  }, []);

  const cleanup = useCallback(() => {
    recorderRef.current?.dispose();
    recorderRef.current = null;
    playerRef.current?.stop();
    playerRef.current = null;
    processingRef.current = false;
    isSpeakingRef.current = false;
    onBubble?.('cleanup', 'user', '');
  }, [onBubble]);

  const speak = useCallback(
    async (text: string) => {
      setCallState('speaking');
      setAssistantTranscript(text);
      const cleaned = text
        .replace(/```[\s\S]*?```/g, '')
        .replace(/`[^`]+`/g, '$1')
        .trim();
      if (!cleaned) {
        startListeningRef.current();
        return;
      }
      isSpeakingRef.current = true;

      const words = cleaned.split(' ');
      const estimatedDuration = Math.max(2000, words.length * 300);
      let revealed = 0;

      const revealTimer = setInterval(() => {
        revealed = Math.min(
          words.length,
          revealed +
            Math.max(1, Math.ceil(words.length / (estimatedDuration / 200))),
        );
        const partial = words.slice(0, revealed).join(' ');
        if (partial) onRevealText?.(partial);
      }, 200);

      try {
        const { ensureFreshToken, getToken } = await import('../../auth');
        await ensureFreshToken();
        const token = getToken();
        const BASE = import.meta.env.VITE_API_URL || '';
        const voiceId = localStorage.getItem('buddy-tts-voice') || undefined;
        const body: Record<string, string> = { text: cleaned.slice(0, 5000) };
        if (voiceId) body.voice_id = voiceId;
        const res = await fetch(`${BASE}/api/voice/tts/speak`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
          },
          body: JSON.stringify(body),
        });
        if (!res.ok) throw new Error('TTS failed');
        const blob = await res.blob();
        if (blob.size < 100) throw new Error('Empty audio');
        const player = new VoicePlayer();
        playerRef.current = player;
        player.onEnd(() => {
          clearInterval(revealTimer);
          onRevealText?.(cleaned);
          isSpeakingRef.current = false;
          if (isCallActive(stateRef.current)) startListeningRef.current();
        });
        await player.play(blob);
        clearInterval(revealTimer);
        onRevealText?.(cleaned);
        playerRef.current = null;
        isSpeakingRef.current = false;
      } catch (err) {
        clearInterval(revealTimer);
        onRevealText?.(cleaned);
        console.error('[VoiceCall] TTS error:', err);
        isSpeakingRef.current = false;
        if (isCallActive(stateRef.current)) {
          setError('Speech unavailable');
          setTimeout(() => {
            if (isCallActive(stateRef.current)) startListeningRef.current();
          }, 2000);
        }
      }
    },
    [setCallState, onRevealText],
  );

  const think = useCallback(
    async (text: string) => {
      if (!isCallActive(stateRef.current) || processingRef.current) return;
      processingRef.current = true;
      setCallState('thinking');
      try {
        const history = historyRef.current.slice(-12);
        const t0 = performance.now();
        const response = await api.chatStream(text, 'voice', history);
        if (!response.body) throw new Error('No stream');
        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let fullText = '';
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          if (!isCallActive(stateRef.current)) {
            reader.cancel();
            processingRef.current = false;
            return;
          }
          const chunk = decoder.decode(value, { stream: true });
          for (const line of chunk.split('\n')) {
            if (!line.startsWith('data: ')) continue;
            try {
              const d = JSON.parse(line.slice(6));
              if (d.type === 'text') fullText += d.content;
            } catch {
              /* skip */
            }
          }
        }
        const cleaned = fullText.replace(/```[\s\S]*?```/g, '').trim();
        console.log(
          `[VoiceLatency] AI: ${Math.round(performance.now() - t0)}ms`,
        );
        if (cleaned) {
          historyRef.current.push({ role: 'assistant', content: cleaned });
          onBubble?.('responding', 'assistant', cleaned);
          processingRef.current = false;
          await speakRef.current(cleaned);
        } else {
          processingRef.current = false;
          startListeningRef.current();
        }
      } catch (err) {
        console.error('[VoiceCall] AI error:', err);
        processingRef.current = false;
        if (isCallActive(stateRef.current)) {
          setError('AI unavailable');
          setCallState('disconnected');
        }
      }
    },
    [setCallState, onBubble],
  );

  const onTranscribe = useCallback(
    async (blob: Blob, recorder: VoiceRecorder) => {
      try {
        if (isSpeakingRef.current) {
          console.log('[VoiceCall] Ignoring: Buddy speaking');
          startListeningRef.current();
          return;
        }
        if (!recorder.hadRealSpeech) {
          console.log('[VoiceCall] Ignoring: no real speech');
          startListeningRef.current();
          return;
        }
        if (!recorder.minDurationMet) {
          console.log('[VoiceCall] Ignoring: too short');
          startListeningRef.current();
          return;
        }

        const t0 = performance.now();
        onBubble?.('transcribing', 'user', '');
        const result = await api.transcribe(blob);
        console.log(
          `[VoiceLatency] STT: ${Math.round(performance.now() - t0)}ms`,
        );
        const text = result.transcript?.trim();

        if (!text) {
          onBubble?.('ignored', 'user', '');
          startListeningRef.current();
          return;
        }

        const filterResult = scoreTranscript(
          text,
          recorder.peakLevel || 0,
          recorder.averageRMS || 0,
          recorder.voicedFrames || 0,
          recorder.recordingDuration || 0,
        );
        if (!filterResult.accept) {
          console.log(
            `[VoiceFilter] Rejected: ${filterResult.reason} — "${text}"`,
          );
          onBubble?.('ignored', 'user', '');
          startListeningRef.current();
          return;
        }
        console.log(
          `[VoiceFilter] Accepted: ${filterResult.reason} — "${text}"`,
        );

        console.log('[VoiceCall] Accepted:', text);
        setUserTranscript(text);
        historyRef.current.push({ role: 'user', content: text });
        onBubble?.('accepted', 'user', text);
        onBubble?.('thinking', 'assistant', '');
        await thinkRef.current(text);
      } catch (err) {
        console.error('[VoiceCall] STT error:', err);
        if (isCallActive(stateRef.current)) {
          setError('Speech recognition failed');
          setCallState('disconnected');
        }
      }
    },
    [setCallState, onBubble],
  );

  const startListening = useCallback(() => {
    if (!isCallActive(stateRef.current)) return;
    setUserTranscript('');
    setAssistantTranscript('');
    setError(null);
    setCallState('listening');
    recorderRef.current?.dispose();
    const recorder = new VoiceRecorder({
      onAudioLevel: setAudioLevel,
      onSpeechDetected: () => {
        console.log('[VoiceCall] Speech started');
      },
      onSilenceDetected: () => {
        const blob = recorder.stop();
        recorderRef.current = null;
        if (blob) onTranscribe(blob, recorder);
        else if (isCallActive(stateRef.current)) startListeningRef.current();
      },
      onError: (msg) => {
        setError(msg);
        setCallState('disconnected');
      },
    });
    recorderRef.current = recorder;
    recorder.start();
  }, [onTranscribe, setCallState]);

  const interrupt = useCallback(() => {
    if (stateRef.current !== 'speaking') return;
    playerRef.current?.stop();
    playerRef.current = null;
    processingRef.current = false;
    isSpeakingRef.current = false;
    setCallState('interrupted');
    setTimeout(() => {
      if (stateRef.current === 'interrupted') startListeningRef.current();
    }, 200);
  }, [setCallState]);

  const handleStart = useCallback(() => {
    setError(null);
    setUserTranscript('');
    setAssistantTranscript('');
    historyRef.current = [];
    processingRef.current = false;
    isSpeakingRef.current = false;
    setCallState('connecting');
    setTimeout(() => {
      if (stateRef.current === 'connecting') startListeningRef.current();
    }, 500);
  }, [setCallState]);

  const handleEnd = useCallback(() => {
    setCallState('ending');
    cleanup();
    setCallState('idle');
    setUserTranscript('');
    setAssistantTranscript('');
    setError(null);
    onClose();
  }, [cleanup, setCallState, onClose]);

  useEffect(() => {
    speakRef.current = speak;
  }, [speak]);
  useEffect(() => {
    thinkRef.current = think;
  }, [think]);
  useEffect(() => {
    startListeningRef.current = startListening;
  }, [startListening]);

  useEffect(() => {
    return cleanup;
  }, [cleanup]);

  if (!open) return null;

  if (!isCallActive(state)) {
    return (
      <div className='border-t border-slate-200 bg-white p-4 animate-fade-in'>
        <div className='flex items-center justify-between mb-3'>
          <div className='flex items-center gap-2'>
            <span className='text-lg'>&#x1F916;</span>
            <span className='text-sm font-semibold text-slate-700'>
              Voice Call
            </span>
          </div>
          <button
            onClick={onClose}
            className='p-1 text-slate-400 hover:text-slate-600 rounded-md'
            aria-label='Close'
          >
            <X size={18} />
          </button>
        </div>
        <p className='text-xs text-slate-500 mb-3'>
          Talk naturally — Buddy listens and responds.
        </p>
        {error && (
          <p className='text-xs text-red-500 bg-red-50 rounded-lg px-2 py-1 mb-3'>
            {error}
          </p>
        )}
        <button
          onClick={handleStart}
          className='w-full py-2 bg-primary-500 text-white rounded-xl text-sm font-semibold hover:bg-primary-600 transition-colors'
        >
          Start Call
        </button>
      </div>
    );
  }

  const color =
    state === 'listening'
      ? 'var(--color-success)'
      : state === 'speaking'
        ? 'var(--color-primary-500)'
        : 'var(--color-primary-400)';

  return (
    <div className='border-t-2 border-primary-200 bg-white animate-fade-in'>
      <div className='flex items-center justify-between px-4 py-2 bg-primary-50/50'>
        <div className='flex items-center gap-2'>
          <span className='w-2 h-2 rounded-full bg-green-400 animate-pulse' />
          <span className='text-xs font-medium text-primary-700'>
            {STATE_LABELS[state]}
          </span>
        </div>
        <div className='flex items-center gap-2'>
          <button
            onClick={interrupt}
            className='text-xs text-primary-500 hover:text-primary-700 font-medium'
          >
            Interrupt
          </button>
          <button
            onClick={handleEnd}
            className='p-1.5 bg-red-500 text-white rounded-full hover:bg-red-600 transition-colors'
            aria-label='End call'
          >
            <PhoneOff size={14} />
          </button>
        </div>
      </div>
      <div className='px-4 py-3'>
        <div className='flex items-center gap-3 mb-2'>
          <Waveform active level={audioLevel} color={color} />
          {state === 'thinking' && (
            <LoaderCircle size={16} className='animate-spin text-primary-400' />
          )}
          <span className='text-xs text-slate-500'>
            {state === 'listening' && "I'm listening\u2026"}
            {state === 'thinking' && 'Thinking\u2026'}
            {state === 'connecting' && 'Connecting\u2026'}
            {state === 'interrupted' && 'Go ahead\u2026'}
          </span>
        </div>
        <div className='space-y-1.5 max-h-32 overflow-y-auto text-xs'>
          {userTranscript && (
            <div className='text-slate-600 leading-relaxed'>
              <span className='text-slate-400'>You: </span>
              {userTranscript}
            </div>
          )}
          {assistantTranscript && (
            <div className='text-primary-600 leading-relaxed'>
              <span className='text-primary-400'>Buddy: </span>
              {assistantTranscript}
            </div>
          )}
        </div>
        {state === 'disconnected' && error && (
          <div className='mt-2 flex items-center gap-2'>
            <p className='text-xs text-red-500'>{error}</p>
            <button
              onClick={handleStart}
              className='text-xs text-primary-500 hover:text-primary-700 font-medium'
            >
              Retry
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
