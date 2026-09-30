/**
 * Crash maths. Pure functions, no rendering.
 *
 * Crash point C = max(1.00, floor(97 / (1 - U)) / 100), U uniform in [0, 1):
 * P(C >= x) = 0.97 / x for x >= 1, so any cash-out target returns 97% on average.
 * About 4% of dives implode at 1.00x (every raw value below 1.01 floors to 1.00), which keeps
 * P(C >= x) = 0.97 / x exact at every 2-decimal target.
 */
export const HOUSE_EDGE = 0.03;
/** Multiplier growth per second: m(t) = e^(GROWTH * t). 2x at ~8.2 s, 10x at ~27 s. */
export const GROWTH = 0.085;
/** Depth in metres for a multiplier: constant descent speed, 320 * ln(m) (~27 m/s). */
export const METRES_PER_LN = 320;
export const MAX_MULTIPLIER = 10_000;

export function crashPoint(u: number): number {
  const raw = Math.floor((100 * (1 - HOUSE_EDGE)) / (1 - u)) / 100;
  return Math.min(MAX_MULTIPLIER, Math.max(1, raw));
}

export function multiplierAt(seconds: number): number {
  return Math.exp(GROWTH * Math.max(0, seconds));
}

/** Seconds of diving until the multiplier reaches m. */
export function timeToReach(m: number): number {
  return Math.log(Math.max(1, m)) / GROWTH;
}

export function depthFor(m: number): number {
  return METRES_PER_LN * Math.log(Math.max(1, m));
}

/** Multipliers are shown and paid floored to 2 decimals, like every crash game. */
export function floorMultiplier(m: number): number {
  return Math.floor(m * 100 + 1e-9) / 100;
}

export function payoutCents(stakeCents: number, m: number): number {
  return Math.floor(stakeCents * floorMultiplier(m));
}

export type Zone = { name: string; from: number };
export const ZONES: readonly Zone[] = [
  { name: 'Sunlit zone', from: 0 }, // to ~1.6x
  { name: 'Twilight zone', from: 150 }, // ~1.6x to ~6.5x
  { name: 'Midnight zone', from: 600 }, // ~6.5x to ~58x
  { name: 'Abyss', from: 1300 }, // ~58x and deeper
];

export function zoneFor(depth: number): Zone {
  let zone = ZONES[0]!;
  for (const z of ZONES) if (depth >= z.from) zone = z;
  return zone;
}
