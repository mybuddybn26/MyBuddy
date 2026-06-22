import { useState, useRef, useCallback, useEffect } from 'react';
import { api } from '../../api';

export type VoiceState =
  | 'idle'
  | 'connecting'
  | 'listening'
  | 'thinking'
  | 'speaking'
  | 'interrupted'
  | 'disconnected'
  | 'ending';

export interface VoiceConversationOptions {
  silenceTimeout?: number;
  onTranscript?: (text: string, role: 'user' | 'assistant') => void;
  onStateChange?: (state: VoiceState) => void;
}

const DEFAULT_SILENCE_TIMEOUT = 1500;

function isActive(s: VoiceState): boolean {
  return s !== 'ending' && s !== 'disconnected';
}

function isAlive(s: VoiceState): boolean {
  return s !== 'ending' && s !== 'disconnected' && s !== 'idle';
}

export function useVoiceConversation(options: VoiceConversationOptions = {}) {
  const { silenceTimeout = DEFAULT_SILENCE_TIMEOUT, onTranscript, onStateChange } = options;

  const [state, setState] = useState<VoiceState>('idle');
  const [userTranscript, setUserTranscript] = useState('');
  const [assistantTranscript, setAssistantTranscript] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [audioLevel, setAudioLevel] = useState(0);

  const stateRef = useRef<VoiceState>('idle');
  const streamRef = useRef<MediaStream | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const silenceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const currentAudioRef = useRef<HTMLAudioElement | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const shouldListenRef = useRef(false);
  const conversationHistoryRef = useRef<Array<{ role: 'user' | 'assistant'; content: string }>>([]);
  const abortControllerRef = useRef<AbortController | null>(null);

  const setVoiceState = useCallback(
    (s: VoiceState) => {
      stateRef.current = s;
      setState(s);
      onStateChange?.(s);
    },
    [onStateChange],
  );

  const clearSilenceTimer = useCallback(() => {
    if (silenceTimerRef.current) {
      clearTimeout(silenceTimerRef.current);
      silenceTimerRef.current = null;
    }
  }, []);

  const stopAudio = useCallback(() => {
    if (currentAudioRef.current) {
      currentAudioRef.current.pause();
      currentAudioRef.current.onended = null;
      currentAudioRef.current.onerror = null;
      currentAudioRef.current.src = '';
      currentAudioRef.current = null;
    }
  }, []);

  const stopRecording = useCallback(() => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'recording') {
      mediaRecorderRef.current.stop();
    }
    mediaRecorderRef.current = null;
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
    if (audioContextRef.current) {
      audioContextRef.current.close().catch(() => {});
      audioContextRef.current = null;
    }
    analyserRef.current = null;
  }, []);

  const cleanup = useCallback(() => {
    clearSilenceTimer();
    stopAudio();
    stopRecording();
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
  }, [clearSilenceTimer, stopAudio, stopRecording]);

  const getAudioLevel = useCallback((analyser: AnalyserNode): number => {
    const dataArray = new Uint8Array(analyser.frequencyBinCount);
    analyser.getByteFrequencyData(dataArray);
    const avg = dataArray.reduce((s, v) => s + v, 0) / dataArray.length;
    return Math.min(100, Math.max(0, avg * 2));
  }, []);

  const startListening = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      });
      streamRef.current = stream;

      const audioCtx = new AudioContext();
      const analyser = audioCtx.createAnalyser();
      analyser.fftSize = 256;
      const source = audioCtx.createMediaStreamSource(stream);
      source.connect(analyser);
      audioContextRef.current = audioCtx;
      analyserRef.current = analyser;

      const recorder = new MediaRecorder(stream, { mimeType: 'audio/webm' });
      chunksRef.current = [];

      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };

      recorder.onstop = async () => {
        if (!shouldListenRef.current || !isActive(stateRef.current)) return;

        const allChunks = [...chunksRef.current];
        if (allChunks.length === 0) return;

        const audioBlob = new Blob(allChunks, { type: 'audio/webm' });

        if (audioBlob.size < 500) {
          startRecognizing();
          return;
        }

        try {
          const result = await api.transcribe(audioBlob);
          const transcript = result.transcript?.trim();
          if (transcript) {
            setUserTranscript(transcript);
            onTranscript?.(transcript, 'user');
            conversationHistoryRef.current.push({ role: 'user', content: transcript });
            await handleUserMessage(transcript);
          } else {
            startRecognizing();
          }
        } catch {
          setError('Transcription failed. Check your connection.');
          setVoiceState('disconnected');
        }
      };

      recorder.start(250);
      mediaRecorderRef.current = recorder;
      shouldListenRef.current = true;

      const checkSilence = () => {
        if (!shouldListenRef.current || !analyserRef.current) return;
        if (stateRef.current !== 'listening') return;

        const level = getAudioLevel(analyserRef.current);
        setAudioLevel(level);

        if (level > 15) {
          clearSilenceTimer();
        } else if (!silenceTimerRef.current) {
          silenceTimerRef.current = setTimeout(() => {
            if (mediaRecorderRef.current?.state === 'recording') {
              shouldListenRef.current = false;
              mediaRecorderRef.current.stop();
            }
          }, silenceTimeout);
        }

        requestAnimationFrame(checkSilence);
      };

      checkSilence();
      setVoiceState('listening');
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Microphone access denied';
      setError(msg);
      setVoiceState('disconnected');
    }
  }, [silenceTimeout, getAudioLevel, clearSilenceTimer, setVoiceState, onTranscript]);

  const startRecognizing = useCallback(() => {
    if (!isActive(stateRef.current)) return;
    shouldListenRef.current = true;
    chunksRef.current = [];
    const recorder = new MediaRecorder(streamRef.current!, { mimeType: 'audio/webm' });

    recorder.ondataavailable = (e) => {
      if (e.data.size > 0) chunksRef.current.push(e.data);
    };

    recorder.onstop = async () => {
      if (!shouldListenRef.current || !isActive(stateRef.current)) return;
      const allChunks = [...chunksRef.current];
      if (allChunks.length === 0) return;
      const audioBlob = new Blob(allChunks, { type: 'audio/webm' });
      if (audioBlob.size < 500) {
        startRecognizing();
        return;
      }
      try {
        const result = await api.transcribe(audioBlob);
        const transcript = result.transcript?.trim();
        if (transcript) {
          setUserTranscript(transcript);
          onTranscript?.(transcript, 'user');
          conversationHistoryRef.current.push({ role: 'user', content: transcript });
          await handleUserMessage(transcript);
        } else {
          startRecognizing();
        }
      } catch {
        setError('Transcription failed.');
        setVoiceState('disconnected');
      }
    };

    recorder.start(250);
    mediaRecorderRef.current = recorder;
    setVoiceState('listening');
  }, [setVoiceState, onTranscript]);

  const speakResponse = useCallback(async (text: string) => {
    if (!isActive(stateRef.current)) return;

    setVoiceState('speaking');
    setAssistantTranscript(text);
    onTranscript?.(text, 'assistant');

    try {
      const { ensureFreshToken, getToken } = await import('../../auth');
      await ensureFreshToken();
      const token = getToken();
      const BASE = import.meta.env.VITE_API_URL || '';

      const controller = new AbortController();
      abortControllerRef.current = controller;

      const res = await fetch(`${BASE}/api/voice/tts/speak`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ text: text.slice(0, 5000) }),
        signal: controller.signal,
      });
      abortControllerRef.current = null;

      if (!res.ok) throw new Error('TTS failed');

      const blob = await res.blob();
      const url = URL.createObjectURL(blob);

      const audio = new Audio(url);
      currentAudioRef.current = audio;

      await new Promise<void>((resolve, reject) => {
        audio.onended = () => {
          URL.revokeObjectURL(url);
          resolve();
        };
        audio.onerror = () => {
          URL.revokeObjectURL(url);
          reject(new Error('Audio playback failed'));
        };
        audio.play().catch(reject);
      });

      currentAudioRef.current = null;

      if (isActive(stateRef.current)) {
        setUserTranscript('');
        setAssistantTranscript('');
        startRecognizing();
      }
    } catch {
      if (isActive(stateRef.current)) {
        setError('Speech generation failed.');
        setVoiceState('disconnected');
      }
    }
  }, [setVoiceState, onTranscript, startRecognizing]);

  const handleUserMessage = useCallback(async (message: string) => {
    if (!isActive(stateRef.current)) return;

    setVoiceState('thinking');

    try {
      const history = conversationHistoryRef.current.slice(-12);
      const response = await api.chatStream(message, 'voice', history);

      if (!response.body) throw new Error('No stream');

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let fullText = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        if (!isActive(stateRef.current)) {
          reader.cancel();
          return;
        }

        const chunk = decoder.decode(value, { stream: true });
        const lines = chunk.split('\n');

        for (const line of lines) {
          if (!line.startsWith('data: ')) continue;
          try {
            const data = JSON.parse(line.slice(6));
            if (data.type === 'text') {
              fullText += data.content;
            }
          } catch {
            /* skip malformed */
          }
        }
      }

      const cleaned = fullText
        .replace(/```transaction\s*\n[\s\S]*?\n```\n?/g, '')
        .replace(/```budget\s*\n[\s\S]*?\n```\n?/g, '')
        .replace(/```[\s\S]*?```/g, '')
        .trim();

      if (cleaned) {
        conversationHistoryRef.current.push({ role: 'assistant', content: cleaned });
        await speakResponse(cleaned);
      } else {
        startRecognizing();
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'AI response failed';
      setError(msg);
      setVoiceState('disconnected');
    }
  }, [setVoiceState, speakResponse, startRecognizing]);

  const interrupt = useCallback(() => {
    if (stateRef.current !== 'speaking') return;

    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }

    stopAudio();
    setVoiceState('interrupted');

    setTimeout(() => {
      if (stateRef.current === "interrupted") {
        setUserTranscript('');
        setAssistantTranscript('');
        startRecognizing();
      }
    }, 100);
  }, [stopAudio, setVoiceState, startRecognizing]);

  const startCall = useCallback(async () => {
    setError(null);
    setUserTranscript('');
    setAssistantTranscript('');
    conversationHistoryRef.current = [];
    setVoiceState('connecting');

    try {
      await startListening();
    } catch {
      setError('Could not start voice session.');
      setVoiceState('disconnected');
    }
  }, [startListening, setVoiceState]);

  const endCall = useCallback(() => {
    setVoiceState('ending');
    shouldListenRef.current = false;
    cleanup();
    setVoiceState('idle');
    setUserTranscript('');
    setAssistantTranscript('');
    setError(null);
    setAudioLevel(0);
  }, [cleanup, setVoiceState]);

  const toggleMute = useCallback(() => {
    if (streamRef.current) {
      const tracks = streamRef.current.getAudioTracks();
      tracks.forEach((t) => (t.enabled = !t.enabled));
    }
  }, []);

  useEffect(() => {
    return () => {
      cleanup();
    };
  }, [cleanup]);

  return {
    state,
    userTranscript,
    assistantTranscript,
    error,
    audioLevel,
    startCall,
    endCall,
    interrupt,
    toggleMute,
  };
}
