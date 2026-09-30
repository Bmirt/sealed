// Generates the dice sound kit as WAV files in web/public/sounds/.
// Run: pnpm --filter web sounds   (the generated files are committed, so this is only needed to change them)
//
// Everything is synthesised here from scratch (no third-party or sampled audio) and is fully
// deterministic (seeded noise). The kit shares one sound world so it reads as a set:
//   - hard, bright "acrylic / ceramic" hits: a filtered noise transient exciting a few damped
//     resonant modes (modal synthesis), for tick / bet / lock / land / lose;
//   - glassy bells for win / bigWin / coins;
//   - the same small, bright room reverb on everything;
//   - a high-pass so the energy sits where laptop speakers can reproduce it (> ~250 Hz);
//   - mastering to about -1 dBFS peak with a target RMS, so every one-shot is clearly audible.
// roll.wav is the continuous bed under the roll animation: its loudness and brightness follow the
// marker speed of Dice.tsx's 1500 ms quintic ease-out, so it must stay 1.5 s long.
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const SR = 44_100;
const OUT = resolve(dirname(fileURLToPath(import.meta.url)), "../public/sounds");
const TAU = 2 * Math.PI;

const buffer = (seconds) => new Float32Array(Math.ceil(seconds * SR));
const db = (v) => 20 * Math.log10(Math.max(v, 1e-12));
const fromDb = (d) => Math.pow(10, d / 20);

/** xorshift32 noise in [-1, 1): deterministic per seed. */
function rng(seed) {
  let s = (seed * 2654435761) >>> 0 || 1;
  return () => {
    s ^= s << 13;
    s ^= s >>> 17;
    s ^= s << 5;
    return ((s >>> 0) / 0x1_0000_0000) * 2 - 1;
  };
}

// ---------------------------------------------------------------- filters

/** RBJ biquad coefficients. */
function biquad(type, f, q = Math.SQRT1_2) {
  const w = (TAU * Math.min(f, SR * 0.45)) / SR;
  const cos = Math.cos(w);
  const alpha = Math.sin(w) / (2 * q);
  let b0, b1, b2;
  if (type === "lp") [b0, b1, b2] = [(1 - cos) / 2, 1 - cos, (1 - cos) / 2];
  else if (type === "hp") [b0, b1, b2] = [(1 + cos) / 2, -(1 + cos), (1 + cos) / 2];
  else [b0, b1, b2] = [alpha, 0, -alpha]; // band-pass, 0 dB peak
  const a0 = 1 + alpha;
  return { b0: b0 / a0, b1: b1 / a0, b2: b2 / a0, a1: (-2 * cos) / a0, a2: (1 - alpha) / a0 };
}

/** Apply a biquad (in place). */
function filter(x, type, f, q) {
  const c = biquad(type, f, q);
  let x1 = 0, x2 = 0, y1 = 0, y2 = 0;
  for (let i = 0; i < x.length; i++) {
    const y = c.b0 * x[i] + c.b1 * x1 + c.b2 * x2 - c.a1 * y1 - c.a2 * y2;
    x2 = x1;
    x1 = x[i];
    y2 = y1;
    y1 = y;
    x[i] = y;
  }
  return x;
}

/** State-variable filter with a per-sample cutoff (for sweeps). Returns { lp, bp, hp } of one input sample. */
function svf() {
  let ic1 = 0, ic2 = 0;
  return (x, f, q) => {
    const g = Math.tan((Math.PI * Math.min(f, SR * 0.45)) / SR);
    const k = 1 / q;
    const a1 = 1 / (1 + g * (g + k));
    const v3 = x - ic2;
    const v1 = a1 * ic1 + g * a1 * v3;
    const v2 = ic2 + g * v1;
    ic1 = 2 * v1 - ic1;
    ic2 = 2 * v2 - ic2;
    return { lp: v2, bp: v1, hp: x - k * v1 - v2 };
  };
}

// ---------------------------------------------------------------- building blocks

/** Filtered noise burst: the hard front edge of a hit. */
function transient(out, at, { dur, amp, lo = 2000, hi = 12000, seed, shape = 0.25 }) {
  const n = Math.floor(dur * SR);
  const burst = new Float32Array(n);
  const rand = rng(seed);
  for (let i = 0; i < n; i++) burst[i] = rand() * Math.exp(-i / (n * shape));
  filter(burst, "hp", lo, 0.8);
  filter(burst, "lp", hi, 0.8);
  const start = Math.floor(at * SR);
  for (let i = 0; i < n && start + i < out.length; i++) out[start + i] += amp * burst[i];
}

