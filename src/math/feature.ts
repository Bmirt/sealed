import type { EvalContext } from './context';
import { drawStops, gridFromStops } from './grid';
import type { Rng } from './rng';
import type { FeatureOutcome, FeatureTier, FreeSpinResult, MeterRules } from './types';
import { evaluateGrid, spinsForScatters } from './ways';

export interface FeatureInput {
  readonly tier: FeatureTier;
  readonly spinsAwarded: number;
  readonly meter: MeterRules;
  /** Coins already won in this round (the triggering base spin). Used for the round cap. */
  readonly roundWinSoFar: number;
}

/**
 * Resolve a whole Dragonfire Free Spins feature on the free strip set.
 *
 * Meter rule: a spin's win is multiplied by `meterBefore`. If the spin's unmultiplied win > 0 the
 * step counter increments; on reaching `winsPerStep` the meter steps (capped) and the counter resets.
 * Retriggers add spins immediately. The round cap ends the feature the moment it is reached.
 */
export function resolveFeature(ctx: EvalContext, rng: Rng, input: FeatureInput): FeatureOutcome {
  const { config, rows, capCoins } = ctx;
  const strips = config.strips.free;
  const meterCfg = input.meter;

  const spins: FreeSpinResult[] = [];
  let remaining = input.spinsAwarded;
  let meter = meterCfg.start;
  let winsTowardStep = 0;
  let featureWin = 0;
  let roundWin = input.roundWinSoFar;
  let endedByCap = false;
  let index = 0;

  while (remaining > 0) {
    remaining--;
    const stops = drawStops(rng, strips);
    const grid = gridFromStops(strips, stops, rows);
    const ev = evaluateGrid(ctx, grid);

    const meterBefore = meter;
    let total = ev.lineWinCoins * meterBefore;

    // Round cap.
    if (roundWin + total >= capCoins) {
      total = Math.max(0, capCoins - roundWin);
      endedByCap = true;
    }
    featureWin += total;
    roundWin += total;

    // Retrigger.
    let retriggerSpins = 0;
    if (config.freeSpins.retrigger && !endedByCap) {
      retriggerSpins = spinsForScatters(ctx, ev.scatter.count);
      remaining += retriggerSpins;
    }

    // Meter step (only on a genuine win, after the win is paid).
    let meterAfter = meter;
    if (ev.lineWinCoins > 0 && !endedByCap) {
      winsTowardStep++;
      if (winsTowardStep >= meterCfg.winsPerStep) {
        winsTowardStep = 0;
        meterAfter = Math.min(meterCfg.cap, meter + meterCfg.step);
      }
    }
    meter = meterAfter;

    if (endedByCap) remaining = 0;

    spins.push({
      index,
      stops,
      grid,
      wins: ev.wins,
      scatter: ev.scatter,
      lineWinCoins: ev.lineWinCoins,
      multiplier: meterBefore,
      totalWinCoins: total,
      triggersSpins: retriggerSpins,
      spinsRemainingAfter: remaining,
      meterBefore,
      meterAfter,
      winsTowardStep,
      retriggerSpins,
    });
    index++;
  }

  return {
    tier: input.tier,
    spinsAwarded: input.spinsAwarded,
    meter: meterCfg,
    spins,
    totalWinCoins: featureWin,
    meterEnd: meter,
    endedByCap,
  };
}
