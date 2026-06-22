import { useState, useRef, useCallback, useEffect } from 'react';
import { PhoneOff, Mic, MicOff, LoaderCircle } from 'lucide-react';
import { VoiceRecorder } from '../../voice/voiceRecorder';
import { VoicePlayer } from '../../voice/voicePlayer';
import { type VoiceCallState, STATE_LABELS, isCallActive } from '../../voice/voiceState';
import { api } from '../../api';

interface VoiceCallModalProps {
  open: boolean;
  onClose: () => void;
}

function Waveform({ active, level, color }: { active: boolean; level: number; color: string }) {
  const [heights, setHeights] = useState<number[]>([4, 4, 4, 4, 4]);
  const rafRef = useRef(0);

  useEffect(() => {
    if (!active) { setHeights([4, 4, 4, 4, 4]); return; }
    const animate = () => {
      setHeights(Array.from({ length: 5 }, (_, i) => {
        const base = 4 + (level / 100) * 28;
        const v = Math.sin(Date.now() / 150 + i * 1.2) * 6;
        return Math.max(4, Math.min(40, base + v));
      }));
      rafRef.current = requestAnimationFrame(animate);
    };
    rafRef.current = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(rafRef.current);
  }, [active, level]);

  return (
    <div className='flex items-end gap-0.5 h-10'>
      {heights.map((h, i) => (
        <span key={i} className='w-1.5 rounded-full transition-colors'
          style={{ height: `${h}px`, backgroundColor: color, opacity: 0.4 + (level / 100) * 0.6 }} />
      ))}
    </div>
  );
}

