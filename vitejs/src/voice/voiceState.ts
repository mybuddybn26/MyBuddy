export type VoiceCallState =
  | 'idle'
  | 'connecting'
  | 'listening'
  | 'thinking'
  | 'speaking'
  | 'interrupted'
  | 'disconnected'
  | 'ending';

export interface VoiceCallContext {
  userTranscript: string;
  assistantTranscript: string;
  audioLevel: number;
  duration: number;
  error: string | null;
}

export const STATE_LABELS: Record<VoiceCallState, string> = {
  idle: '',
  connecting: 'Connecting...',
  listening: 'Listening',
  thinking: 'Thinking...',
  speaking: 'Speaking',
  interrupted: 'Interrupted',
  disconnected: 'Disconnected',
  ending: 'Ending...',
};

export function isCallActive(s: VoiceCallState): boolean {
  return s !== 'idle' && s !== 'ending';
}
