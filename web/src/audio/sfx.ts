import { audioManager } from "./AudioManager";

/**
 * Dice sound effects, synthesized with the Web Audio API (game-creator sfx-engine pattern:
 * oscillator / noise → filter → gain envelope → sfx bus, one-shot, nothing created per frame).
 * Levels follow the game-audio mixing guide (SFX 0.2–0.3) with a little extra body so each
 * sound carries on laptop speakers: nothing important sits below ~250 Hz.
 */

type Wave = OscillatorType;

function out(): { ctx: AudioContext; dest: AudioNode } | null {
  const ctx = audioManager.context;
  const dest = audioManager.sfxOut;
  return ctx && dest ? { ctx, dest } : null;
}

let noiseBuf: AudioBuffer | null = null;
function noiseBuffer(ctx: AudioContext): AudioBuffer {
  if (!noiseBuf || noiseBuf.sampleRate !== ctx.sampleRate) {
    noiseBuf = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
    const d = noiseBuf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  }
  return noiseBuf;
}

/** One enveloped tone; `glideTo` sweeps the pitch. */
function playTone(freq: number, type: Wave, duration: number, gain = 0.25, o: { at?: number; glideTo?: number; filter?: number; attack?: number; dest?: AudioNode } = {}): void {
  const a = out();
  if (!a) return;
  const { ctx } = a;
  const t = ctx.currentTime + (o.at ?? 0);
  const osc = ctx.createOscillator();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, t);
  if (o.glideTo) osc.frequency.exponentialRampToValueAtTime(o.glideTo, t + duration);
  const g = ctx.createGain();
  const attack = o.attack ?? 0.004;
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(gain, t + attack);
  g.gain.exponentialRampToValueAtTime(0.0001, t + duration);
  const f = ctx.createBiquadFilter();
  f.type = "lowpass";
  f.frequency.setValueAtTime(o.filter ?? 6000, t);
  osc.connect(f).connect(g).connect(o.dest ?? a.dest);
  osc.start(t);
  osc.stop(t + duration + 0.02);
}

function playNotes(notes: number[], type: Wave, noteDuration: number, gap: number, gain = 0.25, filter = 6000, at = 0): void {
  notes.forEach((freq, i) => playTone(freq, type, noteDuration, gain, { at: at + i * gap, filter }));
}

/** Filtered noise burst: the body of clicks, clacks and rattles. */
function playNoise(duration: number, gain = 0.2, o: { at?: number; band?: number; q?: number; lowpass?: number; dest?: AudioNode } = {}): void {
  const a = out();
  if (!a) return;
  const { ctx } = a;
  const t = ctx.currentTime + (o.at ?? 0);
  const src = ctx.createBufferSource();
  src.buffer = noiseBuffer(ctx);
  const f = ctx.createBiquadFilter();
  if (o.band) {
    f.type = "bandpass";
    f.frequency.setValueAtTime(o.band, t);
    f.Q.setValueAtTime(o.q ?? 3, t);
  } else {
    f.type = "lowpass";
    f.frequency.setValueAtTime(o.lowpass ?? 4000, t);
  }
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(gain, t + 0.002);
  g.gain.exponentialRampToValueAtTime(0.0001, t + duration);
  src.connect(f).connect(g).connect(o.dest ?? a.dest);
  src.start(t, Math.random() * 0.8);
  src.stop(t + duration + 0.02);
}

// Note frequencies used below.
const C5 = 523.25, E5 = 659.25, G5 = 783.99, C6 = 1046.5, E6 = 1318.5, G6 = 1568, C7 = 2093, D4 = 293.66, G4 = 392;

/** UI button press: a short wooden "tok". */
export function clickSfx(): void {
  playTone(880, "triangle", 0.07, 0.2, { filter: 5000 });
  playNoise(0.03, 0.12, { band: 3200, q: 2 });
}

let lastSlide = 0;
/** Target slider notch, pitched by the target value (throttled while dragging). */
export function slideSfx(target: number): void {
  const now = performance.now();
  if (now - lastSlide < 28) return;
  lastSlide = now;
  playTone(500 + target * 12, "triangle", 0.05, 0.18, { filter: 6000 });
}

/** Bet placed: two quick chip clacks. */
export function betSfx(): void {
  for (const [at, f] of [[0, 1400], [0.06, 1900]] as const) {
    playNoise(0.05, 0.3, { at, band: f * 1.6, q: 4 });
    playTone(f, "triangle", 0.09, 0.22, { at, glideTo: f * 0.8, filter: 7000 });
  }
}

