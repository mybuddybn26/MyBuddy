import { PhoneOff, Mic, MicOff, LoaderCircle } from 'lucide-react';
import { useVoiceConversation } from './useVoiceConversation';

interface VoiceConversationModalProps {
  open: boolean;
  onClose: () => void;
}

function WaveformBars({
  active,
  level,
  color,
}: {
  active: boolean;
  level: number;
  color: string;
}) {
  if (!active) return null;
  return (
    <div className='flex items-center gap-0.5 h-8'>
      {Array.from({ length: 5 }, (_, i) => {
        const h = 4 + (level / 100) * 28 + Math.sin(Date.now() / 200 + i) * 8;
        return (
          <span
            key={i}
            className='w-1 rounded-full transition-all duration-75'
            style={{
              height: `${Math.max(4, h)}px`,
              backgroundColor: color,
              opacity: 0.3 + (level / 100) * 0.7,
            }}
          />
        );
      })}
    </div>
  );
}

function Avatar({ state }: { state: string }) {
  const isActive = state !== 'idle' && state !== 'disconnected';
  return (
    <div className='relative'>
      <div
        className={`w-24 h-24 rounded-full bg-primary-100 flex items-center justify-center transition-all duration-500 ${
          isActive ? 'scale-110 shadow-lg shadow-primary-200' : ''
        } ${state === 'speaking' ? 'animate-pulse ring-4 ring-primary-300' : ''}`}
      >
        <span className='text-4xl'>&#x1F916;</span>
      </div>
      {state === 'listening' && (
        <div className='absolute -bottom-1 -right-1 w-7 h-7 bg-green-500 rounded-full flex items-center justify-center shadow-md'>
          <Mic size={14} className='text-white' />
        </div>
      )}
      {state === 'speaking' && (
        <div className='absolute -bottom-1 -right-1 w-7 h-7 bg-primary-500 rounded-full flex items-center justify-center shadow-md'>
          <span className='text-white text-xs font-bold'>!</span>
        </div>
      )}
    </div>
  );
}

export function VoiceConversationModal({ open, onClose }: VoiceConversationModalProps) {
  const {
    state,
    userTranscript,
    assistantTranscript,
    error,
    audioLevel,
    startCall,
    endCall,
    interrupt,
    toggleMute,
  } = useVoiceConversation({
    onTranscript: () => {},
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
      endCall();
      onClose();
    }
  };

  if (!open) return null;

  const isCallActive =
    state !== 'idle' && state !== 'disconnected' && state !== 'ending';

  const stateLabel: Record<string, string> = {
    idle: 'Ready to call',
    connecting: 'Connecting...',
    listening: 'Listening',
    thinking: 'Thinking...',
    speaking: 'Buddy is speaking',
    interrupted: 'Interrupted',
    disconnected: 'Disconnected',
    ending: 'Ending call...',
  };

  if (!isCallActive) {
    return (
      <div className='fixed inset-0 z-50 flex items-center justify-center bg-black/50'>
        <div className='bg-white rounded-2xl shadow-2xl p-8 max-w-sm w-full mx-4 animate-slide-up text-center'>
          <div className='mb-6'>
            <div className='w-20 h-20 rounded-full bg-primary-100 mx-auto flex items-center justify-center mb-4'>
              <span className='text-3xl'>&#x1F916;</span>
            </div>
            <h2 className='text-xl font-bold text-slate-800 mb-1'>Voice Call with Buddy</h2>
            <p className='text-sm text-slate-500'>
              Talk naturally — Buddy will listen and respond.
            </p>
            {error && (
              <p className='text-sm text-red-500 mt-3 bg-red-50 rounded-lg px-3 py-2'>
                {error}
              </p>
            )}
          </div>
          <button
            onClick={handleStart}
            disabled={state === 'disconnected'}
            className='w-full py-3 bg-primary-500 text-white rounded-xl font-semibold hover:bg-primary-600 transition-colors disabled:opacity-50'
          >
            Start Call
          </button>
        </div>
      </div>
    );
  }

  return (
    <div
      className='fixed inset-0 z-50 flex flex-col bg-slate-900 text-white'
      onClick={handleOverlayClick}
    >
      {/* Header */}
      <div className='flex items-center justify-between px-6 py-4 bg-slate-800/50'>
        <span className='text-sm font-medium text-slate-400'>
          {stateLabel[state] || state}
        </span>
        <div className='flex items-center gap-3'>
          <button
            onClick={toggleMute}
            className='p-2 text-slate-300 hover:text-white hover:bg-white/10 rounded-full transition-colors'
            aria-label='Toggle mute'
          >
            <MicOff size={20} />
          </button>
          <button
            onClick={handleEnd}
            className='p-2 bg-red-500 text-white rounded-full hover:bg-red-600 transition-colors'
            aria-label='End call'
          >
            <PhoneOff size={20} />
          </button>
        </div>
      </div>

      {/* Main Content */}
      <div
        className='flex-1 flex flex-col items-center justify-center px-6 gap-8'
        onClick={(e) => e.stopPropagation()}
      >
        <Avatar state={state} />

        <div className='text-center'>
          <div className='flex items-center justify-center gap-3 mb-4'>
            {state === 'listening' && (
              <WaveformBars active level={audioLevel} color='#22c55e' />
            )}
            {state === 'speaking' && (
              <WaveformBars active level={80} color='#3b82f6' />
            )}
            {state === 'thinking' && (
              <LoaderCircle size={24} className='animate-spin text-primary-400' />
            )}
          </div>

          <p className='text-2xl font-semibold mb-8 text-white'>
            {state === 'listening' && 'I\'m listening...'}
            {state === 'thinking' && 'Let me think...'}
            {state === 'speaking' && 'Buddy is speaking...'}
            {state === 'connecting' && 'Establishing connection...'}
            {state === 'interrupted' && 'Go ahead...'}
          </p>

          {/* Transcripts */}
          <div className='w-full max-w-md mx-auto space-y-4 text-sm'>
            {userTranscript && (
              <div className='bg-white/5 rounded-xl p-4 text-left'>
                <span className='text-xs text-slate-400 block mb-1'>You</span>
                <p className='text-slate-200'>{userTranscript}</p>
              </div>
            )}
            {assistantTranscript && (
              <div className='bg-primary-500/10 rounded-xl p-4 text-left'>
                <span className='text-xs text-primary-400 block mb-1'>Buddy</span>
                <p className='text-slate-200'>{assistantTranscript}</p>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Interrupt button */}
      {state === 'speaking' && (
        <div className='px-6 py-4 flex justify-center' onClick={(e) => e.stopPropagation()}>
          <button
            onClick={interrupt}
            className='px-6 py-3 bg-white/10 border border-white/20 text-white rounded-full text-sm font-medium hover:bg-white/20 transition-colors'
          >
            Tap to interrupt
          </button>
        </div>
      )}

      {(state as string) === 'disconnected' && error && (
        <div className='px-6 py-4 flex justify-center' onClick={(e) => e.stopPropagation()}>
          <div className='text-center'>
            <p className='text-sm text-red-400 mb-3'>{error}</p>
            <button
              onClick={handleStart}
              className='px-6 py-2 bg-primary-500 text-white rounded-full text-sm font-medium hover:bg-primary-600 transition-colors'
            >
              Reconnect
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
