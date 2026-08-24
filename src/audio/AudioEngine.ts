import { Howl, Howler } from 'howler';
import { SOUNDS } from '@/assets/sfx/recipes';
import type { SoundId } from '@/assets/sfx/recipes';
import { bufferToWavUrl } from '@/assets/sfx/wav';

const SAMPLE_RATE = 22050;

/**
 * All playback runs through Howler; every sound is synthesised offline at boot into a WAV blob
 * (see assets/sfx/recipes.ts — the audio half of the asset manifest).
 *
 * Channels: one-shots fire and forget; named loops (music, ambient, drone, roll-up) are managed
 * so they can crossfade, duck and stop cleanly.
 */
export class AudioEngine {
  private readonly howls = new Map<SoundId, Howl>();
  private muted = false;
  private musicId: SoundId | null = null;
  private ducked = false;
  private rollupStartedAt = 0;
  private rollupPlaying = false;

  private constructor() {
    /* built via create() */
  }

  /** Render every synth recipe and wrap it in a Howl. Call after the first user gesture. */
  static async create(): Promise<AudioEngine> {
    const engine = new AudioEngine();
    for (const [id, def] of Object.entries(SOUNDS) as [SoundId, (typeof SOUNDS)[SoundId]][]) {
      let url: string;
      if (def.kind === 'synth') {
        const ctx = new OfflineAudioContext(1, Math.ceil(def.duration * SAMPLE_RATE), SAMPLE_RATE);
        def.render(ctx);
        const buffer = await ctx.startRendering();
        url = bufferToWavUrl(buffer);
      } else {
        url = def.url;
      }
      engine.howls.set(
        id,
        new Howl({
          src: [url],
          format: ['wav'],
          loop: def.loop ?? false,
          volume: def.volume ?? 0.7,
          preload: true,
        }),
      );
    }
    return engine;
  }

  setMuted(muted: boolean): void {
    this.muted = muted;
    Howler.mute(muted);
  }

  get isMuted(): boolean {
    return this.muted;
  }

  play(id: SoundId, opts: { rate?: number; volume?: number } = {}): void {
    const h = this.howls.get(id);
    if (!h) return;
    const playId = h.play();
    if (opts.rate !== undefined) h.rate(opts.rate, playId);
    if (opts.volume !== undefined) h.volume(opts.volume, playId);
  }

  // ---- named loops ----

  loopStart(id: SoundId, fade = 0.2): void {
    const h = this.howls.get(id);
    if (!h || h.playing()) return;
    const base = SOUNDS[id].volume ?? 0.7;
    h.volume(0);
    h.play();
    h.fade(0, base, fade * 1000);
  }

  loopStop(id: SoundId, fade = 0.25): void {
    const h = this.howls.get(id);
    if (!h || !h.playing()) return;
    h.fade(h.volume() as number, 0, fade * 1000);
    setTimeout(() => {
      if ((h.volume() as number) < 0.01) h.stop();
    }, fade * 1000 + 60);
  }

  // ---- music ----

  music(kind: 'base' | 'feature'): void {
    const id: SoundId = kind === 'base' ? 'musicBase' : 'musicFeature';
    if (this.musicId === id) return;
    if (this.musicId) this.loopStop(this.musicId, 0.8);
    this.musicId = id;
    this.loopStart(id, 1.2);
  }

  /** Dip the music under a foreground moment (anticipation, big win). */
  duck(on: boolean): void {
    if (this.ducked === on) return;
    this.ducked = on;
    if (!this.musicId) return;
    const h = this.howls.get(this.musicId);
    if (!h?.playing()) return;
    const base = SOUNDS[this.musicId].volume ?? 0.3;
    h.fade(h.volume() as number, on ? base * 0.25 : base, 350);
  }

  // ---- roll-up (rate ramps with elapsed time — no total needed) ----

  rollupStart(): void {
    if (this.rollupPlaying) return;
    this.rollupPlaying = true;
    this.rollupStartedAt = performance.now();
    this.loopStart('rollupLoop', 0.05);
  }

  rollupTick(): void {
    if (!this.rollupPlaying) return;
    const h = this.howls.get('rollupLoop');
    if (!h) return;
    const elapsed = (performance.now() - this.rollupStartedAt) / 1000;
    h.rate(Math.min(1.7, 1 + elapsed * 0.35));
  }

  rollupStop(withChime: boolean): void {
    if (!this.rollupPlaying) return;
    this.rollupPlaying = false;
    this.loopStop('rollupLoop', 0.08);
    const h = this.howls.get('rollupLoop');
    h?.rate(1);
    if (withChime) this.play('winEnd');
  }

  destroy(): void {
    for (const h of this.howls.values()) h.unload();
    this.howls.clear();
  }
}
