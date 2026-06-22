export class VoicePlayer {
  private audio: HTMLAudioElement | null = null;
  private onEndCallback: (() => void) | null = null;

  get playing(): boolean {
    return this.audio !== null && !this.audio.paused;
  }

  async play(blob: Blob): Promise<void> {
    this.stop();

    const url = URL.createObjectURL(blob);
    const audio = new Audio(url);
    this.audio = audio;
    console.log('[VoicePlayer] Playing audio...');

    return new Promise((resolve) => {
      audio.onended = () => {
        console.log('[VoicePlayer] Playback complete');
        URL.revokeObjectURL(url);
        this.audio = null;
        this.onEndCallback?.();
        resolve();
      };
      audio.onerror = () => {
        console.log('[VoicePlayer] Playback error');
        URL.revokeObjectURL(url);
        this.audio = null;
        resolve();
      };
      audio.play().catch(() => {
        URL.revokeObjectURL(url);
        this.audio = null;
        resolve();
      });
    });
  }

  stop(): void {
    if (this.audio) {
      this.audio.pause();
      this.audio.onended = null;
      this.audio.onerror = null;
      this.audio.src = '';
      this.audio = null;
      console.log('[VoicePlayer] Stopped');
    }
  }

  onEnd(cb: () => void): void {
    this.onEndCallback = cb;
  }
}
