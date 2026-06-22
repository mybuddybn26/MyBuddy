import { useState, useEffect, useRef } from 'react';
import { Phone, PhoneOff, Mic, MicOff, LoaderCircle } from 'lucide-react';
import { useVoiceConversation } from './useVoiceConversation';

interface VoiceConversationModalProps {
  open: boolean;
  onClose: () => void;
}

function AnimatedWaveform({ active, level, color }: { active: boolean; level: number; color: string }) {
  const [bars, setBars] = useState<number[]>([4, 4, 4, 4, 4]);
  const rafRef = useRef<number>(0);

  useEffect(() => {
    if (!active) {
      setBars([4, 4, 4, 4, 4]);
      return;
    }

    const animate = () => {
      setBars(
        Array.from({ length: 5 }, (_, i) => {
          const base = 4 + (level / 100) * 28;
          const variation = Math.sin(Date.now() / 150 + i * 1.2) * 6;
          return Math.max(4, Math.min(40, base + variation));
        }),
      );
      rafRef.current = requestAnimationFrame(animate);
    };

    rafRef.current = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(rafRef.current);
  }, [active, level]);

  return (
    <div className='flex items-center gap-0.5 h-10'>
      {bars.map((h, i) => (
        <span
          key={i}
          className='w-1.5 rounded-full transition-colors'
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

function Avatar({ state, level }: { state: string; level: number }) {
  const scale = state === 'speaking' ? 1.1 + level / 300 : state !== 'idle' && state !== 'disconnected' ? 1.05 : 1;
  const pulse = state === 'speaking' ? 'animate-pulse' : '';

  return (
    <div className='relative'>
      <div
        className={`w-24 h-24 rounded-full bg-primary-100 flex items-center justify-center transition-all duration-300 ${pulse}`}
        style={{ transform: `scale(${scale})` }}
      >
        <span className='text-4xl select-none'>&#x1F916;</span>
      </div>
      {state === 'listening' && (
        <div className='absolute -bottom-1 -right-1 w-7 h-7 bg-green-500 rounded-full flex items-center justify-center shadow-md animate-pulse'>
          <Mic size={14} className='text-white' />
        </div>
      )}
      {state === 'speaking' && (
        <div className='absolute -bottom-1 -right-1 w-7 h-7 bg-primary-500 rounded-full flex items-center justify-center shadow-md'>
          <span className='text-white text-xs font-bold'>&#9654;</span>
        </div>
      )}
    </div>
  );
}

export function VoiceConversationModal({ open, onClose }: VoiceConversationModalProps) {
  const [audioLevel, setAudioLevel] = useState(0);

  const {
    state,
    userTranscript,
    assistantTranscript,
    error,
    startCall,
    endCall,
    interrupt,
    toggleMute,
  } = useVoiceConversation({
    onTranscript: () => {},
    onAudioLevel: setAudioLevel,
  });

  const handleStart = () => {
    startCall();
  };

  const handleEnd = () => {
    endCall();
    onClose();
  };

  const handleOverlayClick = () => {
    if (state === 'idle') {
      onClose();
    }
  };

  if (!open) return null;

  const isCallActive = state !== 'idle' && state !== 'ending';

  const stateLabel: Record<string, string> = {
    idle: 'Ready',
    connecting: 'Connecting...',
    listening: 'Listening',
    thinking: 'Thinking...',
    speaking: 'Speaking',
    interrupted: 'Interrupted',
    disconnected: 'Disconnected',
    ending: 'Ending...',
  };

  const stateColor: Record<string, string> = {
    listening: '#22c55e',
    speaking: '#3b82f6',
    thinking: '#8b5cf6',
    connecting: '#f59e0b',
  };

  if (!isCallActive) {
    return (
      <div className='fixed inset-0 z-50 flex items-center justify-center bg-black/50' onClick={handleOverlayClick}>
        <div className='bg-white rounded-2xl shadow-2xl p-8 max-w-sm w-full mx-4 animate-slide-up text-center' onClick={(e) => e.stopPropagation()}>
          <div className='mb-6'>
            <div className='w-20 h-20 rounded-full bg-primary-100 mx-auto flex items-center justify-center mb-4'>
              <span className='text-3xl select-none'>&#x1F916;</span>
            </div>
            <h2 className='text-xl font-bold text-slate-800 mb-1'>
              <Phone size={18} className='inline mr-1.5 -mt-0.5' />
              Voice Call
            </h2>
            <p className='text-sm text-slate-500'>Talk naturally — Buddy listens and responds.</p>
            {error && (
              <p className='text-sm text-red-500 mt-3 bg-red-50 rounded-lg px-3 py-2'>{error}</p>
            )}
          </div>
          <button
            onClick={handleStart}
            className='w-full py-3 bg-primary-500 text-white rounded-xl font-semibold hover:bg-primary-600 transition-colors'
          >
            Start Call
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className='fixed inset-0 z-50 flex flex-col bg-slate-900 text-white' onClick={handleOverlayClick}>
      <div className='flex items-center justify-between px-6 py-4 bg-slate-800/50'>
        <div className='flex items-center gap-2'>
          <span className='w-2 h-2 rounded-full bg-green-400 animate-pulse' />
          <span className='text-sm font-medium text-slate-300'>{stateLabel[state] || state}</span>
        </div>
        <div className='flex items-center gap-3'>
          <button
            onClick={toggleMute}
            className='p-2.5 text-slate-300 hover:text-white hover:bg-white/10 rounded-full transition-colors'
            aria-label='Toggle mute'
          >
            <MicOff size={18} />
          </button>
          <button
            onClick={handleEnd}
            className='p-3 bg-red-500 text-white rounded-full hover:bg-red-600 transition-colors shadow-lg'
            aria-label='End call'
          >
            <PhoneOff size={20} />
          </button>
        </div>
      </div>

      <div className='flex-1 flex flex-col items-center justify-center px-6 gap-6' onClick={(e) => e.stopPropagation()}>
        <Avatar state={state} level={audioLevel} />

        <div className='flex items-center justify-center gap-3 min-h-12'>
          {state === 'listening' && (
            <AnimatedWaveform active level={audioLevel} color={stateColor[state]} />
          )}
          {state === 'speaking' && (
            <AnimatedWaveform active level={audioLevel} color={stateColor[state]} />
          )}
          {state === 'thinking' && (
            <LoaderCircle size={28} className='animate-spin text-primary-400' />
          )}
          {state === 'connecting' && (
            <LoaderCircle size={28} className='animate-spin text-amber-400' />
          )}
        </div>

        <p className='text-xl font-semibold text-white text-center min-h-[2rem]'>
          {state === 'listening' && "I'm listening\u2026"}
          {state === 'thinking' && 'Let me think\u2026'}
          {state === 'speaking' && ''}
          {state === 'connecting' && 'Establishing connection\u2026'}
          {state === 'interrupted' && 'Go ahead\u2026'}
          {state === 'disconnected' && 'Call ended'}
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
          <button
            onClick={interrupt}
            className='px-8 py-3 bg-white/10 border border-white/20 text-white rounded-full text-sm font-medium hover:bg-white/20 active:scale-95 transition-all'
          >
            Tap to interrupt
          </button>
        </div>
      )}

      {state === 'disconnected' && error && (
        <div className='px-6 py-6 flex justify-center' onClick={(e) => e.stopPropagation()}>
          <div className='text-center'>
            <p className='text-sm text-red-400 mb-4'>{error}</p>
            <button
              onClick={handleStart}
              className='px-8 py-3 bg-primary-500 text-white rounded-full text-sm font-medium hover:bg-primary-600 transition-colors'
            >
              Reconnect
            </button>
            <button
              onClick={handleEnd}
              className='block mx-auto mt-3 text-sm text-slate-400 hover:text-white transition-colors'
            >
              End call
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
