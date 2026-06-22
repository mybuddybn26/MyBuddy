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
  onAudioLevel?: (level: number) => void;
}

const DEFAULT_SILENCE_TIMEOUT = 1500;

function isActive(s: VoiceState): boolean {
  return s !== 'ending' && s !== 'disconnected';
}

export function useVoiceConversation(options: VoiceConversationOptions = {}) {
  const {
    silenceTimeout = DEFAULT_SILENCE_TIMEOUT,
    onTranscript,
    onStateChange,
    onAudioLevel,
  } = options;

  const [state, setState] = useState<VoiceState>('idle');
  const [userTranscript, setUserTranscript] = useState('');
  const [assistantTranscript, setAssistantTranscript] = useState('');
  const [error, setError] = useState<string | null>(null);

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
  const rafRef = useRef<number>(0);
  const processingRef = useRef(false);

  const log = useCallback((msg: string) => {
    console.log(`[Voice] ${msg}`);
  }, []);

  const setVoiceState = useCallback(
    (s: VoiceState) => {
      console.log(`[Voice] State: ${stateRef.current} → ${s}`);
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
      log('Audio playback stopped');
    }
  }, [log]);

  const stopRecording = useCallback(() => {
    shouldListenRef.current = false;
    clearSilenceTimer();
    if (rafRef.current) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = 0;
    }
    if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'recording') {
      mediaRecorderRef.current.stop();
      log('MediaRecorder stopped');
    }
    mediaRecorderRef.current = null;
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
      log('Microphone stream closed');
    }
    if (audioContextRef.current && audioContextRef.current.state !== 'closed') {
      audioContextRef.current.close().catch(() => {});
      audioContextRef.current = null;
      analyserRef.current = null;
    }
    onAudioLevel?.(0);
  }, [clearSilenceTimer, log, onAudioLevel]);

  const cleanup = useCallback(() => {
    stopAudio();
    stopRecording();
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
    processingRef.current = false;
  }, [stopAudio, stopRecording]);

  const startSilenceMonitor = useCallback(() => {
    const check = () => {
      if (!shouldListenRef.current || !analyserRef.current) return;
      if (stateRef.current !== 'listening') return;

      const dataArray = new Uint8Array(analyserRef.current.frequencyBinCount);
      analyserRef.current.getByteFrequencyData(dataArray);
      const avg = dataArray.reduce((s, v) => s + v, 0) / dataArray.length;
      const level = Math.min(100, Math.max(0, avg));
      onAudioLevel?.(level);

      if (level > 10) {
        clearSilenceTimer();
      } else if (!silenceTimerRef.current) {
        silenceTimerRef.current = setTimeout(() => {
          log(`Silence detected (level: ${level.toFixed(1)})`);
          if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'recording') {
            shouldListenRef.current = false;
            mediaRecorderRef.current.stop();
            log('Stopping recorder due to silence');
          }
        }, silenceTimeout);
      }

      rafRef.current = requestAnimationFrame(check);
    };
    rafRef.current = requestAnimationFrame(check);
  }, [silenceTimeout, clearSilenceTimer, log, onAudioLevel]);

  const transcribeAudio = useCallback(async (blob: Blob): Promise<string | null> => {
    log(`Transcribing audio: ${blob.size} bytes`);
    try {
      const result = await api.transcribe(blob);
      const text = result.transcript?.trim();
      if (text) {
        log(`Transcript: "${text}"`);
        return text;
      }
      log('Empty transcript returned');
      return null;
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Transcription failed';
      log(`Transcription error: ${msg}`);
      setError('Transcription failed. Check your network connection.');
      setVoiceState('disconnected');
      return null;
    }
  }, [log, setVoiceState]);

  const speakResponse = useCallback(async (text: string) => {
    if (!isActive(stateRef.current)) return;
    setVoiceState('speaking');
    setAssistantTranscript(text);
    onTranscript?.(text, 'assistant');
    log(`Speaking response: ${text.slice(0, 100)}...`);

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

      if (!res.ok) {
        const err = await res.json().catch(() => ({ detail: 'TTS failed' }));
        throw new Error((err as { detail?: string }).detail || 'TTS failed');
      }

      const blob = await res.blob();
      log(`TTS audio received: ${blob.size} bytes`);
      const url = URL.createObjectURL(blob);

      const audio = new Audio(url);
      currentAudioRef.current = audio;

      await new Promise<void>((resolve, reject) => {
        audio.onended = () => {
          log('Playback complete');
          URL.revokeObjectURL(url);
          resolve();
        };
        audio.onerror = () => {
          log('Playback error');
          URL.revokeObjectURL(url);
          reject(new Error('Audio playback failed'));
        };
        audio.play().catch((e) => {
          log(`Play rejected: ${e}`);
          URL.revokeObjectURL(url);
          reject(e);
        });
      });

      currentAudioRef.current = null;

      if (isActive(stateRef.current)) {
        log('Returning to listening');
        setUserTranscript('');
        setAssistantTranscript('');
        startRecognizing();
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Speech generation failed';
      log(`Speak error: ${msg}`);
      if (isActive(stateRef.current)) {
        setError(msg);
        setVoiceState('disconnected');
      }
    }
  }, [setVoiceState, onTranscript, log]);

  const handleUserMessage = useCallback(async (message: string) => {
    if (!isActive(stateRef.current)) return;
    if (processingRef.current) return;
    processingRef.current = true;
    setVoiceState('thinking');
    log('Sending to DeepSeek...');

    try {
      const history = conversationHistoryRef.current.slice(-12);
      const response = await api.chatStream(message, 'voice', history);

      if (!response.body) throw new Error('No stream');
      log('DeepSeek stream connected');

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let fullText = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        if (!isActive(stateRef.current)) {
          reader.cancel();
          processingRef.current = false;
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
          } catch { /* skip */ }
        }
      }

      log(`Response received: ${fullText.length} chars`);

      const cleaned = fullText
        .replace(/```transaction\s*\n[\s\S]*?\n```\n?/g, '')
        .replace(/```budget\s*\n[\s\S]*?\n```\n?/g, '')
        .replace(/```[\s\S]*?```/g, '')
        .trim();

      if (cleaned) {
        conversationHistoryRef.current.push({ role: 'assistant', content: cleaned });
        processingRef.current = false;
        await speakResponse(cleaned);
      } else {
        log('Empty AI response');
        processingRef.current = false;
        startRecognizing();
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'AI response failed';
      log(`DeepSeek error: ${msg}`);
      processingRef.current = false;
      if (isActive(stateRef.current)) {
        setError(msg);
        setVoiceState('disconnected');
      }
    }
  }, [setVoiceState, speakResponse, log]);

  const startRecognizing = useCallback(() => {
    if (!isActive(stateRef.current)) return;
    if (!streamRef.current) {
      log('No audio stream available');
      return;
    }

    shouldListenRef.current = true;
    chunksRef.current = [];

    const recorder = new MediaRecorder(streamRef.current, { mimeType: 'audio/webm;codecs=opus' });
    log('New MediaRecorder created');

    recorder.ondataavailable = (e) => {
      if (e.data.size > 0) chunksRef.current.push(e.data);
    };

    recorder.onstop = async () => {
      log(`Recorder stopped. Chunks: ${chunksRef.current.length}`);
      if (!shouldListenRef.current || !isActive(stateRef.current)) return;

      const allChunks = [...chunksRef.current];
      if (allChunks.length === 0) return;

      const audioBlob = new Blob(allChunks, { type: 'audio/webm' });
      log(`Audio blob: ${audioBlob.size} bytes`);

      if (audioBlob.size < 500) {
        log('Audio too short, restarting');
        if (isActive(stateRef.current)) startRecognizing();
        return;
      }

      const transcript = await transcribeAudio(audioBlob);
      if (transcript) {
        setUserTranscript(transcript);
        onTranscript?.(transcript, 'user');
        conversationHistoryRef.current.push({ role: 'user', content: transcript });
        await handleUserMessage(transcript);
      } else if (isActive(stateRef.current)) {
        log('No transcript, restarting listening');
        startRecognizing();
      }
    };

    mediaRecorderRef.current = recorder;
    recorder.start(250);
    setVoiceState('listening');
    startSilenceMonitor();
    log('Listening started');
  }, [setVoiceState, onTranscript, transcribeAudio, handleUserMessage, startSilenceMonitor, log]);

  const startListening = useCallback(async () => {
    try {
      log('Requesting microphone...');
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      });
      streamRef.current = stream;
      log('Microphone connected');

      const audioCtx = new AudioContext();
      if (audioCtx.state === 'suspended') {
        await audioCtx.resume();
        log('AudioContext resumed');
      }
      const analyser = audioCtx.createAnalyser();
      analyser.fftSize = 256;
      const source = audioCtx.createMediaStreamSource(stream);
      source.connect(analyser);
      audioContextRef.current = audioCtx;
      analyserRef.current = analyser;
      log('Analyser connected');

      startRecognizing();
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Microphone access denied';
      log(`Microphone error: ${msg}`);
      setError(msg);
      setVoiceState('disconnected');
    }
  }, [startRecognizing, log, setVoiceState]);

  const interrupt = useCallback(() => {
    if (stateRef.current !== 'speaking') return;
    log('User interrupted');

    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
    stopAudio();
    setVoiceState('interrupted');

    setTimeout(() => {
      if (stateRef.current === 'interrupted') {
        setUserTranscript('');
        setAssistantTranscript('');
        startRecognizing();
      }
    }, 200);
  }, [stopAudio, setVoiceState, startRecognizing, log]);

  const startCall = useCallback(async () => {
    setError(null);
    setUserTranscript('');
    setAssistantTranscript('');
    conversationHistoryRef.current = [];
    processingRef.current = false;
    setVoiceState('connecting');
    log('Starting voice call');
    await startListening();
  }, [startListening, setVoiceState, log]);

  const endCall = useCallback(() => {
    log('Ending call');
    setVoiceState('ending');
    cleanup();
    setTimeout(() => {
      setVoiceState('idle');
      setUserTranscript('');
      setAssistantTranscript('');
      setError(null);
    }, 100);
  }, [cleanup, setVoiceState, log]);

  const toggleMute = useCallback(() => {
    if (streamRef.current) {
      const tracks = streamRef.current.getAudioTracks();
      const muted = !tracks[0]?.enabled;
      tracks.forEach((t) => (t.enabled = muted));
      log(muted ? 'Microphone muted' : 'Microphone unmuted');
    }
  }, [log]);

  useEffect(() => {
    return () => {
      log('Hook cleanup');
      cleanup();
    };
  }, [cleanup, log]);

  return {
    state,
    userTranscript,
    assistantTranscript,
    error,
    startCall,
    endCall,
    interrupt,
    toggleMute,
  };
}