/** One exponentially damped sinusoid (a resonant mode), with an optional pitch glide. */
function mode(out, at, { f, amp, tau, attack = 0.0004, glide = 1, phase = 0 }) {
  const start = Math.floor(at * SR);
  const n = Math.min(Math.floor(tau * 7 * SR), out.length - start);
  let ph = phase;
  for (let i = 0; i < n; i++) {
    const t = i / SR;
    const freq = f * (1 + (glide - 1) * (1 - Math.exp(-t / (tau * 0.8))));
    ph += (TAU * freq) / SR;
    const env = (t < attack ? t / attack : 1) * Math.exp(-t / tau);
    out[start + i] += amp * env * Math.sin(ph);
  }
}

/** A struck object: noise transient + a set of modes [ratio, gain, tau]. */
function hit(out, at, { f, modes, amp = 1, noise = 0.8, noiseDur = 0.004, lo = 2500, hi = 11000, seed = 1, glide = 1, detune = 0 }) {
  transient(out, at, { dur: noiseDur, amp: amp * noise, lo, hi, seed });
  const rand = rng(seed + 101);
  for (const [ratio, gain, tau] of modes) {
    mode(out, at, { f: f * ratio * (1 + detune * rand()), amp: amp * gain, tau, glide, phase: (rand() + 1) * Math.PI });
  }
}

/** Glassy bell: slightly inharmonic partials, the upper ones dying first. */
function bell(out, at, f, amp, length = 0.7) {
  for (const [ratio, gain, tau] of [[1, 1, 0.42], [2.005, 0.42, 0.26], [3.01, 0.2, 0.16], [4.16, 0.16, 0.1], [5.43, 0.09, 0.06], [6.8, 0.05, 0.04]]) {
    mode(out, at, { f: f * ratio, amp: amp * gain, tau: length * tau, attack: 0.0015 });
  }
  transient(out, at, { dur: 0.003, amp: amp * 0.35, lo: 4000, hi: 14000, seed: Math.round(f) });
}

/** Small, bright room (Freeverb-style combs + all-passes), mixed in at `wet`. Low end is kept out of it. */
function room(x, { wet = 0.14, size = 0.55, damp = 0.35, tail = 0 } = {}) {
  const out = new Float32Array(x.length + Math.floor(tail * SR));
  out.set(x);
  const send = new Float32Array(out.length);
  send.set(x);
  filter(send, "hp", 500, 0.7);
  const combs = [1116, 1188, 1277, 1356, 1422, 1491].map((d) => Math.floor(d * size));
  const wetSig = new Float32Array(out.length);
  for (const d of combs) {
    const line = new Float32Array(d);
    let idx = 0, store = 0;
    const fb = 0.78;
    for (let i = 0; i < out.length; i++) {
      const y = line[idx];
      store = y * (1 - damp) + store * damp;
      line[idx] = send[i] + store * fb;
      idx = (idx + 1) % d;
      wetSig[i] += y / combs.length;
    }
  }
  for (const d of [556, 441, 341].map((v) => Math.floor(v * size))) {
    const line = new Float32Array(d);
    let idx = 0;
    for (let i = 0; i < out.length; i++) {
      const b = line[idx];
      const y = -wetSig[i] + b;
      line[idx] = wetSig[i] + b * 0.5;
      idx = (idx + 1) % d;
      wetSig[i] = y;
    }
  }
  for (let i = 0; i < out.length; i++) out[i] += wet * 3 * wetSig[i];
  return out;
}

/**
 * Mastering: high-pass (energy where small speakers work), soft-clip with the smallest drive that
 * reaches the target RMS, normalise to the peak, trim the silent tail, fade the last few ms.
 */
let lastDrive = 0;
function master(x, { peakDb = -1, rmsDb = -12, hp = 200, maxDrive = 5 } = {}) {
  filter(x, "hp", hp, 0.7);
  filter(x, "hp", hp, 0.7);
  let peak = 0;
  for (const s of x) peak = Math.max(peak, Math.abs(s));
  const shaped = (drive) => {
    const y = new Float32Array(x.length);
    let m = 0;
    for (let i = 0; i < x.length; i++) {
      y[i] = Math.tanh((x[i] / peak) * drive);
      m = Math.max(m, Math.abs(y[i]));
    }
    const g = fromDb(peakDb) / m;
    let sum = 0;
    for (let i = 0; i < y.length; i++) {
      y[i] *= g;
      sum += y[i] * y[i];
    }
    return { y, rms: db(Math.sqrt(sum / y.length)) };
  };
  let lo = 0.3, hi = maxDrive;
  let best = shaped(hi);
  if (best.rms > rmsDb) {
    for (let k = 0; k < 24; k++) {
      const mid = (lo + hi) / 2;
      const r = shaped(mid);
      if (r.rms < rmsDb) lo = mid;
      else [hi, best] = [mid, r];
    }
  }
  lastDrive = hi;
  let y = best.y;
  let end = y.length;
  while (end > 1 && Math.abs(y[end - 1]) < fromDb(-66)) end--;
  y = y.slice(0, Math.max(end, Math.floor(0.04 * SR)));
  const fade = Math.min(Math.floor(0.006 * SR), y.length);
  for (let i = 0; i < fade; i++) y[y.length - 1 - i] *= i / fade;
  return y;
}

