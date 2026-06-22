export interface VoiceRecorderCallbacks {
  onAudioLevel: (level: number) => void;
  onSpeechDetected?: () => void;
  onSilenceDetected: () => void;
  onError: (msg: string) => void;
}

const SPEECH_START_THRESHOLD = 20;
const SPEECH_END_THRESHOLD = 12;
const MIN_SPEECH_DURATION_MS = 600;
const SILENCE_TIMEOUT_MS = 1800;
const MIN_VOICED_FRAMES = 5;

export class VoiceRecorder {
  private stream: MediaStream | null = null;
  private recorder: MediaRecorder | null = null;
  private audioCtx: AudioContext | null = null;
  private analyser: AnalyserNode | null = null;
  private chunks: Blob[] = [];
  private silenceTimer: ReturnType<typeof setTimeout> | null = null;
  private rafId = 0;
  private callbacks: VoiceRecorderCallbacks;
  private recordingStartTime = 0;
  private peakLevelValue = 0;
  private rmsTotal = 0;
  private rmsSamples = 0;
  private hasSpeechDetected = false;
  private voicedFrames = 0;
  private speechStartedTime = 0;
  private micRequested = false;

  constructor(callbacks: VoiceRecorderCallbacks) {
    this.callbacks = callbacks;
  }

  get recording(): boolean { return this.recorder?.state === 'recording'; }
  get minDurationMet(): boolean { return Date.now() - this.recordingStartTime >= MIN_SPEECH_DURATION_MS; }
  get hadRealSpeech(): boolean { return this.hasSpeechDetected && this.peakLevelValue > SPEECH_START_THRESHOLD && this.voicedFrames >= MIN_VOICED_FRAMES; }
  get peakLevel(): number { return this.peakLevelValue; }
  get avgLevel(): number { return this.rmsSamples > 0 ? this.rmsTotal / this.rmsSamples : 0; }
  get averageRMS(): number { return this.avgLevel; }
  get recordingDuration(): number { return this.recordingStartTime > 0 ? Date.now() - this.recordingStartTime : 0; }

  private async ensureStream(): Promise<MediaStream> {
    if (this.stream && this.stream.active) return this.stream;
    console.log('[VoiceRecorder] Requesting new microphone stream...');
    this.stream = await navigator.mediaDevices.getUserMedia({
      audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true, channelCount: 1 },
    });
    this.micRequested = true;
    return this.stream;
  }

  async start(): Promise<void> {
    try {
      const stream = await this.ensureStream();
      console.log('[VoiceRecorder] Microphone ready');

      if (!this.audioCtx || this.audioCtx.state === 'closed') {
        this.audioCtx = new AudioContext();
        if (this.audioCtx.state === 'suspended') await this.audioCtx.resume();
        this.analyser = this.audioCtx.createAnalyser();
        this.analyser.fftSize = 256;
        this.audioCtx.createMediaStreamSource(stream).connect(this.analyser);
        console.log('[VoiceRecorder] AudioContext ready');
      }

      this.chunks = [];
      this.recordingStartTime = Date.now();
      this.peakLevelValue = 0;
      this.rmsTotal = 0;
      this.rmsSamples = 0;
      this.hasSpeechDetected = false;
      this.voicedFrames = 0;
      this.speechStartedTime = 0;

      this.recorder = new MediaRecorder(stream, { mimeType: 'audio/webm;codecs=opus' });
      this.recorder.ondataavailable = (e) => { if (e.data.size > 0) this.chunks.push(e.data); };
      this.recorder.onerror = () => { this.callbacks.onError('Microphone error'); this.stop(); };
      this.recorder.start(250);
      console.log('[VoiceRecorder] Recording started');
      this.monitorSilence();
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Microphone denied';
      console.error('[VoiceRecorder]', msg);
      this.callbacks.onError(msg);
    }
  }

  private monitorSilence(): void {
    const check = () => {
      if (!this.analyser || !this.recorder || this.recorder.state !== 'recording') return;
      const data = new Uint8Array(this.analyser.frequencyBinCount);
      this.analyser.getByteFrequencyData(data);
      const avg = data.reduce((s, v) => s + v, 0) / data.length;
      const level = Math.min(100, Math.max(0, avg));
      this.callbacks.onAudioLevel(level);

      this.rmsTotal += level;
      this.rmsSamples++;

      if (level > this.peakLevelValue) this.peakLevelValue = level;

      if (!this.hasSpeechDetected && level > SPEECH_START_THRESHOLD) {
        this.voicedFrames++;
        if (this.voicedFrames >= MIN_VOICED_FRAMES) {
          this.hasSpeechDetected = true;
          this.speechStartedTime = Date.now();
          this.callbacks.onSpeechDetected?.();
          console.log(`[VoiceRecorder] Speech detected (peak: ${this.peakLevelValue.toFixed(1)})`);
        }
      }

      if (this.hasSpeechDetected && level > SPEECH_END_THRESHOLD) {
        this.voicedFrames++;
        if (this.silenceTimer) { clearTimeout(this.silenceTimer); this.silenceTimer = null; }
      } else if (this.hasSpeechDetected && !this.silenceTimer) {
        this.silenceTimer = setTimeout(() => {
          const rms = this.avgLevel;
          console.log(`[VoiceRecorder] Silence (peak: ${this.peakLevelValue.toFixed(1)}, avg: ${rms.toFixed(1)}, voiced: ${this.voicedFrames}, duration: ${Date.now() - this.recordingStartTime}ms)`);
          this.callbacks.onSilenceDetected();
        }, SILENCE_TIMEOUT_MS);
      }

      this.rafId = requestAnimationFrame(check);
    };
    this.rafId = requestAnimationFrame(check);
  }

  stop(): Blob | null {
    if (this.silenceTimer) { clearTimeout(this.silenceTimer); this.silenceTimer = null; }
    if (this.rafId) { cancelAnimationFrame(this.rafId); this.rafId = 0; }
    if (this.recorder && this.recorder.state === 'recording') this.recorder.stop();
    this.recorder = null;
    const allChunks = [...this.chunks];
    this.chunks = [];
    if (allChunks.length === 0) return null;
    const blob = new Blob(allChunks, { type: 'audio/webm' });
    console.log(`[VoiceRecorder] Blob: ${blob.size}B, peak: ${this.peakLevelValue.toFixed(1)}, avg: ${this.avgLevel.toFixed(1)}, voiced: ${this.voicedFrames}, dur: ${Date.now() - this.recordingStartTime}ms`);
    return blob.size >= 500 ? blob : null;
  }

  dispose(): void {
    this.stop();
    if (this.analyser) { this.analyser.disconnect(); this.analyser = null; }
    if (this.audioCtx && this.audioCtx.state !== 'closed') { this.audioCtx.close().catch(() => {}); this.audioCtx = null; }
    if (this.stream) { this.stream.getTracks().forEach((t) => t.stop()); this.stream = null; }
    this.micRequested = false;
  }
}
