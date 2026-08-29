import { contextFor } from './context';
import type { EvalContext } from './context';
import { resolveFeature } from './feature';
import { drawStops, gridFromStops } from './grid';
import { rngFor } from './rng';
import type { Rng } from './rng';
import type { FeatureOutcome, GameConfig, MeterRules, SpinKind, SpinOutcome, SpinResult } from './types';
import { evaluateGrid, spinsForScatters } from './ways';

/** Evaluate a base-strip spin for the given stops (no feature resolution). */
export function baseSpinFromStops(ctx: EvalContext, stops: readonly number[]): SpinResult {
  const strips = ctx.config.strips.base;
  const grid = gridFromStops(strips, stops, ctx.rows);
  const ev = evaluateGrid(ctx, grid);
  const total = Math.min(ev.lineWinCoins, ctx.capCoins);
  return {
    stops,
    grid,
    wins: ev.wins,
    scatter: ev.scatter,
    lineWinCoins: ev.lineWinCoins,
    multiplier: 1,
    totalWinCoins: total,
    triggersSpins: spinsForScatters(ctx, ev.scatter.count),
  };
}

/** Assemble a full round from a resolved base spin, resolving the feature if triggered. */
export function finishRound(
  ctx: EvalContext,
  rng: Rng,
  seed: string,
  nonce: number,
  kind: SpinKind,
  base: SpinResult,
  forced?: { readonly tier: 'free' | 'super'; readonly spins: number; readonly meter: MeterRules },
): SpinOutcome {
  let feature: FeatureOutcome | null = null;
  let capped = base.totalWinCoins < base.lineWinCoins;

  const baseTriggered = base.triggersSpins > 0;
  if (forced || baseTriggered) {
    if (!capped) {
      feature = resolveFeature(ctx, rng, {
        tier: forced?.tier ?? 'free',
        spinsAwarded: forced?.spins ?? base.triggersSpins,
        meter: forced?.meter ?? ctx.config.freeSpins.meter,
        roundWinSoFar: base.totalWinCoins,
      });
      if (feature.endedByCap) capped = true;
    }
  }

  const totalWinCoins = base.totalWinCoins + (feature?.totalWinCoins ?? 0);
  return {
    configVersion: ctx.config.version,
    seed,
    nonce,
    kind,
    base,
    feature,
    totalWinCoins,
    capped,
  };
}

/**
 * The one entry point for a natural spin. Deterministic: same (config, seed, nonce) → identical outcome.
 * Returns the whole round: base spin plus every free spin if triggered.
 */
export function spin(config: GameConfig, seed: string, nonce: number): SpinOutcome {
  const ctx = contextFor(config);
  const rng = rngFor(seed, nonce);
  const stops = drawStops(rng, config.strips.base);
  const base = baseSpinFromStops(ctx, stops);
  return finishRound(ctx, rng, seed, nonce, 'base', base);
}