// ---------------------------------------------------------------- the kit

// Acrylic / ceramic mode sets (ratio, gain, tau seconds) shared by the hits so they sound related.
const ACRYLIC = [[1, 1, 0.02], [1.58, 0.62, 0.013], [2.33, 0.36, 0.009], [0.51, 0.55, 0.03], [3.1, 0.2, 0.006]];
const CERAMIC = [[1, 1, 0.024], [1.54, 0.6, 0.016], [2.2, 0.38, 0.01], [0.56, 0.5, 0.034], [2.95, 0.2, 0.007]];

const SOUNDS = {
  // Slider notch, button press and the rolling ratchet: a crisp acrylic tick with a pawl-release
  // after-click and a little room, ~60 ms of body. Played at rates 0.8 to 1.4.
  tick() {
    const out = buffer(0.12);
    hit(out, 0, { f: 2350, modes: ACRYLIC, noise: 1.1, noiseDur: 0.003, lo: 3000, seed: 7 });
    hit(out, 0.009, { f: 2600, modes: ACRYLIC, amp: 0.3, noise: 0.5, noiseDur: 0.002, lo: 4000, seed: 8 });
    mode(out, 0, { f: 1180, amp: 0.35, tau: 0.035 }); // body
    return master(room(out, { wet: 0.1, size: 0.4 }), { rmsDb: -12 });
  },

  // Bet placed: two ceramic chips clacking onto the stack.
  bet() {
    const out = buffer(0.24);
    hit(out, 0, { f: 2900, modes: CERAMIC, noise: 1, lo: 2500, seed: 11 });
    hit(out, 0.062, { f: 3350, modes: CERAMIC, amp: 0.85, noise: 1, lo: 2500, seed: 12 });
    mode(out, 0, { f: 1450, amp: 0.4, tau: 0.04 });
    mode(out, 0.062, { f: 1680, amp: 0.35, tau: 0.04 });
    return master(room(out, { wet: 0.12, size: 0.5 }), { rmsDb: -12 });
  },

  // The number locking onto the result: a bright double "clack" (latch engaging) with a short
  // glassy ring that says "that's the one".
  lock() {
    const out = buffer(0.2);
    hit(out, 0, { f: 3000, modes: CERAMIC, amp: 0.8, noise: 1.1, lo: 3000, seed: 21 });
    hit(out, 0.011, { f: 2700, modes: ACRYLIC, amp: 1, noise: 1.2, noiseDur: 0.005, lo: 2000, seed: 22 });
    mode(out, 0.011, { f: 3520, amp: 0.3, tau: 0.06, attack: 0.001 }); // A7 ring
    mode(out, 0.011, { f: 5280, amp: 0.12, tau: 0.04, attack: 0.001 }); // its fifth
    mode(out, 0.011, { f: 1320, amp: 0.4, tau: 0.035 });
    return master(room(out, { wet: 0.12, size: 0.5 }), { rmsDb: -11.5 });
  },

  // The marker coming to rest: a soft, rounded settle "thunk" (felt-tipped wood), low-mids not bass.
  land() {
    const out = buffer(0.26);
    hit(out, 0, {
      f: 440,
      modes: [[1, 1, 0.055], [1.62, 0.7, 0.04], [2.71, 0.4, 0.025], [4.2, 0.2, 0.014], [6.1, 0.1, 0.008]],
      noise: 0.5,
      noiseDur: 0.006,
      lo: 600,
      hi: 4000,
      seed: 31,
      glide: 0.93,
    });
    transient(out, 0, { dur: 0.004, amp: 0.25, lo: 3000, hi: 9000, seed: 32 }); // a hint of edge so it reads
    return master(room(out, { wet: 0.1, size: 0.5 }), { rmsDb: -13, hp: 180 });
  },

  // Continuous roll bed, 1.5 s: an airy whoosh plus a fine ball-bearing rattle. Both follow the
  // marker speed v(p) = (1 - p)^4 of the quintic ease-out: loud and bright at the start, darker and
  // sparser as it slows, silent at rest.
  roll() {
    const len = 1.5;
    const out = buffer(len);
    const n = out.length;
    const noise = rng(51);
    const sweep = svf();
    const air = svf();
    for (let i = 0; i < n; i++) {
      const p = i / n;
      const v = Math.pow(1 - p, 4);
      const attack = Math.min(1, i / (0.025 * SR));
      const x = noise();
      const center = 500 + 3800 * Math.pow(v, 0.6);
      const body = sweep(x, center, 0.9).bp;
      const hiss = air(x, 6000 + 3000 * v, 0.7).hp;
      out[i] = attack * Math.pow(1 - p, 2) * (body * 1.0 + hiss * 0.25 * v);
    }
    // Rattle: tiny resonant grains, dense while fast, thinning out as the marker slows.
    const rand = rng(52);
    let t = 0;
    while (t < len) {
      const p = t / len;
      const v = Math.pow(1 - p, 4);
      const rate = 12 + 160 * v; // grains per second
      t += (1 / rate) * (0.6 + 0.8 * ((rand() + 1) / 2));
      if (t >= len) break;
      const vp = Math.pow(1 - t / len, 4);
      const g = 0.16 * Math.pow(vp, 0.35) * Math.pow(1 - t / len, 1.2) * (0.5 + 0.5 * ((rand() + 1) / 2));
      const f = 2400 + 3200 * ((rand() + 1) / 2) * (0.5 + 0.5 * vp);
      mode(out, t, { f, amp: g, tau: 0.004 + 0.003 * ((rand() + 1) / 2), attack: 0.0003 });
      transient(out, t, { dur: 0.0015, amp: g * 0.8, lo: 3500, hi: 11000, seed: 1000 + Math.floor(t * SR) });
    }
    let y = room(out, { wet: 0.08, size: 0.45 });
    y = y.slice(0, n);
    // Fixed length and level (not peak-normalised like the one-shots): RMS about -16 dBFS.
    filter(y, "hp", 250, 0.7);
    filter(y, "hp", 250, 0.7);
    let sum = 0, peak = 0;
    for (const s of y) {
      sum += s * s;
      peak = Math.max(peak, Math.abs(s));
    }
    let g = fromDb(-16) / Math.sqrt(sum / n);
    const src = Float32Array.from(y);
    for (let k = 0; k < 4; k++) {
      sum = 0;
      for (let i = 0; i < n; i++) {
        y[i] = Math.tanh(src[i] * g * 1.1) / 1.1;
        sum += y[i] * y[i];
      }
      g *= fromDb(-16) / Math.sqrt(sum / n);
    }
    const fade = Math.floor(0.08 * SR);
    for (let i = 0; i < fade; i++) y[n - 1 - i] *= i / fade;
    return y;
  },

  // Win: a bright two-note bell (E6, B6) with a sparkle on top.
  win() {
    const out = buffer(0.9);
    hit(out, 0, { f: 3000, modes: CERAMIC, amp: 0.4, noise: 0.6, seed: 61 });
    bell(out, 0, 1318.5, 1, 0.7); // E6
    bell(out, 0.085, 1975.5, 1, 0.8); // B6
    bell(out, 0.17, 2637, 0.35, 0.5); // E7 sparkle
    mode(out, 0, { f: 659.3, amp: 0.3, tau: 0.16, attack: 0.002 }); // warmth an octave down
    return master(room(out, { wet: 0.16, size: 0.7, tail: 0.2 }), { rmsDb: -13 });
  },

  // Big win (x10 and up): a rising E-major run, a held chord and a cascade of sparkles.
  bigWin() {
    const out = buffer(1.6);
    hit(out, 0, { f: 3000, modes: CERAMIC, amp: 0.45, noise: 0.6, seed: 71 });
    [1318.5, 1661.2, 1975.5, 2637].forEach((f, i) => bell(out, i * 0.075, f, 1, 0.8));
    for (const f of [1318.5, 1975.5, 2637]) bell(out, 0.34, f, 0.55, 1.1);
    mode(out, 0, { f: 659.3, amp: 0.3, tau: 0.3, attack: 0.002 });
    const rand = rng(72);
    for (let i = 0; i < 14; i++) bell(out, 0.36 + i * 0.05, 3000 + (rand() + 1) * 1100, 0.25, 0.3);
    return master(room(out, { wet: 0.18, size: 0.75, tail: 0.25 }), { rmsDb: -13 });
  },

  // Loss: a soft muted two-note knock going down (marimba-like, D6 then A5). Clearly there, not punishing.
  lose() {
    const out = buffer(0.36);
    const bar = [[1, 1, 0.07], [3.93, 0.25, 0.018], [9.2, 0.08, 0.006], [0.5, 0.3, 0.05]];
    hit(out, 0, { f: 1174.7, modes: bar, amp: 0.8, noise: 0.25, lo: 1500, hi: 6000, seed: 81 });
    hit(out, 0.085, { f: 880, modes: bar, amp: 1, noise: 0.25, lo: 1500, hi: 6000, seed: 82, glide: 0.97 });
    return master(room(out, { wet: 0.12, size: 0.55 }), { rmsDb: -13 });
  },

  // Rejected action: two short, rounded buzzes.
  error() {
    const out = buffer(0.3);
    for (const at of [0, 0.13]) {
      for (const [h, g] of [[1, 1], [3, 0.4], [5, 0.22], [7, 0.12], [9, 0.06]]) {
        const start = Math.floor(at * SR);
        const len = Math.floor(0.1 * SR);
        for (let i = 0; i < len; i++) {
          const t = i / SR;
          const env = Math.min(1, t / 0.004) * Math.min(1, (len - i) / (0.02 * SR));
          out[start + i] += g * env * Math.sin(TAU * 440 * h * t);
        }
      }
    }
    filter(out, "lp", 2800, 0.7);
    return master(room(out, { wet: 0.08, size: 0.45 }), { rmsDb: -13, maxDrive: 2 });
  },

  // Balance refilled: a small pour of coins (inharmonic metal clinks).
  coins() {
    const out = buffer(0.9);
    const rand = rng(91);
    const coin = [[1, 1, 0.09], [1.52, 0.55, 0.06], [2.21, 0.35, 0.04], [2.93, 0.2, 0.03]];
    for (let i = 0; i < 9; i++) {
      const at = i * 0.065 + (rand() + 1) * 0.014;
      hit(out, at, { f: 2500 + (rand() + 1) * 600, modes: coin, amp: 1 - i * 0.05, noise: 0.6, lo: 4000, seed: 92 + i, detune: 0.01 });
    }
    return master(room(out, { wet: 0.16, size: 0.65, tail: 0.15 }), { rmsDb: -13 });
  },
};

