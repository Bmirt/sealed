import { contextFor } from './context';
import { drawStops } from './grid';
import { rngFor } from './rng';
import { baseSpinFromStops, finishRound } from './spin';
import type { FeatureTier, GameConfig, SpinOutcome } from './types';

const MAX_ATTEMPTS = 1_000_000;

/** Cost of a bought feature in coins (multiple of the total bet). */
export function buyCostCoins(config: GameConfig, tier: FeatureTier): number {
  const costX = tier === 'free' ? config.buy.free.costX : config.buy.super.costX;
  return costX * config.coinsPerBet;
}

/**
 * Buy a feature. Deterministic rejection sampling of base-strip stops until the triggering
 * condition is met, so the bought feature's scatter distribution matches a natural trigger.
 *  - 'free'  : ≥ minScatters scatters, spins by the awards table, meter at its normal start.
 *  - 'super' : exactly 3 scatters, fixed spin count, meter starts at `meterStart`.
 */
export function buySpin(config: GameConfig, seed: string, nonce: number, tier: FeatureTier): SpinOutcome {
  const ctx = contextFor(config);
  const rng = rngFor(seed, nonce);

  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    const stops = drawStops(rng, config.strips.base);
    const base = baseSpinFromStops(ctx, stops);
    const n = base.scatter.count;
    if (tier === 'free') {
      if (n >= config.buy.free.minScatters) {
        return finishRound(ctx, rng, seed, nonce, 'buyFree', base);
      }
    } else if (n === 3) {
      return finishRound(ctx, rng, seed, nonce, 'buySuper', base, {
        tier: 'super',
        spins: config.buy.super.spins,
        meter: config.buy.super.meter,
      });
    }
  }
  throw new Error('buySpin: could not find a triggering spin — check scatter placement on the base strips');
}
