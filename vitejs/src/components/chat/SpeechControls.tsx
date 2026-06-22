import { useState, useRef, useCallback, useEffect } from 'react';
import { Volume2, Pause, Play, Square, Loader2 } from 'lucide-react';
import { useToast } from '../Toast';

interface SpeechControlsProps {
  text: string;
  label?: string;
}

type SpeechState = 'idle' | 'loading' | 'playing' | 'paused';

const audioCache = new Map<string, string>();
const activeAudioRef: { current: HTMLAudioElement | null } = { current: null };

export function SpeechControls({ text, label = 'Read' }: SpeechControlsProps) {
  const [state, setState] = useState<SpeechState>('idle');
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const audioUrlRef = useRef<string | null>(null);
  const toast = useToast();

  const cleanup = useCallback(() => {
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.src = '';
      audioRef.current = null;
    }
    if (audioUrlRef.current) {
      URL.revokeObjectURL(audioUrlRef.current);
      audioUrlRef.current = null;
    }
    if (activeAudioRef.current === audioRef.current) {
      activeAudioRef.current = null;
    }
  }, []);

  useEffect(() => {
    return cleanup;
  }, [cleanup]);

  const stopGlobalAudio = useCallback(() => {
    if (activeAudioRef.current && activeAudioRef.current !== audioRef.current) {
      activeAudioRef.current.pause();
      activeAudioRef.current.src = '';
      activeAudioRef.current = null;
    }
  }, []);

  const speak = useCallback(async () => {
    stopGlobalAudio();
    setState('loading');

    const trimmed = text.trim();
    if (!trimmed) {
      setState('idle');
      return;
    }

    try {
      const cachedUrl = audioCache.get(trimmed);
      if (cachedUrl) {
        const audio = new Audio(cachedUrl);
        audioRef.current = audio;
        activeAudioRef.current = audio;
        audioUrlRef.current = cachedUrl;

        audio.onended = () => {
          setState('idle');
          cleanup();
        };
        audio.onerror = () => {
          console.error('Audio playback error (cached)');
          setState('idle');
          cleanup();
        };

        await audio.play();
        setState('playing');
        return;
      }

      const { ensureFreshToken, getToken } = await import('../../auth');
      await ensureFreshToken();
      const token = getToken();
      const BASE = import.meta.env.VITE_API_URL || '';

      const res = await fetch(`${BASE}/api/voice/tts/speak`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ text: trimmed.slice(0, 5000) }),
      });

      if (!res.ok) {
        const errBody = await res.json().catch(() => ({ detail: 'TTS request failed' }));
        const detail = (errBody as { detail?: string }).detail || 'TTS request failed';
        throw new Error(detail);
      }

      const blob = await res.blob();
      if (blob.size < 100) {
        throw new Error('TTS returned empty audio');
      }

      const url = URL.createObjectURL(blob);
      audioCache.set(trimmed, url);
      audioUrlRef.current = url;

      const audio = new Audio(url);
      audioRef.current = audio;
      activeAudioRef.current = audio;

      audio.onended = () => {
        setState('idle');
        cleanup();
      };
      audio.onerror = () => {
        console.error('Audio playback error');
        setState('idle');
        cleanup();
      };

      await audio.play();
      setState('playing');
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Speech is currently unavailable.';
      console.error('TTS error:', msg);
      toast(msg, 'error');
      setState('idle');
    }
  }, [text, cleanup, stopGlobalAudio, toast]);

  const togglePause = useCallback(() => {
    if (!audioRef.current) return;
    if (audioRef.current.paused) {
      audioRef.current.play().catch(() => {
        setState('idle');
        cleanup();
      });
      setState('playing');
    } else {
      audioRef.current.pause();
      setState('paused');
    }
  }, [cleanup]);

  const stop = useCallback(() => {
    cleanup();
    setState('idle');
  }, [cleanup]);

  if (state === 'loading') {
    return (
      <span
        className='flex items-center gap-1 px-2 py-1 text-xs text-primary-500'
        aria-label='Generating speech'
        title='Generating speech'
      >
        <Loader2 size={14} className='animate-spin' />
        <span className='hidden sm:inline'>Speaking...</span>
      </span>
    );
  }

  if (state === 'idle') {
    return (
      <button
        onClick={speak}
        className='flex items-center gap-1 px-2 py-1 text-xs text-slate-400 hover:text-primary-500 hover:bg-primary-50 rounded-md transition-colors'
        aria-label='Read aloud'
        title='Read aloud'
      >
        <Volume2 size={14} />
        <span className='hidden sm:inline'>{label}</span>
      </button>
    );
  }

  return (
    <div className='flex items-center gap-0.5' role='group' aria-label='Speech controls'>
      {state === 'playing' && (
        <span className='flex items-center gap-0.5 mr-0.5' aria-hidden='true'>
          {[0, 1, 2].map((i) => (
            <span
              key={i}
              className='w-0.5 bg-primary-400 rounded-full animate-pulse'
              style={{
                height: `${8 + i * 4}px`,
                animationDelay: `${i * 100}ms`,
              }}
            />
          ))}
        </span>
      )}
      <button
        onClick={togglePause}
        className='p-1 text-slate-400 hover:text-primary-500 hover:bg-primary-50 rounded-md transition-colors'
        aria-label={state === 'paused' ? 'Resume' : 'Pause'}
        title={state === 'paused' ? 'Resume' : 'Pause'}
      >
        {state === 'paused' ? <Play size={14} /> : <Pause size={14} />}
      </button>
      <button
        onClick={stop}
        className='p-1 text-slate-400 hover:text-danger hover:bg-red-50 rounded-md transition-colors'
        aria-label='Stop reading'
        title='Stop'
      >
        <Square size={14} />
      </button>
    </div>
  );
}
