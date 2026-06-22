import { useState, useRef, useCallback, useEffect } from 'react';
import { PhoneOff, LoaderCircle, X } from 'lucide-react';
import { VoiceRecorder } from '../../voice/voiceRecorder';
import { VoicePlayer } from '../../voice/voicePlayer';
import { type VoiceCallState, STATE_LABELS, isCallActive } from '../../voice/voiceState';
import { api } from '../../api';

interface VoiceCallPanelProps {
  open: boolean;
  onClose: () => void;
  onBubble?: (phase: string, role: 'user' | 'assistant', content: string) => void;
}

const FALSE_POSITIVES = new Set([
  'thank you', 'thanks', 'bye', 'you', 'okay', 'ok', 'yes', 'no',
  'hmm', 'uh', 'um', 'oh', 'ah', 'hi', 'hello', 'hey',
]);

function shouldIgnoreTranscript(text: string): string | null {
  const trimmed = text.trim();
  if (!trimmed) return 'empty';
  if (trimmed.length < 3) return 'too short';
  const words = trimmed.split(/\s+/).filter((w) => w.length > 1);
  if (words.length < 2) return 'too few meaningful words';
  const lower = trimmed.toLowerCase().replace(/[.!?,]$/, '').trim();
  if (FALSE_POSITIVES.has(lower)) return `false positive: "${lower}"`;
  return null;
}

function Waveform({ active, level, color }: { active: boolean; level: number; color: string }) {
  const [heights, setHeights] = useState<number[]>([4, 4, 4, 4, 4]);
  const rafRef = useRef(0);
  useEffect(() => {
    if (!active) { setHeights([4, 4, 4, 4, 4]); return; }
    const animate = () => {
      setHeights(Array.from({ length: 5 }, (_, i) => {
        const base = 4 + (level / 100) * 20;
        const v = Math.sin(Date.now() / 150 + i * 1.2) * 4;
        return Math.max(3, Math.min(30, base + v));
      }));
      rafRef.current = requestAnimationFrame(animate);
    };
    rafRef.current = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(rafRef.current);
  }, [active, level]);
  return (
    <div className='flex items-end gap-0.5 h-6'>
      {heights.map((h, i) => (
        <span key={i} className='w-1 rounded-full' style={{ height: `${h}px`, backgroundColor: color, opacity: 0.4 + (level / 100) * 0.6 }} />
      ))}
    </div>
  );
}