/**
 * The roll: dice rattling across felt for the length of the marker animation. Grains start dense
 * and spread out with the same quintic slowdown as the marker, under a whoosh that darkens and
 * fades. Returns a handle so the page can cut it short (unmount, mute).
 */
export function rollSfx(duration = 1.5): { stop(): void } {
  const a = out();
  if (!a) return { stop() {} };
  const { ctx } = a;
  const bus = ctx.createGain();
  bus.gain.value = 1;
  bus.connect(a.dest);
  const t0 = ctx.currentTime;

  // whoosh bed
  const bed = ctx.createBufferSource();
  bed.buffer = noiseBuffer(ctx);
  bed.loop = true;
  const lp = ctx.createBiquadFilter();
  lp.type = "bandpass";
  lp.Q.value = 0.8;
  lp.frequency.setValueAtTime(2600, t0);
  lp.frequency.exponentialRampToValueAtTime(500, t0 + duration);
  const bg = ctx.createGain();
  bg.gain.setValueAtTime(0.0001, t0);
  bg.gain.exponentialRampToValueAtTime(0.16, t0 + 0.05);
  bg.gain.exponentialRampToValueAtTime(0.0001, t0 + duration);
  bed.connect(lp).connect(bg).connect(bus);
  bed.start(t0);
  bed.stop(t0 + duration + 0.05);

  // rattle grains: time between grains grows as 1 - (1 - p)^4 (the marker's speed curve)
  let t = 0.01;
  let i = 0;
  while (t < duration * 0.8) {
    const speed = Math.pow(1 - t / duration, 4);
    const gain = 0.08 + 0.2 * speed;
    playNoise(0.035, gain, { at: t, band: 1800 + Math.random() * 2600, q: 5, dest: bus });
    if (i % 2 === 0) playTone(600 + Math.random() * 500, "triangle", 0.04, gain * 0.5, { at: t, filter: 4000, dest: bus });
    t += 0.022 + (1 - speed) * 0.12 + Math.random() * 0.015;
    i++;
  }
  return {
    stop() {
      bus.gain.setTargetAtTime(0, ctx.currentTime, 0.02);
      window.setTimeout(() => bus.disconnect(), 200);
    },
  };
}

/** The marker passing a notch; pitch rises as it slows. */
export function tickSfx(pitch: number): void {
  playTone(1500 * pitch, "triangle", 0.045, 0.16, { filter: 7000 });
  playNoise(0.02, 0.1, { band: 4200, q: 6 });
}

/** The number locks onto the result: a bright clack. */
export function lockSfx(): void {
  playNoise(0.06, 0.3, { band: 3000, q: 3 });
  playTone(G6, "square", 0.08, 0.1, { filter: 5000 });
  playTone(C7, "triangle", 0.12, 0.14, { filter: 8000 });
}

/** The marker comes to rest: a soft, audible thunk. */
export function landSfx(): void {
  playTone(440, "sine", 0.18, 0.3, { glideTo: 180 });
  playTone(880, "triangle", 0.06, 0.12, { filter: 3000 });
  playNoise(0.08, 0.18, { lowpass: 1500 });
}

/** Win: bright rising chime; x10 and up gets a longer run and a shower of coins. */
export function winSfx(multiplier: number): void {
  const big = multiplier >= 10;
  const notes = big ? [C5, E5, G5, C6, E6, G6, C7] : [C6, E6, G6, C7];
  playNotes(notes, "triangle", 0.3, big ? 0.06 : 0.075, 0.26, 7000);
  playNotes(notes.map((n) => n * 2), "sine", 0.18, big ? 0.06 : 0.075, 0.06, 9000);
  if (big) for (let i = 0; i < 10; i++) playTone(2400 + Math.random() * 1600, "sine", 0.12, 0.08, { at: 0.45 + i * 0.05 });
}

/** Loss: a soft two-note fall. */
export function loseSfx(): void {
  playTone(G4, "triangle", 0.22, 0.24, { glideTo: G4 * 0.94, filter: 1800 });
  playTone(D4, "triangle", 0.4, 0.24, { at: 0.16, glideTo: D4 * 0.9, filter: 1500 });
}

/** Balance refilled: a handful of coin clinks. */
export function coinsSfx(): void {
  for (let i = 0; i < 8; i++) {
    const f = 2200 + Math.random() * 1400;
    playTone(f, "sine", 0.16, 0.12, { at: i * 0.06 });
    playTone(f * 2.7, "sine", 0.08, 0.04, { at: i * 0.06 });
  }
}

/** Rejected action: two short low buzzes. */
export function errorSfx(): void {
  playTone(196, "square", 0.1, 0.12, { filter: 1200 });
  playTone(185, "square", 0.12, 0.12, { at: 0.13, filter: 1200 });
}