// ---------------------------------------------------------------- output

function wav(samples) {
  const buf = Buffer.alloc(44 + samples.length * 2);
  buf.write("RIFF", 0);
  buf.writeUInt32LE(36 + samples.length * 2, 4);
  buf.write("WAVEfmt ", 8);
  buf.writeUInt32LE(16, 16);
  buf.writeUInt16LE(1, 20); // PCM
  buf.writeUInt16LE(1, 22); // mono
  buf.writeUInt32LE(SR, 24);
  buf.writeUInt32LE(SR * 2, 28);
  buf.writeUInt16LE(2, 32);
  buf.writeUInt16LE(16, 34);
  buf.write("data", 36);
  buf.writeUInt32LE(samples.length * 2, 40);
  samples.forEach((s, i) => buf.writeInt16LE(Math.round(Math.max(-1, Math.min(1, s)) * 32767), 44 + i * 2));
  return buf;
}

/** Share of the energy above ~250 Hz (4th-order high-pass split). */
function highShare(samples) {
  const hp = Float32Array.from(samples);
  filter(hp, "hp", 250, 0.7);
  filter(hp, "hp", 250, 0.7);
  let all = 0, high = 0;
  for (let i = 0; i < samples.length; i++) {
    all += samples[i] * samples[i];
    high += hp[i] * hp[i];
  }
  return Math.min(1, high / all);
}

mkdirSync(OUT, { recursive: true });
for (const [name, build] of Object.entries(SOUNDS)) {
  lastDrive = 0;
  const samples = build();
  writeFileSync(resolve(OUT, `${name}.wav`), wav(samples));
  let peak = 0;
  let sum = 0;
  for (const s of samples) {
    peak = Math.max(peak, Math.abs(s));
    sum += s * s;
  }
  console.log(
    `${name.padEnd(7)} ${(samples.length / SR).toFixed(3)}s  peak ${db(peak).toFixed(1)} dBFS  rms ${db(Math.sqrt(sum / samples.length)).toFixed(1)} dBFS  >250Hz ${(highShare(samples) * 100).toFixed(1)}%${lastDrive ? `  (drive ${lastDrive.toFixed(2)})` : ""}`,
  );
}
