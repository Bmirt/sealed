/**
 * Every sound in the game, as an offline-render recipe. Part of the asset manifest:
 * swap any entry for `{ kind: 'file', url }` to use a real recording without touching game code.
 */
import { bell, clack, drum, env, filter, growl, noise, osc, stack, whoosh } from './dsp';

export interface SynthSound {
  readonly kind: 'synth';
  readonly duration: number;
  readonly loop?: boolean;
  readonly volume?: number;
  readonly render: (ctx: OfflineAudioContext) => void;
}

export interface FileSound {
  readonly kind: 'file';
  readonly url: string;
  readonly loop?: boolean;
  readonly volume?: number;
}

export type SoundAsset = SynthSound | FileSound;

export type SoundId =
  | 'ui'
  | 'spin'
  | 'reelLand'
  | 'scatterChime'
  | 'wildFire'
  | 'anticipationLoop'
  | 'rollupLoop'
  | 'winEnd'
  | 'fanfare'
  | 'roar'
  | 'igniteHit'
  | 'fireBreath'
  | 'stingerIntro'
  | 'retriggerArp'
  | 'meterStep'
  | 'outroStinger'
  | 'musicBase'
  | 'musicFeature'
  | 'ambientFire';

export const SOUNDS: Readonly<Record<SoundId, SoundAsset>> = {
  ui: {
    kind: 'synth',
    duration: 0.09,
    volume: 0.4,
    render: (ctx) => {
      const o = osc(ctx, 'square', 1150, 0, 0.06);
      const g = env(ctx, 0, 0.003, 0.05, 0.5);
      o.connect(filter(ctx, 'lowpass', 2400)).connect(g).connect(ctx.destination);
    },
  },

  spin: {
    kind: 'synth',
    duration: 0.45,
    volume: 0.55,
    render: (ctx) => {
      whoosh(ctx, ctx.destination, 0, 0.4, 180, 950, 0.8, 31);
      drum(ctx, ctx.destination, 0.02, 130, 70, 0.16, 0.5);
    },
  },

  reelLand: {
    kind: 'synth',
    duration: 0.3,
    volume: 0.7,
    render: (ctx) => {
      drum(ctx, ctx.destination, 0, 95, 55, 0.2, 1);
      clack(ctx, ctx.destination, 0.005, 900, 0.09, 0.6, 11);
      clack(ctx, ctx.destination, 0.03, 420, 0.12, 0.45, 12);
    },
  },

  scatterChime: {
    kind: 'synth',
    duration: 1.1,
    volume: 0.75,
    render: (ctx) => {
      bell(ctx, ctx.destination, 0, 620, 1.0, 0.9);
      bell(ctx, ctx.destination, 0.06, 930, 0.8, 0.4);
    },
  },

  wildFire: {
    kind: 'synth',
    duration: 0.7,
    volume: 0.7,
    render: (ctx) => {
      whoosh(ctx, ctx.destination, 0, 0.55, 2400, 300, 0.9, 55);
      for (let i = 0; i < 7; i++) clack(ctx, ctx.destination, 0.08 + i * 0.06, 1500 + (i % 3) * 700, 0.05, 0.3, 100 + i);
      drum(ctx, ctx.destination, 0.05, 120, 60, 0.25, 0.6);
    },
  },

  anticipationLoop: {
    kind: 'synth',
    duration: 2.0,
    loop: true,
    volume: 0.55,
    render: (ctx) => {
      // Trembling low drone + double heartbeat.
      for (const [f, a] of [[55, 0.5], [55.7, 0.35], [110, 0.18]] as const) {
        const o = osc(ctx, 'sawtooth', f, 0, 2.0);
        const g = ctx.createGain();
        g.gain.value = a * 0.5;
        const lfo = osc(ctx, 'sine', 6.5, 0, 2.0);
        const lfoG = ctx.createGain();
        lfoG.gain.value = a * 0.2;
        lfo.connect(lfoG).connect(g.gain);
        o.connect(filter(ctx, 'lowpass', 420, 1.2)).connect(g).connect(ctx.destination);
      }
      drum(ctx, ctx.destination, 0.0, 62, 30, 0.14, 0.8);
      drum(ctx, ctx.destination, 0.28, 58, 28, 0.13, 0.6);
      drum(ctx, ctx.destination, 1.0, 62, 30, 0.14, 0.8);
      drum(ctx, ctx.destination, 1.28, 58, 28, 0.13, 0.6);
    },
  },

  rollupLoop: {
    kind: 'synth',
    duration: 0.5,
    loop: true,
    volume: 0.4,
    render: (ctx) => {
      for (let i = 0; i < 4; i++) {
        bell(ctx, ctx.destination, i * 0.125, 1180 + (i % 2) * 260, 0.16, 0.5, [[1, 1], [2.4, 0.3]]);
      }
    },
  },

  winEnd: {
    kind: 'synth',
    duration: 0.9,
    volume: 0.6,
    render: (ctx) => {
      bell(ctx, ctx.destination, 0, 880, 0.8, 0.8);
      bell(ctx, ctx.destination, 0.07, 1320, 0.7, 0.5);
    },
  },

  fanfare: {
    kind: 'synth',
    duration: 2.2,
    volume: 0.8,
    render: (ctx) => {
      // Three rising brass hits over war drums, ending on a crash.
      const chords: [number, number[]][] = [
        [0.0, [110, 165, 220]],
        [0.45, [131, 196, 262]],
        [0.95, [147, 220, 294, 440]],
      ];
      for (const [t, notes] of chords) for (const f of notes) stack(ctx, ctx.destination, t, f, 0.9, 0.02, 0.5);
      drum(ctx, ctx.destination, 0, 70, 40, 0.3, 1);
      drum(ctx, ctx.destination, 0.45, 70, 40, 0.3, 1);
      drum(ctx, ctx.destination, 0.95, 85, 55, 0.5, 1.1);
      const crash = noise(ctx, 0.95, 1.2, 900);
      const cg = env(ctx, 0.95, 0.01, 1.1, 0.35);
      crash.connect(filter(ctx, 'highpass', 4200, 0.6)).connect(cg).connect(ctx.destination);
      bell(ctx, ctx.destination, 0.95, 587, 1.2, 0.5);
    },
  },

  roar: {
    kind: 'synth',
    duration: 1.6,
    volume: 0.85,
    render: (ctx) => {
      growl(ctx, ctx.destination, 0.02, 1.4, 1);
    },
  },

  igniteHit: {
    kind: 'synth',
    duration: 1.0,
    volume: 0.8,
    render: (ctx) => {
      drum(ctx, ctx.destination, 0, 150, 110, 0.5, 1.1);
      whoosh(ctx, ctx.destination, 0, 0.7, 400, 3200, 0.7, 66);
      bell(ctx, ctx.destination, 0.05, 440, 0.9, 0.4);
    },
  },

  fireBreath: {
    kind: 'synth',
    duration: 1.5,
    volume: 0.85,
    render: (ctx) => {
      // The jet: broadband roar swept down as the stream lengthens, plus a second darker layer.
      whoosh(ctx, ctx.destination, 0, 1.35, 2600, 700, 0.9, 311);
      whoosh(ctx, ctx.destination, 0.04, 1.3, 900, 260, 0.7, 733);
      // Crackle: short noise clacks scattered through the burn.
      for (let i = 0; i < 16; i++) clack(ctx, ctx.destination, 0.08 + i * 0.075 + (i % 3) * 0.013, 1800 + (i % 5) * 420, 0.05, 0.35, 90 + i);
      // Body: a low rumble under the jet so it has weight on big speakers.
      drum(ctx, ctx.destination, 0, 90, 55, 1.2, 0.45);
    },
  },

  stingerIntro: {
    kind: 'synth',
    duration: 2.4,
    volume: 0.75,
    render: (ctx) => {
      drum(ctx, ctx.destination, 0, 65, 38, 0.5, 1.1);
      for (const [t, f] of [[0.05, 110], [0.05, 165], [0.5, 220], [0.9, 330]] as const) stack(ctx, ctx.destination, t, f, 1.3, 0.3, 0.4);
      bell(ctx, ctx.destination, 0.9, 660, 1.3, 0.4);
    },
  },

  retriggerArp: {
    kind: 'synth',
    duration: 1.1,
    volume: 0.7,
    render: (ctx) => {
      const notes = [523, 659, 784, 1047];
      notes.forEach((f, i) => bell(ctx, ctx.destination, i * 0.11, f, 0.7, 0.6));
      drum(ctx, ctx.destination, 0, 80, 45, 0.25, 0.7);
    },
  },

  meterStep: {
    kind: 'synth',
    duration: 0.9,
    volume: 0.75,
    render: (ctx) => {
      clack(ctx, ctx.destination, 0, 2600, 0.06, 0.8, 21); // anvil ring
      bell(ctx, ctx.destination, 0.02, 1046, 0.8, 0.7, [[1, 1], [1.5, 0.4], [2.76, 0.3]]);
      drum(ctx, ctx.destination, 0, 110, 60, 0.2, 0.7);
    },
  },

  outroStinger: {
    kind: 'synth',
    duration: 2.6,
    volume: 0.8,
    render: (ctx) => {
      for (const [t, f] of [[0, 147], [0, 220], [0.4, 294], [0.4, 370], [0.4, 440]] as const) stack(ctx, ctx.destination, t, f, 1.6, 0.05, 0.42);
      bell(ctx, ctx.destination, 0.4, 880, 1.6, 0.5);
      drum(ctx, ctx.destination, 0.4, 75, 45, 0.4, 1);
    },
  },

  musicBase: {
    kind: 'synth',
    duration: 13.714, // 4 bars of 4 at 70 bpm
    loop: true,
    volume: 0.32,
    render: (ctx) => {
      const beat = 60 / 70;
      // Deep drone bed.
      for (const [f, a] of [[55, 0.5], [55.5, 0.3], [82.5, 0.14]] as const) {
        const o = osc(ctx, 'sawtooth', f, 0, 13.8);
        const g = ctx.createGain();
        g.gain.value = a * 0.4;
        const lfo = osc(ctx, 'sine', 0.11, 0, 13.8);
        const lg = ctx.createGain();
        lg.gain.value = a * 0.12;
        lfo.connect(lg).connect(g.gain);
        o.connect(filter(ctx, 'lowpass', 300, 0.9)).connect(g).connect(ctx.destination);
      }
      // War drums: heavy 1, ghost on the and-of-2, tom on 4.
      for (let bar = 0; bar < 4; bar++) {
        const t0 = bar * 4 * beat;
        drum(ctx, ctx.destination, t0, 60, 32, 0.34, 1);
        drum(ctx, ctx.destination, t0 + 1.5 * beat, 52, 26, 0.2, 0.4);
        drum(ctx, ctx.destination, t0 + 3 * beat, 88, 46, 0.3, 0.65);
      }
      // A distant bell at bar 3.
      bell(ctx, ctx.destination, 8 * beat, 220, 2.4, 0.22);
      // Air.
      const wind = noise(ctx, 0, 13.8, 555);
      const wg = ctx.createGain();
      wg.gain.value = 0.02;
      wind.connect(filter(ctx, 'bandpass', 400, 0.4)).connect(wg).connect(ctx.destination);
    },
  },

  musicFeature: {
    kind: 'synth',
    duration: 10.0, // 4 bars of 4 at 96 bpm
    loop: true,
    volume: 0.36,
    render: (ctx) => {
      const beat = 60 / 96;
      for (const [f, a] of [[55, 0.42], [110, 0.2], [164.8, 0.1]] as const) {
        const o = osc(ctx, 'sawtooth', f, 0, 10.1);
        const g = ctx.createGain();
        g.gain.value = a * 0.4;
        const lfo = osc(ctx, 'sine', 0.19, 0, 10.1);
        const lg = ctx.createGain();
        lg.gain.value = a * 0.14;
        lfo.connect(lg).connect(g.gain);
        o.connect(filter(ctx, 'lowpass', 380, 1.0)).connect(g).connect(ctx.destination);
      }
      // Driving drums: 1 & 3 kicks, and-of-4 double.
      for (let bar = 0; bar < 4; bar++) {
        const t0 = bar * 4 * beat;
        drum(ctx, ctx.destination, t0, 62, 34, 0.3, 1);
        drum(ctx, ctx.destination, t0 + 2 * beat, 62, 34, 0.3, 0.85);
        drum(ctx, ctx.destination, t0 + 3.5 * beat, 55, 28, 0.18, 0.5);
        drum(ctx, ctx.destination, t0 + 3.75 * beat, 55, 28, 0.18, 0.5);
        clack(ctx, ctx.destination, t0 + beat, 3200, 0.05, 0.16, 300 + bar);
        clack(ctx, ctx.destination, t0 + 3 * beat, 3200, 0.05, 0.16, 320 + bar);
      }
      // Two-note ostinato (A – C).
      for (let bar = 0; bar < 4; bar++) {
        const t0 = bar * 4 * beat;
        const f = bar % 2 === 0 ? 110 : 130.8;
        for (let i = 0; i < 8; i++) {
          const o = osc(ctx, 'square', f, t0 + i * beat * 0.5, 0.12);
          const g = env(ctx, t0 + i * beat * 0.5, 0.005, 0.1, 0.06);
          o.connect(filter(ctx, 'lowpass', 900, 1)).connect(g).connect(ctx.destination);
        }
      }
    },
  },

  ambientFire: {
    kind: 'synth',
    duration: 8.0,
    loop: true,
    volume: 0.2,
    render: (ctx) => {
      // Fire bed.
      const bed = noise(ctx, 0, 8.05, 808);
      const bg = ctx.createGain();
      bg.gain.value = 0.05;
      bed.connect(filter(ctx, 'lowpass', 320, 0.6)).connect(bg).connect(ctx.destination);
      // Crackles at deterministic pseudo-random times.
      let s = 97;
      for (let i = 0; i < 26; i++) {
        s = (s * 16807) % 2147483647;
        const t = (s / 2147483647) * 7.7;
        s = (s * 16807) % 2147483647;
        const f = 900 + (s / 2147483647) * 2600;
        clack(ctx, ctx.destination, t, f, 0.03, 0.24, s % 1000);
      }
    },
  },
};