export function VoiceCallPanel({ open, onClose, onBubble }: VoiceCallPanelProps) {
  const [state, setState] = useState<VoiceCallState>('idle');
  const [userTranscript, setUserTranscript] = useState('');
  const [assistantTranscript, setAssistantTranscript] = useState('');
  const [audioLevel, setAudioLevel] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const stateRef = useRef<VoiceCallState>('idle');
  const recorderRef = useRef<VoiceRecorder | null>(null);
  const playerRef = useRef<VoicePlayer | null>(null);
  const historyRef = useRef<Array<{ role: 'user' | 'assistant'; content: string }>>([]);
  const processingRef = useRef(false);
  const isSpeakingRef = useRef(false);

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

  const speak = useCallback(async (text: string) => {
    setCallState('speaking');
    setAssistantTranscript(text);
    const cleaned = text.replace(/```[\s\S]*?```/g, '').replace(/`[^`]+`/g, '$1').trim();
    if (!cleaned) { startListening(); return; }
    isSpeakingRef.current = true;
    try {
      const { ensureFreshToken, getToken } = await import('../../auth');
      await ensureFreshToken();
      const token = getToken();
      const BASE = import.meta.env.VITE_API_URL || '';
      const t0 = performance.now();
      const res = await fetch(`${BASE}/api/voice/tts/speak`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        body: JSON.stringify({ text: cleaned.slice(0, 5000) }),
      });
      if (!res.ok) throw new Error('TTS failed');
      const blob = await res.blob();
      if (blob.size < 100) throw new Error('Empty audio');
      console.log(`[VoiceLatency] TTS: ${Math.round(performance.now() - t0)}ms`);
      const player = new VoicePlayer();
      playerRef.current = player;
      player.onEnd(() => { isSpeakingRef.current = false; if (isCallActive(stateRef.current)) startListening(); });
      await player.play(blob);
      playerRef.current = null;
      isSpeakingRef.current = false;
    } catch (err) {
      console.error('[VoiceCall] TTS error:', err);
      isSpeakingRef.current = false;
      if (isCallActive(stateRef.current)) { setError('Speech unavailable'); setTimeout(() => { if (isCallActive(stateRef.current)) startListening(); }, 2000); }
    }
  }, [setCallState]);

  const think = useCallback(async (text: string) => {
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
        if (!isCallActive(stateRef.current)) { reader.cancel(); processingRef.current = false; return; }
        const chunk = decoder.decode(value, { stream: true });
        for (const line of chunk.split('\n')) {
          if (!line.startsWith('data: ')) continue;
          try { const d = JSON.parse(line.slice(6)); if (d.type === 'text') fullText += d.content; } catch { /* skip */ }
        }
      }
      const cleaned = fullText.replace(/```[\s\S]*?```/g, '').trim();
      const aiTime = Math.round(performance.now() - t0);
      console.log(`[VoiceLatency] AI: ${aiTime}ms`);
      if (cleaned) {
        historyRef.current.push({ role: 'assistant', content: cleaned });
        onBubble?.('responding', 'assistant', cleaned);
        processingRef.current = false;
        const t1 = performance.now();
        await speak(cleaned);
        console.log(`[VoiceLatency] Total: ${Math.round(performance.now() - t1 + aiTime)}ms`);
      } else { processingRef.current = false; startListening(); }
    } catch (err) {
      console.error('[VoiceCall] AI error:', err);
      processingRef.current = false;
      if (isCallActive(stateRef.current)) { setError('AI unavailable'); setCallState('disconnected'); }
    }
  }, [setCallState, speak, onBubble]);

  const onTranscribe = useCallback(async (blob: Blob, recorder: VoiceRecorder) => {
    try {
      if (isSpeakingRef.current) { console.log('[VoiceCall] Ignoring: Buddy is speaking'); startListening(); return; }
      if (!recorder.hadRealSpeech) { console.log('[VoiceCall] Ignoring: no real speech'); onBubble?.('ignored', 'user', ''); startListening(); return; }
      if (!recorder.minDurationMet) { console.log('[VoiceCall] Ignoring: too short'); onBubble?.('ignored', 'user', ''); startListening(); return; }

      const t0 = performance.now();
      onBubble?.('transcribing', 'user', '');
      const result = await api.transcribe(blob);
      const sttTime = Math.round(performance.now() - t0);
      console.log(`[VoiceLatency] STT: ${sttTime}ms`);
      const text = result.transcript?.trim();

      if (!text) { onBubble?.('ignored', 'user', ''); startListening(); return; }
      const ignoreReason = shouldIgnoreTranscript(text);
      if (ignoreReason) { console.log(`[VoiceCall] Ignoring: ${ignoreReason} — "${text}"`); onBubble?.('ignored', 'user', ''); startListening(); return; }

      console.log('[VoiceCall] Accepted:', text);
      setUserTranscript(text);
      historyRef.current.push({ role: 'user', content: text });
      onBubble?.('accepted', 'user', text);
      onBubble?.('thinking', 'assistant', '');
      await think(text);
    } catch (err) {
      console.error('[VoiceCall] STT error:', err);
      if (isCallActive(stateRef.current)) { setError('Speech recognition failed'); setCallState('disconnected'); }
    }
  }, [think, setCallState, onBubble]);

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
        if (blob) onTranscribe(blob, recorder);
        else if (isCallActive(stateRef.current)) startListening();
      },
      onError: (msg) => { setError(msg); setCallState('disconnected'); },
    }, 1800);
    recorderRef.current = recorder;
    recorder.start();
    onBubble?.('listening', 'user', '');
  }, [onTranscribe, setCallState, onBubble]);

  const interrupt = useCallback(() => {
    if (stateRef.current !== 'speaking') return;
    playerRef.current?.stop();
    playerRef.current = null;
    processingRef.current = false;
    isSpeakingRef.current = false;
    setCallState('interrupted');
    setTimeout(() => { if (stateRef.current === 'interrupted') startListening(); }, 200);
  }, [setCallState, startListening]);

  const handleStart = useCallback(() => {
    setError(null);
    setUserTranscript(''); setAssistantTranscript('');
    historyRef.current = [];
    processingRef.current = false;
    isSpeakingRef.current = false;
    setCallState('connecting');
    setTimeout(() => { if (stateRef.current === 'connecting') startListening(); }, 500);
  }, [startListening, setCallState]);

  const handleEnd = useCallback(() => {
    setCallState('ending');
    cleanup();
    setCallState('idle');
    setUserTranscript(''); setAssistantTranscript('');
    setError(null);
    onClose();
  }, [cleanup, setCallState, onClose]);

  useEffect(() => { return cleanup; }, [cleanup]);

  if (!open) return null;

  if (!isCallActive(state)) {
    return (
      <div className='border-t border-slate-200 bg-white p-4 animate-fade-in'>
        <div className='flex items-center justify-between mb-3'>
          <div className='flex items-center gap-2'><span className='text-lg'>&#x1F916;</span><span className='text-sm font-semibold text-slate-700'>Voice Call</span></div>
          <button onClick={onClose} className='p-1 text-slate-400 hover:text-slate-600 rounded-md' aria-label='Close'><X size={18} /></button>
        </div>
        <p className='text-xs text-slate-500 mb-3'>Talk naturally — Buddy listens and responds.</p>
        {error && <p className='text-xs text-red-500 bg-red-50 rounded-lg px-2 py-1 mb-3'>{error}</p>}
        <button onClick={handleStart} className='w-full py-2 bg-primary-500 text-white rounded-xl text-sm font-semibold hover:bg-primary-600 transition-colors'>Start Call</button>
      </div>
    );
  }

  const color = state === 'listening' ? '#22c55e' : state === 'speaking' ? '#3b82f6' : '#6366f1';

  return (
    <div className='border-t-2 border-primary-200 bg-white animate-fade-in'>
      <div className='flex items-center justify-between px-4 py-2 bg-primary-50/50'>
        <div className='flex items-center gap-2'><span className='w-2 h-2 rounded-full bg-green-400 animate-pulse' /><span className='text-xs font-medium text-primary-700'>{STATE_LABELS[state]}</span></div>
        <div className='flex items-center gap-2'>
          <button onClick={interrupt} className='text-xs text-primary-500 hover:text-primary-700 font-medium'>Interrupt</button>
          <button onClick={handleEnd} className='p-1.5 bg-red-500 text-white rounded-full hover:bg-red-600 transition-colors' aria-label='End call'><PhoneOff size={14} /></button>
        </div>
      </div>
      <div className='px-4 py-3'>
        <div className='flex items-center gap-3 mb-2'>
          <Waveform active level={audioLevel} color={color} />
          {state === 'thinking' && <LoaderCircle size={16} className='animate-spin text-primary-400' />}
          <span className='text-xs text-slate-500'>{state === 'listening' && "I'm listening\u2026"}{state === 'thinking' && 'Thinking\u2026'}{state === 'connecting' && 'Connecting\u2026'}{state === 'interrupted' && 'Go ahead\u2026'}</span>
        </div>
        <div className='space-y-1.5 max-h-32 overflow-y-auto text-xs'>
          {userTranscript && <div className='text-slate-600 leading-relaxed'><span className='text-slate-400'>You: </span>{userTranscript}</div>}
          {assistantTranscript && <div className='text-primary-600 leading-relaxed'><span className='text-primary-400'>Buddy: </span>{assistantTranscript}</div>}
        </div>
        {state === 'disconnected' && error && (
          <div className='mt-2 flex items-center gap-2'><p className='text-xs text-red-500'>{error}</p><button onClick={handleStart} className='text-xs text-primary-500 hover:text-primary-700 font-medium'>Retry</button></div>
        )}
      </div>
    </div>
  );
}
