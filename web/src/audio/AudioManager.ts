/**
 * Dice audio core, following the game-creator add-audio / game-audio pattern: one AudioContext,
 * created inside the player's first click / tap / key press (browser autoplay policy), a master
 * gain for mute, separate music and sfx buses, and a limiter so stacked sounds never clip.
 * Everything is synthesized at runtime (see sfx.ts and music.ts); there are no audio files.
 *
 * Mute and music preferences are stored under new keys, so a "muted" flag an older version of the
 * page may have saved can no longer silence the game.
 */
export type AudioStatus = "idle" | "starting" | "running" | "blocked" | "unsupported";

export interface AudioSnapshot {
  status: AudioStatus;
  muted: boolean;
  music: boolean;
}

type Bgm = { stop(): void };

const MUTED_KEY = "dice.audio.muted";
const MUSIC_KEY = "dice.audio.music";

function read(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}
function write(key: string, value: string): void {
  try {
    localStorage.setItem(key, value);
  } catch {
    /* private mode: preferences just aren't remembered */
  }
}

class AudioManager {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private sfxBus: GainNode | null = null;
  private musicBus: GainNode | null = null;
  private bgm: Bgm | null = null;
  private bgmPattern: ((ctx: AudioContext, out: AudioNode) => Bgm) | null = null;
  private listeners = new Set<() => void>();
  private snap: AudioSnapshot = { status: "idle", muted: read(MUTED_KEY) === "1", music: read(MUSIC_KEY) !== "0" };

  /** Call from inside a user gesture handler. Safe to call on every click. */
  init(): void {
    if (!this.ctx) {
      const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!Ctx) return this.set({ status: "unsupported" });
      try {
        this.ctx = new Ctx();
      } catch {
        return this.set({ status: "unsupported" });
      }
      const ctx = this.ctx;
      const limiter = ctx.createDynamicsCompressor();
      limiter.threshold.value = -8;
      limiter.knee.value = 6;
      limiter.ratio.value = 12;
      limiter.attack.value = 0.002;
      limiter.release.value = 0.12;
      this.master = ctx.createGain();
      this.master.gain.value = this.snap.muted ? 0 : 0.9;
      this.sfxBus = ctx.createGain();
      this.musicBus = ctx.createGain();
      this.musicBus.gain.value = this.snap.music ? 0.55 : 0;
      this.sfxBus.connect(this.master);
      this.musicBus.connect(this.master);
      this.master.connect(limiter).connect(ctx.destination);
      ctx.addEventListener("statechange", () => this.syncStatus());
    }
    const ctx = this.ctx;
    if (ctx.state !== "running") {
      this.set({ status: "starting" });
      // Safari/iOS: actually starting a (silent) source inside the gesture is what unlocks output.
      const src = ctx.createBufferSource();
      src.buffer = ctx.createBuffer(1, 1, 22_050);
      src.connect(ctx.destination);
      src.start();
      void ctx.resume().then(() => this.syncStatus()).catch(() => this.set({ status: "blocked" }));
      // If the browser still refuses after a moment, say so instead of failing silently.
      window.setTimeout(() => {
        if (this.ctx && this.ctx.state !== "running") this.set({ status: "blocked" });
      }, 800);
    } else {
      this.syncStatus();
    }
  }

  /** The context for scheduling sounds, or null when audio can't play yet. */
  get context(): AudioContext | null {
    return this.ctx && this.snap.status !== "blocked" ? this.ctx : null;
  }

  get sfxOut(): AudioNode | null {
    return this.sfxBus;
  }

  get snapshot(): AudioSnapshot {
    return this.snap;
  }

  subscribe(fn: () => void): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  setMuted(muted: boolean): void {
    write(MUTED_KEY, muted ? "1" : "0");
    if (this.master && this.ctx) this.master.gain.setTargetAtTime(muted ? 0 : 0.9, this.ctx.currentTime, 0.03);
    this.set({ muted });
  }

  setMusic(on: boolean): void {
    write(MUSIC_KEY, on ? "1" : "0");
    if (this.musicBus && this.ctx) this.musicBus.gain.setTargetAtTime(on ? 0.55 : 0, this.ctx.currentTime, 0.3);
    this.set({ music: on });
    this.syncMusic();
  }

  /** Loop this pattern while the page wants music (it starts once audio is running). */
  playMusic(pattern: (ctx: AudioContext, out: AudioNode) => Bgm): void {
    this.bgmPattern = pattern;
    this.syncMusic();
  }

  stopMusic(): void {
    this.bgmPattern = null;
    this.syncMusic();
  }

  private syncStatus(): void {
    const running = this.ctx?.state === "running";
    this.set({ status: running ? "running" : this.snap.status === "blocked" ? "blocked" : "starting" });
    this.syncMusic();
  }

  private syncMusic(): void {
    const want = !!this.bgmPattern && this.snap.music && this.snap.status === "running";
    if (want && !this.bgm && this.ctx && this.musicBus) {
      try {
        this.bgm = this.bgmPattern!(this.ctx, this.musicBus);
      } catch (e) {
        console.warn("[Audio] BGM error:", e);
      }
    } else if (!want && this.bgm) {
      this.bgm.stop();
      this.bgm = null;
    }
  }

  private set(patch: Partial<AudioSnapshot>): void {
    const next = { ...this.snap, ...patch };
    if (next.status === this.snap.status && next.muted === this.snap.muted && next.music === this.snap.music) return;
    this.snap = next;
    for (const fn of this.listeners) fn();
  }
}

export const audioManager = new AudioManager();
