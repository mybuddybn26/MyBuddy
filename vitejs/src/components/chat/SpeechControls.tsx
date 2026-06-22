import { useState, useRef, useCallback, useEffect } from 'react';
import { Volume2, Pause, Play, Square } from 'lucide-react';

interface SpeechControlsProps {
  text: string;
  label?: string;
}

type SpeechState = 'idle' | 'playing' | 'paused';

export function SpeechControls({ text, label = 'Read' }: SpeechControlsProps) {
  const [state, setState] = useState<SpeechState>('idle');
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const audioUrlRef = useRef<string | null>(null);

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
  }, []);

  useEffect(() => {
    return cleanup;
  }, [cleanup]);

  const speak = useCallback(async () => {
    try {
      const { api } = await import('../../api');
      const { ensureFreshToken, getToken } = await import('../../auth');

      await ensureFreshToken();
      const token = getToken();
      const BASE = import.meta.env.VITE_API_URL || '';

      const res = await fetch(`${BASE}/api/voice/tts`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ text: text.slice(0, 5000) }),
      });

      if (!res.ok) throw new Error('TTS failed');

      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      audioUrlRef.current = url;

      const audio = new Audio(url);
      audioRef.current = audio;

      audio.onended = () => {
        setState('idle');
        cleanup();
      };

      audio.onerror = () => {
        setState('idle');
        cleanup();
      };

      await audio.play();
      setState('playing');
    } catch {
      setState('idle');
    }
  }, [text, cleanup]);

  const togglePause = useCallback(() => {
    if (!audioRef.current) return;
    if (audioRef.current.paused) {
      audioRef.current.play();
      setState('playing');
    } else {
      audioRef.current.pause();
      setState('paused');
    }
  }, []);

  const stop = useCallback(() => {
    cleanup();
    setState('idle');
  }, [cleanup]);

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
