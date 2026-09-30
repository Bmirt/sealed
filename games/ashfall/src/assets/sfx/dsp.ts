/**
 * Small Web-Audio synthesis helpers. Every sound in the game is rendered offline through these -
 * no audio files anywhere. All functions build nodes into an OfflineAudioContext.
 */

export function env(ctx: OfflineAudioContext, at: number, attack: number, decay: number, peak = 1, sustainLevel = 0, release = 0): GainNode {
  const g = ctx.createGain();
  g.gain.setValueAtTime(0, at);
  g.gain.linearRampToValueAtTime(peak, at + attack);
  if (release > 0) {
    g.gain.linearRampToValueAtTime(sustainLevel * peak, at + attack + decay);
    g.gain.exponentialRampToValueAtTime(0.0001, at + attack + decay + release);
  } else {
    g.gain.exponentialRampToValueAtTime(0.0001, at + attack + Math.max(0.01, decay));
  }
  return g;
}

export function osc(ctx: OfflineAudioContext, type: OscillatorType, freq: number, at: number, dur: number, detune = 0): OscillatorNode {
  const o = ctx.createOscillator();
  o.type = type;
  o.frequency.setValueAtTime(freq, at);
  o.detune.value = detune;
  o.start(at);
  o.stop(at + dur + 0.05);
  return o;
}

/** Deterministic noise buffer (xorshift - same seed, same noise). */
export function noiseBuffer(ctx: OfflineAudioContext, seconds: number, seed = 1234567): AudioBuffer {
  const buf = ctx.createBuffer(1, Math.ceil(seconds * ctx.sampleRate), ctx.sampleRate);
  const data = buf.getChannelData(0);
  let s = seed >>> 0 || 1;
  for (let i = 0; i < data.length; i++) {
    s ^= s << 13;
    s >>>= 0;
    s ^= s >>> 17;
    s ^= s << 5;
    s >>>= 0;
    data[i] = (s / 2147483648 - 1) * 0.999;
  }
  return buf;
}

export function noise(ctx: OfflineAudioContext, at: number, dur: number, seed?: number): AudioBufferSourceNode {
  const src = ctx.createBufferSource();
  src.buffer = noiseBuffer(ctx, dur + 0.1, seed);
  src.start(at);
  src.stop(at + dur + 0.05);
  return src;
}

export function filter(ctx: OfflineAudioContext, type: BiquadFilterType, freq: number, q = 1): BiquadFilterNode {
  const f = ctx.createBiquadFilter();
  f.type = type;
  f.frequency.value = freq;
  f.Q.value = q;
  return f;
}

/** A pitched drum: sine with a fast downward pitch sweep. */
export function drum(ctx: OfflineAudioContext, out: AudioNode, at: number, freq: number, drop: number, dur: number, gain = 1): void {
  const o = ctx.createOscillator();
  o.type = 'sine';
  o.frequency.setValueAtTime(freq, at);
  o.frequency.exponentialRampToValueAtTime(Math.max(20, freq - drop), at + dur * 0.8);
  const g = env(ctx, at, 0.004, dur, gain);
  o.connect(g).connect(out);
  o.start(at);
  o.stop(at + dur + 0.05);
}

/** Inharmonic bell: a handful of decaying partials. */
export function bell(ctx: OfflineAudioContext, out: AudioNode, at: number, base: number, dur: number, gain = 1, partials: readonly [number, number][] = [[1, 1], [2.76, 0.5], [5.4, 0.28], [8.9, 0.12]]): void {
  const nyquist = ctx.sampleRate * 0.45;
  for (const [ratio, amp] of partials) {
    const freq = base * ratio;
    if (freq >= nyquist) continue;
    const o = osc(ctx, 'sine', freq, at, dur);
    const g = env(ctx, at, 0.004, dur * (1 - ratio / 22), gain * amp * 0.5);
    o.connect(g).connect(out);
  }
}

/** Stone / metallic hit: bandpassed noise burst + a body thump. */
export function clack(ctx: OfflineAudioContext, out: AudioNode, at: number, centre: number, dur: number, gain = 1, seed = 77): void {
  const n = noise(ctx, at, dur, seed);
  const f = filter(ctx, 'bandpass', centre, 2.2);
  const g = env(ctx, at, 0.002, dur, gain);
  n.connect(f).connect(g).connect(out);
}

/** Saw-stack pad/brass voice with slight detune. */
export function stack(ctx: OfflineAudioContext, out: AudioNode, at: number, freq: number, dur: number, attack: number, gain = 1, voices = 3): void {
  for (let v = 0; v < voices; v++) {
    const o = osc(ctx, 'sawtooth', freq, at, dur, (v - (voices - 1) / 2) * 9);
    const g = env(ctx, at, attack, dur - attack, (gain * 0.4) / voices, 0.6, dur * 0.35);
    const lp = filter(ctx, 'lowpass', freq * 6, 0.6);
    o.connect(lp).connect(g).connect(out);
  }
}

/** FM growl (dragon). */
export function growl(ctx: OfflineAudioContext, out: AudioNode, at: number, dur: number, gain = 1): void {
  const carrier = ctx.createOscillator();
  carrier.type = 'sawtooth';
  carrier.frequency.setValueAtTime(82, at);
  carrier.frequency.linearRampToValueAtTime(60, at + dur);
  const mod = ctx.createOscillator();
  mod.type = 'square';
  mod.frequency.setValueAtTime(31, at);
  mod.frequency.linearRampToValueAtTime(19, at + dur);
  const modGain = ctx.createGain();
  modGain.gain.value = 55;
  mod.connect(modGain).connect(carrier.frequency);
  const body = filter(ctx, 'lowpass', 900, 1.4);
  const g = env(ctx, at, 0.06, dur * 0.5, gain, 0.7, dur * 0.5);
  carrier.connect(body).connect(g).connect(out);
  carrier.start(at);
  carrier.stop(at + dur + 0.05);
  mod.start(at);
  mod.stop(at + dur + 0.05);
  // Breath noise on top.
  const n = noise(ctx, at, dur, 4242);
  const nf = filter(ctx, 'bandpass', 520, 0.8);
  const ng = env(ctx, at, 0.09, dur * 0.6, gain * 0.5, 0.5, dur * 0.4);
  n.connect(nf).connect(ng).connect(out);
}

/** Whoosh: bandpass-swept noise. */
export function whoosh(ctx: OfflineAudioContext, out: AudioNode, at: number, dur: number, from: number, to: number, gain = 1, seed = 999): void {
  const n = noise(ctx, at, dur, seed);
  const f = ctx.createBiquadFilter();
  f.type = 'bandpass';
  f.Q.value = 1.1;
  f.frequency.setValueAtTime(from, at);
  f.frequency.exponentialRampToValueAtTime(to, at + dur);
  const g = env(ctx, at, dur * 0.25, dur * 0.55, gain, 0.4, dur * 0.2);
  n.connect(f).connect(g).connect(out);
}