export function VoiceCallModal({ open, onClose }: VoiceCallModalProps) {
  const [state, setState] = useState<VoiceCallState>('idle');
  const [userTranscript, setUserTranscript] = useState('');
  const [assistantTranscript, setAssistantTranscript] = useState('');
  const [audioLevel, setAudioLevel] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [duration, setDuration] = useState(0);
  const [muted, setMuted] = useState(false);

  const stateRef = useRef<VoiceCallState>('idle');
  const recorderRef = useRef<VoiceRecorder | null>(null);
  const playerRef = useRef<VoicePlayer | null>(null);
  const historyRef = useRef<Array<{ role: 'user' | 'assistant'; content: string }>>([]);
  const processingRef = useRef(false);
  const durationRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const setCallState = useCallback((s: VoiceCallState) => {
    console.log(`[VoiceCall] ${stateRef.current} → ${s}`);
    stateRef.current = s;
    setState(s);
  }, []);

  const startDurationTimer = useCallback(() => {
    const start = Date.now();
    durationRef.current = setInterval(() => {
      setDuration(Math.floor((Date.now() - start) / 1000));
    }, 1000);
  }, []);

  const stopDurationTimer = useCallback(() => {
    if (durationRef.current) { clearInterval(durationRef.current); durationRef.current = null; }
  }, []);

  const cleanup = useCallback(() => {
    stopDurationTimer();
    recorderRef.current?.dispose();
    recorderRef.current = null;
    playerRef.current?.stop();
    playerRef.current = null;
    processingRef.current = false;
  }, [stopDurationTimer]);

  const speak = useCallback(async (text: string) => {
    setCallState('speaking');
    setAssistantTranscript(text);

    const cleaned = text
      .replace(/```[\s\S]*?```/g, '')
      .replace(/`[^`]+`/g, '$1')
      .trim();
    if (!cleaned) { startListening(); return; }

    try {
      const { ensureFreshToken, getToken } = await import('../../auth');
      await ensureFreshToken();
      const token = getToken();
      const BASE = import.meta.env.VITE_API_URL || '';

      const res = await fetch(`${BASE}/api/voice/tts/speak`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        body: JSON.stringify({ text: cleaned.slice(0, 5000) }),
      });

      if (!res.ok) throw new Error('TTS failed');
      const blob = await res.blob();
      if (blob.size < 100) throw new Error('Empty audio');

      const player = new VoicePlayer();
      playerRef.current = player;
      player.onEnd(() => {
        if (isCallActive(stateRef.current)) startListening();
      });
      await player.play(blob);
      playerRef.current = null;
    } catch (err) {
      console.error('[VoiceCall] TTS error:', err);
      if (isCallActive(stateRef.current)) {
        setError('Speech unavailable. Continuing in chat.');
        setTimeout(() => { if (isCallActive(stateRef.current)) startListening(); }, 2000);
      }
    }
  }, [setCallState]);

  const think = useCallback(async (text: string) => {
    if (!isCallActive(stateRef.current) || processingRef.current) return;
    processingRef.current = true;
    setCallState('thinking');

    try {
      const history = historyRef.current.slice(-12);
      const response = await api.chatStream(text, 'voice', history);
      if (!response.body) throw new Error('No stream');

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let fullText = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        if (!isCallActive(stateRef.current)) { reader.cancel(); processingRef.current = false; return; }
        const chunk = decoder.decode(value, { stream: true });
        for (const line of chunk.split('\n')) {
          if (!line.startsWith('data: ')) continue;
          try {
            const d = JSON.parse(line.slice(6));
            if (d.type === 'text') fullText += d.content;
          } catch { /* skip */ }
        }
      }

      const cleaned = fullText
        .replace(/```transaction\s*\n[\s\S]*?\n```\n?/g, '')
        .replace(/```budget\s*\n[\s\S]*?\n```\n?/g, '')
        .replace(/```[\s\S]*?```/g, '')
        .trim();

      if (cleaned) {
        historyRef.current.push({ role: 'assistant', content: cleaned });
        processingRef.current = false;
        await speak(cleaned);
      } else {
        processingRef.current = false;
        startListening();
      }
    } catch (err) {
      console.error('[VoiceCall] DeepSeek error:', err);
      processingRef.current = false;
      if (isCallActive(stateRef.current)) {
        setError('AI is unavailable. Try again.');
        setCallState('disconnected');
      }
    }
  }, [setCallState, speak]);

  const onTranscribe = useCallback(async (blob: Blob) => {
    console.log('[VoiceCall] Transcribing...');
    try {
      const result = await api.transcribe(blob);
      const text = result.transcript?.trim();
      if (text) {
        console.log('[VoiceCall] Transcript:', text);
        setUserTranscript(text);
        historyRef.current.push({ role: 'user', content: text });
        await think(text);
      } else {
        console.log('[VoiceCall] Empty transcript, restarting listen');
        startListening();
      }
    } catch (err) {
      console.error('[VoiceCall] Transcription error:', err);
      if (isCallActive(stateRef.current)) {
        setError('Speech recognition failed.');
        setCallState('disconnected');
      }
    }
  }, [think, setCallState]);

  const startListening = useCallback(() => {
    if (!isCallActive(stateRef.current)) return;
    setUserTranscript('');
    setAssistantTranscript('');
    setError(null);
    setCallState('listening');

    recorderRef.current?.dispose();
    const recorder = new VoiceRecorder({
      onAudioLevel: setAudioLevel,
      onSilenceDetected: () => {
        const blob = recorder.stop();
        recorderRef.current = null;
        if (blob) onTranscribe(blob);
        else if (isCallActive(stateRef.current)) startListening();
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
    console.log('[VoiceCall] Interrupted');
    playerRef.current?.stop();
    playerRef.current = null;
    processingRef.current = false;
    setCallState('interrupted');
    setTimeout(() => { if (stateRef.current === 'interrupted') startListening(); }, 200);
  }, [setCallState, startListening]);

  const handleStart = useCallback(async () => {
    setUserTranscript('');
    setAssistantTranscript('');
    setError(null);
    setDuration(0);
    historyRef.current = [];
    processingRef.current = false;
    setCallState('connecting');

    setTimeout(() => {
      if (stateRef.current === 'connecting') {
        startDurationTimer();
        startListening();
      }
    }, 800);
  }, [startListening, startDurationTimer, setCallState]);

  const handleEnd = useCallback(() => {
    setCallState('ending');
    cleanup();
    setCallState('idle');
    setUserTranscript('');
    setAssistantTranscript('');
    setError(null);
    onClose();
  }, [cleanup, setCallState, onClose]);

  const toggleMute = useCallback(() => { setMuted((m) => !m); }, []);

  useEffect(() => { return cleanup; }, [cleanup]);

  if (!open) return null;

  if (!isCallActive(state)) {
    return (
      <div className='fixed inset-0 z-50 flex items-center justify-center bg-black/50' onClick={onClose}>
        <div className='bg-white rounded-2xl shadow-2xl p-8 max-w-sm w-full mx-4 animate-slide-up text-center' onClick={(e) => e.stopPropagation()}>
          <div className='w-20 h-20 rounded-full bg-primary-100 mx-auto flex items-center justify-center mb-4'>
            <span className='text-3xl select-none'>&#x1F916;</span>
          </div>
          <h2 className='text-xl font-bold text-slate-800 mb-1'>Voice Call with Buddy</h2>
          <p className='text-sm text-slate-500 mb-6'>Talk naturally — Buddy listens and responds like a real conversation.</p>
          {error && <p className='text-sm text-red-500 bg-red-50 rounded-lg px-3 py-2 mb-4'>{error}</p>}
          <button onClick={handleStart} className='w-full py-3 bg-primary-500 text-white rounded-xl font-semibold hover:bg-primary-600 transition-colors'>
            Start Call
          </button>
        </div>
      </div>
    );
  }

  const waveformColor = state === 'listening' ? '#22c55e' : state === 'speaking' ? '#3b82f6' : '#6366f1';

  return (
    <div className='fixed inset-0 z-50 flex flex-col bg-slate-900 text-white' onClick={handleEnd}>
      <div className='flex items-center justify-between px-6 py-4 bg-slate-800/50'>
        <div className='flex items-center gap-2'>
          <span className='w-2 h-2 rounded-full bg-green-400 animate-pulse' />
          <span className='text-sm font-medium text-slate-300'>{STATE_LABELS[state]}</span>
        </div>
        <div className='flex items-center gap-3'>
          <span className='text-sm text-slate-400 tabular-nums min-w-[4ch]'>
            {Math.floor(duration / 60)}:{String(duration % 60).padStart(2, '0')}
          </span>
          <button onClick={toggleMute} className='p-2.5 text-slate-300 hover:text-white hover:bg-white/10 rounded-full transition-colors' aria-label='Mute'>
            {muted ? <MicOff size={18} /> : <Mic size={18} />}
          </button>
          <button onClick={handleEnd} className='p-3 bg-red-500 text-white rounded-full hover:bg-red-600 transition-colors shadow-lg' aria-label='End call'>
            <PhoneOff size={20} />
          </button>
        </div>
      </div>

      <div className='flex-1 flex flex-col items-center justify-center px-6 gap-8' onClick={(e) => e.stopPropagation()}>
        <div className={`w-24 h-24 rounded-full bg-primary-100 flex items-center justify-center transition-all duration-500 ${state === 'speaking' ? 'scale-110 shadow-lg shadow-primary-200 animate-pulse' : ''}`}>
          <span className='text-4xl select-none'>&#x1F916;</span>
        </div>

        <div className='flex items-center justify-center min-h-12'>
          {['listening', 'speaking', 'interrupted'].includes(state) && (
            <Waveform active level={audioLevel} color={waveformColor} />
          )}
          {state === 'thinking' && <LoaderCircle size={28} className='animate-spin text-primary-400' />}
          {state === 'connecting' && <LoaderCircle size={28} className='animate-spin text-amber-400' />}
        </div>

        <p className='text-xl font-semibold text-center min-h-[2rem]'>
          {state === 'listening' && "I'm listening\u2026"}
          {state === 'thinking' && 'Let me think\u2026'}
          {state === 'connecting' && 'Connecting to Buddy\u2026'}
          {state === 'interrupted' && 'Go ahead\u2026'}
        </p>

        <div className='w-full max-w-md mx-auto space-y-3 text-sm'>
          {userTranscript && (
            <div className='bg-white/5 rounded-xl p-4 text-left animate-slide-up'>
              <span className='text-xs text-slate-400 block mb-1'>You</span>
              <p className='text-slate-200 leading-relaxed'>{userTranscript}</p>
            </div>
          )}
          {assistantTranscript && (
            <div className='bg-primary-500/10 rounded-xl p-4 text-left animate-slide-up'>
              <span className='text-xs text-primary-400 block mb-1'>Buddy</span>
              <p className='text-slate-200 leading-relaxed'>{assistantTranscript}</p>
            </div>
          )}
        </div>
      </div>

      {state === 'speaking' && (
        <div className='px-6 py-4 flex justify-center' onClick={(e) => e.stopPropagation()}>
          <button onClick={interrupt} className='px-8 py-3 bg-white/10 border border-white/20 text-white rounded-full text-sm font-medium hover:bg-white/20 active:scale-95 transition-all'>
            Tap to interrupt
          </button>
        </div>
      )}

      {state === 'disconnected' && error && (
        <div className='px-6 py-6 flex flex-col items-center gap-3' onClick={(e) => e.stopPropagation()}>
          <p className='text-sm text-red-400'>{error}</p>
          <button onClick={handleStart} className='px-8 py-3 bg-primary-500 text-white rounded-full text-sm font-medium hover:bg-primary-600 transition-colors'>Reconnect</button>
        </div>
      )}
    </div>
  );
}
