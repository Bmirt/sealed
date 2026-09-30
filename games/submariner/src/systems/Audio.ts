/**
 * Game audio: WAVs from public/audio (made by scripts/generate-audio.mjs), played through Web Audio
 * with groups (sfx, ambience, engine), a limiter, loops, pitch variance and a mute switch.
 *
 * Browsers only start audio inside a click / tap / key press (Safari only counts some events), so
 * unlock() is called from all of them. Files are fetched immediately and decoded on unlock; sounds
 * asked for while audio is still starting are held briefly, then dropped rather than played late.
 */
export type SoundId =
  | 'ambience-loop' | 'engine-loop' | 'sonar' | 'dive-start' | 'bet' | 'cancel' | 'tick'
  | 'cashout' | 'milestone' | 'creak-1' | 'creak-2' | 'implode' | 'click';

const IDS: SoundId[] = ['ambience-loop', 'engine-loop', 'sonar', 'dive-start', 'bet', 'cancel', 'tick', 'cashout', 'milestone', 'creak-1', 'creak-2', 'implode', 'click'];
const url = (id: SoundId): string => `${import.meta.env.BASE_URL}audio/${id}.wav`;

type Loop = { src: AudioBufferSourceNode; gain: GainNode };

export class GameAudio {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private files = new Map<SoundId, Promise<ArrayBuffer | null>>();
  private buffers = new Map<SoundId, AudioBuffer>();
  private decoded: Promise<unknown> = Promise.resolve();
  private loops = new Map<SoundId, Loop>();
  private wantLoops = new Map<SoundId, number>();
  private muted = false;

  constructor(private readonly rng: () => number) {
    for (const id of IDS) {
      this.files.set(id, fetch(url(id)).then((r) => (r.ok ? r.arrayBuffer() : null)).catch(() => null));
    }
  }

  get isMuted(): boolean {
    return this.muted;
  }

  unlock(): void {
    if (!this.ctx) {
      const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!Ctx) return;
      try {
        this.ctx = new Ctx();
      } catch {
        return;
      }
      const ctx = this.ctx;
      const limiter = ctx.createDynamicsCompressor();
      limiter.threshold.value = -6;
      limiter.knee.value = 4;
      limiter.ratio.value = 20;
      limiter.attack.value = 0.001;
      limiter.release.value = 0.1;
      const trim = ctx.createGain();
      trim.gain.value = 0.88; // Chrome's compressor adds makeup gain; keep the output under full scale
      this.master = ctx.createGain();
      this.master.gain.value = this.muted ? 0 : 1;
      this.master.connect(limiter).connect(trim).connect(ctx.destination);
      this.decoded = Promise.all(
        IDS.map(async (id) => {
          const data = await this.files.get(id);
          if (!data) return;
          try {
            this.buffers.set(id, await ctx.decodeAudioData(data.slice(0)));
          } catch {
            /* a bad file must not take the rest down */
          }
        }),
      ).then(() => this.syncLoops());
    }
    if (this.ctx.state !== 'running') {
      void this.ctx.resume().then(() => this.syncLoops()).catch(() => undefined);
      const src = this.ctx.createBufferSource();
      src.buffer = this.ctx.createBuffer(1, 1, 22_050);
      src.connect(this.ctx.destination);
      src.start();
    }
  }

  setMuted(muted: boolean): void {
    this.muted = muted;
    if (this.master && this.ctx) this.master.gain.setTargetAtTime(muted ? 0 : 1, this.ctx.currentTime, 0.05);
  }

  /** One-shot with ±pitchVar random pitch. */
  play(id: SoundId, o: { gain?: number; rate?: number; pitchVar?: number } = {}): void {
    const ctx = this.ctx;
    if (!ctx || this.muted) return;
    const start = (): void => {
      const buffer = this.buffers.get(id);
      if (!buffer || !this.master) return;
      const src = ctx.createBufferSource();
      src.buffer = buffer;
      src.playbackRate.value = (o.rate ?? 1) * (1 + (this.rng() - 0.5) * 2 * (o.pitchVar ?? 0));
      const gain = ctx.createGain();
      gain.gain.value = o.gain ?? 1;
      src.connect(gain).connect(this.master);
      src.start();
    };
    if (ctx.state === 'running' && this.buffers.has(id)) return start();
    const asked = performance.now();
    void Promise.all([this.decoded, ctx.resume()])
      .then(() => {
        if (performance.now() - asked < 300) start();
      })
      .catch(() => undefined);
  }

  /** Keep a loop playing at this gain (0 stops it); safe to call every frame. */
  loop(id: SoundId, gain: number, rate = 1): void {
    this.wantLoops.set(id, gain);
    const l = this.loops.get(id);
    if (l && this.ctx) {
      l.gain.gain.setTargetAtTime(gain, this.ctx.currentTime, 0.25);
      l.src.playbackRate.setTargetAtTime(rate, this.ctx.currentTime, 0.4);
    } else if (gain > 0) {
      this.syncLoops();
    }
  }

  private syncLoops(): void {
    const ctx = this.ctx;
    if (!ctx || !this.master || ctx.state !== 'running') return;
    for (const [id, gain] of this.wantLoops) {
      if (this.loops.has(id) || gain <= 0) continue;
      const buffer = this.buffers.get(id);
      if (!buffer) continue;
      const src = ctx.createBufferSource();
      src.buffer = buffer;
      src.loop = true;
      const g = ctx.createGain();
      g.gain.value = 0;
      g.gain.setTargetAtTime(gain, ctx.currentTime, 0.4);
      src.connect(g).connect(this.master);
      src.start();
      this.loops.set(id, { src, gain: g });
    }
  }

  /** Pause everything when the tab is hidden. */
  suspend(hidden: boolean): void {
    if (!this.ctx) return;
    if (hidden) void this.ctx.suspend();
    else void this.ctx.resume();
  }

  dispose(): void {
    for (const l of this.loops.values()) l.src.stop();
    this.loops.clear();
    void this.ctx?.close();
    this.ctx = null;
  }
}
