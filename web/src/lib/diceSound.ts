/**
 * Plays the dice sound effects: WAV files in public/sounds/ (made by scripts/generate-sounds.mjs).
 *
 * Browsers only allow audio to start inside a click / tap / key press, and Safari only counts some
 * events, so unlock() is called from every one of them (and from the roll itself). The files are
 * fetched up front and decoded on unlock. A sound asked for while audio is still starting is held
 * until it can play, and dropped if that takes too long, so stale sounds never pile up.
 */
type SoundName = "tick" | "bet" | "roll" | "lock" | "land" | "win" | "bigWin" | "lose" | "error" | "coins";
const NAMES: SoundName[] = ["tick", "bet", "roll", "lock", "land", "win", "bigWin", "lose", "error", "coins"];
/** How loud the roll bed plays under the ticks: keeps its peaks just below the limiter threshold. */
const ROLL_GAIN = 0.6;

/** A playing sound that can be stopped early. */
type Voice = { stop: () => void };
const url = (name: SoundName): string => `${import.meta.env.BASE_URL}sounds/${name}.wav`;

export class DiceSound {
  private on = true;
  private rolling: Voice | null = null;
  private ctx: AudioContext | null = null;
  private out: GainNode | null = null;
  private files = new Map<SoundName, Promise<ArrayBuffer>>();
  private buffers = new Map<SoundName, AudioBuffer>();
  private decoded: Promise<unknown> = Promise.resolve();
  private lastSlide = 0;

  constructor() {
    for (const name of NAMES) {
      const file = fetch(url(name)).then((r) => r.arrayBuffer());
      file.catch(() => undefined);
      this.files.set(name, file);
    }
  }

  get enabled(): boolean {
    return this.on;
  }

  /** Muting also cuts a roll that is still playing. */
  set enabled(value: boolean) {
    this.on = value;
    if (!value) this.stopRoll();
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
      // Overlapping sounds (fast slider drags, ticks over the bet clack) are summed; a limiter keeps
      // them loud without clipping into distortion.
      const limiter = ctx.createDynamicsCompressor();
      limiter.threshold.value = -6;
      limiter.knee.value = 4;
      limiter.ratio.value = 20;
      limiter.attack.value = 0.001;
      limiter.release.value = 0.08;
      this.out = ctx.createGain();
      this.out.gain.value = 1;
      // The compressor adds its own make-up gain and its 1 ms attack lets the front of stacked
      // transients (bet + roll + first ticks) through, so trim after it to stay clear of 0 dBFS.
      const trim = ctx.createGain();
      trim.gain.value = 0.89;
      this.out.connect(limiter).connect(trim).connect(ctx.destination);
      this.decoded = Promise.all(
        NAMES.map(async (name) => {
          const data = await this.files.get(name);
          if (!data) return;
          this.buffers.set(name, await ctx.decodeAudioData(data.slice(0)));
        }),
      ).catch(() => undefined);
    }
    if (this.ctx.state !== "running") {
      void this.ctx.resume().catch(() => undefined);
      // iOS/Safari: starting a (silent) source inside the gesture is what actually unlocks output.
      const src = this.ctx.createBufferSource();
      src.buffer = this.ctx.createBuffer(1, 1, 22_050);
      src.connect(this.ctx.destination);
      src.start();
    }
  }

  /** Button press. */
  click(): void {
    this.play("tick", { rate: 0.85, gain: 0.8 });
  }

  /** Target slider moved: a notch tick, pitched by the target. */
  slide(target: number): void {
    const now = performance.now();
    if (now - this.lastSlide < 25) return;
    this.lastSlide = now;
    this.play("tick", { rate: 0.8 + target / 250 });
  }

  /** Bet placed, roll starting. */
  bet(): void {
    this.play("bet");
  }

  /**
   * Roll started: the 1.5 s whoosh/rattle bed that follows the marker's speed. If audio needs a
   * moment to start, it joins at the matching point of the file so it stays in sync with the marker.
   */
  roll(): void {
    this.stopRoll();
    this.rolling = this.play("roll", { gain: ROLL_GAIN, sync: true });
  }

  /** Cut the roll bed short (unmount, mute) with a quick fade rather than a click. */
  stopRoll(): void {
    this.rolling?.stop();
    this.rolling = null;
  }

  /** The number locks onto the exact result. */
  lock(): void {
    this.play("lock", { gain: 0.95 });
  }

  /** The marker comes to rest. */
  land(): void {
    this.play("land");
  }

  /** The rolling number / marker passing a notch; pitch rises as it slows. */
  tick(pitch: number): void {
    this.play("tick", { rate: pitch, gain: 0.9 });
  }

  win(multiplier: number): void {
    this.play(multiplier >= 10 ? "bigWin" : "win");
  }

  lose(): void {
    this.play("lose");
  }

  coins(): void {
    this.play("coins");
  }

  error(): void {
    this.play("error");
  }

  /**
   * Start a sound. `sync` sounds are time-aligned to when they were asked for: a late start skips
   * the part already missed. Returns a handle that can stop it (null if nothing will play).
   */
  private play(name: SoundName, o: { rate?: number; gain?: number; sync?: boolean } = {}): Voice | null {
    if (!this.on) return null;
    const asked = performance.now();
    const ctx = this.ctx;
    if (!ctx) {
      // No Web Audio (or not unlocked yet): plain <audio> is better than silence.
      const el = new Audio(url(name));
      el.volume = Math.min(1, o.gain ?? 1);
      el.playbackRate = o.rate ?? 1;
      void el.play().catch(() => undefined);
      return { stop: () => el.pause() };
    }
    let stopped = false;
    let stopNow: (() => void) | null = null;
    const start = (): void => {
      const buffer = this.buffers.get(name);
      if (stopped || !this.on || !this.out || !buffer) return;
      const offset = o.sync ? (performance.now() - asked) / 1000 : 0;
      if (offset >= buffer.duration * 0.8) return;
      const src = ctx.createBufferSource();
      src.buffer = buffer;
      src.playbackRate.value = o.rate ?? 1;
      const gain = ctx.createGain();
      gain.gain.value = o.gain ?? 1;
      src.connect(gain).connect(this.out);
      src.start(0, offset);
      src.onended = () => {
        stopNow = null;
      };
      stopNow = () => {
        const t = ctx.currentTime;
        gain.gain.cancelScheduledValues(t);
        gain.gain.setValueAtTime(gain.gain.value, t);
        gain.gain.linearRampToValueAtTime(0, t + 0.04);
        try {
          src.stop(t + 0.05);
        } catch {
          // already stopped
        }
      };
    };
    const voice: Voice = {
      stop: () => {
        stopped = true;
        stopNow?.();
      },
    };
    if (ctx.state === "running" && this.buffers.has(name)) {
      start();
      return voice;
    }
    void Promise.all([this.decoded, ctx.resume()])
      .then(() => {
        if (performance.now() - asked < 300) start();
      })
      .catch(() => undefined);
    return voice;
  }
}
