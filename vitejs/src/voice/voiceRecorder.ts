export interface VoiceRecorderCallbacks {
  onAudioLevel: (level: number) => void;
  onSilenceDetected: () => void;
  onError: (msg: string) => void;
}

export class VoiceRecorder {
  private stream: MediaStream | null = null;
  private recorder: MediaRecorder | null = null;
  private audioCtx: AudioContext | null = null;
  private analyser: AnalyserNode | null = null;
  private chunks: Blob[] = [];
  private silenceTimer: ReturnType<typeof setTimeout> | null = null;
  private rafId = 0;
  private silenceTimeout: number;
  private callbacks: VoiceRecorderCallbacks;
  private recordingStartTime = 0;
  private peakLevel = 0;
  private hasSpeechDetected = false;

  constructor(callbacks: VoiceRecorderCallbacks, silenceTimeout = 2200) {
    this.callbacks = callbacks;
    this.silenceTimeout = silenceTimeout;
  }

  get recording(): boolean {
    return this.recorder?.state === 'recording';
  }

  get minDurationMet(): boolean {
    return Date.now() - this.recordingStartTime >= 800;
  }

  get hadRealSpeech(): boolean {
    return this.hasSpeechDetected && this.peakLevel > 15;
  }

  async start(): Promise<void> {
    try {
      console.log('[VoiceRecorder] Requesting microphone...');
      this.stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
          channelCount: 1,
        },
      });
      console.log('[VoiceRecorder] Microphone connected');

      this.audioCtx = new AudioContext();
      if (this.audioCtx.state === 'suspended') {
        await this.audioCtx.resume();
        console.log('[VoiceRecorder] AudioContext resumed');
      }
      this.analyser = this.audioCtx.createAnalyser();
      this.analyser.fftSize = 256;
      this.audioCtx.createMediaStreamSource(this.stream).connect(this.analyser);
      console.log('[VoiceRecorder] Analyser connected');

      this.chunks = [];
      this.recordingStartTime = Date.now();
      this.peakLevel = 0;
      this.hasSpeechDetected = false;

      this.recorder = new MediaRecorder(this.stream, { mimeType: 'audio/webm;codecs=opus' });

      this.recorder.ondataavailable = (e) => {
        if (e.data.size > 0) this.chunks.push(e.data);
      };

      this.recorder.onerror = () => {
        this.callbacks.onError('Microphone error');
        this.stop();
      };

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

      if (level > this.peakLevel) this.peakLevel = level;
      if (level > 15) this.hasSpeechDetected = true;

      if (level > 12) {
        if (this.silenceTimer) { clearTimeout(this.silenceTimer); this.silenceTimer = null; }
      } else if (!this.silenceTimer) {
        this.silenceTimer = setTimeout(() => {
          console.log(`[VoiceRecorder] Silence detected (peak: ${this.peakLevel.toFixed(1)}, speech: ${this.hasSpeechDetected})`);
          this.callbacks.onSilenceDetected();
        }, this.silenceTimeout);
      }

      this.rafId = requestAnimationFrame(check);
    };
    this.rafId = requestAnimationFrame(check);
  }

  stop(): Blob | null {
    console.log('[VoiceRecorder] Stopping...');
    if (this.silenceTimer) { clearTimeout(this.silenceTimer); this.silenceTimer = null; }
    if (this.rafId) { cancelAnimationFrame(this.rafId); this.rafId = 0; }

    if (this.recorder && this.recorder.state === 'recording') {
      this.recorder.stop();
    }
    this.recorder = null;

    if (this.analyser) { this.analyser = null; }
    if (this.audioCtx && this.audioCtx.state !== 'closed') {
      this.audioCtx.close().catch(() => {});
      this.audioCtx = null;
    }
    if (this.stream) {
      this.stream.getTracks().forEach((t) => t.stop());
      this.stream = null;
    }

    const allChunks = [...this.chunks];
    this.chunks = [];
    if (allChunks.length === 0) return null;

    const blob = new Blob(allChunks, { type: 'audio/webm' });
    console.log(`[VoiceRecorder] Blob: ${blob.size} bytes, peak: ${this.peakLevel.toFixed(1)}, speech: ${this.hasSpeechDetected}, duration: ${Date.now() - this.recordingStartTime}ms`);
    return blob.size >= 500 ? blob : null;
  }

  dispose(): void {
    this.stop();
  }
}
