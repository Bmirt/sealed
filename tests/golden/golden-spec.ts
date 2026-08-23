/**
 * Shared definition of the golden cases (used by the test and by `pnpm golden:update`).
 */
import { buySpin } from '../../src/math/buy';
import { spin } from '../../src/math/spin';
import type { GameConfig, SpinOutcome } from '../../src/math/types';

export interface GoldenCase {
  readonly id: string;
  readonly seed: string;
  readonly nonce: number;
  readonly kind: 'base' | 'buyFree' | 'buySuper';
}

export interface GoldenFile {
  readonly configVersion: string;
  readonly cases: readonly { readonly id: string; readonly outcome: SpinOutcome }[];
  /** FNV-1a digest over a long run of outcomes — cheap drift detection without huge fixtures. */
  readonly digest: { readonly seed: string; readonly spins: number; readonly value: string };
}

export const GOLDEN_CASES: readonly GoldenCase[] = [
  ...Array.from({ length: 20 }, (_, i) => ({ id: `base-${i}`, seed: 'golden-base', nonce: i, kind: 'base' as const })),
  ...Array.from({ length: 5 }, (_, i) => ({ id: `buy-${i}`, seed: 'golden-buy', nonce: i, kind: 'buyFree' as const })),
  ...Array.from({ length: 5 }, (_, i) => ({ id: `super-${i}`, seed: 'golden-super', nonce: i, kind: 'buySuper' as const })),
];

export const DIGEST_SEED = 'golden-digest';
export const DIGEST_SPINS = 20_000;

export function runCase(config: GameConfig, c: GoldenCase): SpinOutcome {
  if (c.kind === 'base') return spin(config, c.seed, c.nonce);
  return buySpin(config, c.seed, c.nonce, c.kind === 'buyFree' ? 'free' : 'super');
}

/** FNV-1a (32-bit, folded into a hex string) over the stops and total win of every spin. */
export function digest(config: GameConfig, seed: string, spins: number): string {
  let h = 0x811c9dc5;
  const mix = (v: number): void => {
    h ^= v & 0xff;
    h = Math.imul(h, 0x01000193) >>> 0;
    h ^= (v >>> 8) & 0xff;
    h = Math.imul(h, 0x01000193) >>> 0;
    h ^= (v >>> 16) & 0xff;
    h = Math.imul(h, 0x01000193) >>> 0;
    h ^= (v >>> 24) & 0xff;
    h = Math.imul(h, 0x01000193) >>> 0;
  };
  for (let n = 0; n < spins; n++) {
    const o = spin(config, seed, n);
    for (const s of o.base.stops) mix(s);
    mix(o.totalWinCoins);
    if (o.feature) {
      mix(o.feature.spins.length);
      mix(o.feature.meterEnd);
      for (const fs of o.feature.spins) {
        for (const s of fs.stops) mix(s);
        mix(fs.totalWinCoins);
      }
    }
  }
  return h.toString(16).padStart(8, '0');
}
