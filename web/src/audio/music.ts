/**
 * Background music for the dice table: the game-creator look-ahead step sequencer (schedules
 * 100 ms ahead, checks every 25 ms, no drift) playing a soft casino-lounge loop. Levels follow the
 * mixing guide (pads 0.08–0.15, bass 0.15–0.22, lead 0.10–0.18) and the music bus sits under
 * the sound effects.
 */
type Note = { freq: number; type?: OscillatorType; gain?: number; beats?: number; lpf?: number };
type Layer = (Note | null)[];

const N: Record<string, number> = {
  A2: 110, D3: 146.83, E3: 164.81, G2: 98, C3: 130.81, B2: 123.47, F3: 174.61, G3: 196, A3: 220, B3: 246.94,
  C4: 261.63, D4: 293.66, E4: 329.63, F4: 349.23, G4: 392, A4: 440, B4: 493.88, C5: 523.25, D5: 587.33, E5: 659.25,
};

/** "A3 . . C4" → one step per token, "." = rest. */
function seq(pattern: string, o: Omit<Note, "freq">): Layer {
  return pattern.trim().split(/\s+/).map((tok) => (tok === "." ? null : { freq: N[tok] ?? 0, ...o }));
}

function sequencer(ctx: AudioContext, dest: AudioNode, layers: Layer[], bpm: number, stepsPerBeat = 2): { stop(): void } {
  const step = 60 / bpm / stepsPerBeat;
  let next = ctx.currentTime + 0.08;
  let index = 0;
  let stopped = false;
  const voices = new Set<OscillatorNode>();
  const tick = (): void => {
    if (stopped) return;
    while (next < ctx.currentTime + 0.1) {
      for (const layer of layers) {
        const note = layer[index % layer.length];
        if (!note || note.freq <= 0) continue;
        const len = (note.beats ?? 1) * step;
        const osc = ctx.createOscillator();
        osc.type = note.type ?? "triangle";
        osc.frequency.setValueAtTime(note.freq, next);
        const g = ctx.createGain();
        const peak = note.gain ?? 0.1;
        g.gain.setValueAtTime(0.0001, next);
        g.gain.exponentialRampToValueAtTime(peak, next + Math.min(0.06, len * 0.3));
        g.gain.exponentialRampToValueAtTime(0.0001, next + len * 0.95);
        const f = ctx.createBiquadFilter();
        f.type = "lowpass";
        f.frequency.setValueAtTime(note.lpf ?? 2400, next);
        osc.connect(f).connect(g).connect(dest);
        osc.start(next);
        osc.stop(next + len);
        voices.add(osc);
        osc.onended = () => voices.delete(osc);
      }
      next += step;
      index++;
    }
  };
  const id = window.setInterval(tick, 25);
  tick();
  return {
    stop() {
      stopped = true;
      window.clearInterval(id);
      for (const v of voices) {
        try {
          v.stop();
        } catch {
          /* already stopped */
        }
      }
      voices.clear();
    },
  };
}

/**
 * Lounge loop, 92 BPM, eighth-note steps, 4 bars: Am7 | Dm9 | G7 | Cmaj7.
 * Soft pad chords, a walking bass, and a sparse vibraphone-like line with plenty of rests.
 */
export function loungeBgm(ctx: AudioContext, out: AudioNode): { stop(): void } {
  const pad = { type: "triangle" as const, gain: 0.07, beats: 8, lpf: 1400 };
  const padLow = seq("A3 . . . . . . .  D4 . . . . . . .  B3 . . . . . . .  B3 . . . . . . .", pad);
  const padMid = seq("C4 . . . . . . .  F4 . . . . . . .  D4 . . . . . . .  E4 . . . . . . .", pad);
  const padTop = seq("E4 . . . . . . .  A4 . . . . . . .  F4 . . . . . . .  G4 . . . . . . .", pad);
  const bass = seq("A2 . E3 . A2 . G2 .  D3 . A2 . D3 . F3 .  G2 . D3 . G2 . B2 .  C3 . G2 . C3 . E3 .", { type: "sine", gain: 0.2, beats: 1.6, lpf: 900 });
  const lead = seq("E5 . . C5 . . A4 .  . . . . F4 . A4 .  D5 . . B4 . . G4 .  . . E4 . . . . .", { type: "sine", gain: 0.11, beats: 2.5, lpf: 3000 });
  const shimmer = seq("A4 . . . . . . .  . . . . . . . .  B4 . . . . . . .  . . . . . . . .", { type: "sine", gain: 0.04, beats: 6, lpf: 5000 });
  return sequencer(ctx, out, [padLow, padMid, padTop, bass, lead, shimmer], 92);
}
