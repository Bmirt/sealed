import { describe, expect, it } from 'vitest';
import { GAME_CONFIG } from '@config/game.config';
import { contextFor } from '@math/context';
import { resolveFeature } from '@math/feature';
import { rngFor } from '@math/rng';
import { assertValidConfig } from '@math/validate';
import { patternStrip, solidStrip, withStrips } from './helpers';

const CAP = GAME_CONFIG.maxWinX * GAME_CONFIG.coinsPerBet;

/** Every spin: exactly one L4 on reel 1, three on reels 2–5 → 81 ways × L4 5-oak. */
const steadyWin = [patternStrip(['L4', 'L1', 'L2']), solidStrip('L4'), solidStrip('L4'), solidStrip('L4'), solidStrip('L4')];
const STEADY_COINS = 81 * GAME_CONFIG.paytable.L4[2];

/** Never wins: reel 1 has no symbol that continues on reel 2. */
const neverWin = [solidStrip('L1'), solidStrip('H1'), solidStrip('H1'), solidStrip('H1'), solidStrip('H1')];

/** Five scatters every spin. */
const scatterStorm = Array.from({ length: 5 }, () => patternStrip(['S', 'L1', 'L2']));

describe('Dragonfire free spins', () => {
  it('applies the meter BEFORE stepping and steps every third winning spin', () => {
    const cfg = withStrips(GAME_CONFIG.strips.base, steadyWin);
    assertValidConfig(cfg);
    const f = resolveFeature(contextFor(cfg), rngFor('meter', 0), {
      tier: 'free',
      spinsAwarded: 10,
      meter: cfg.freeSpins.meter,
      roundWinSoFar: 0,
    });
    expect(f.spins).toHaveLength(10);
    expect(f.spins.map((s) => s.meterBefore)).toEqual([1, 1, 1, 2, 2, 2, 3, 3, 3, 4]);
    expect(f.spins.map((s) => s.meterAfter)).toEqual([1, 1, 2, 2, 2, 3, 3, 3, 4, 4]);
    expect(f.spins.map((s) => s.winsTowardStep)).toEqual([1, 2, 0, 1, 2, 0, 1, 2, 0, 1]);
    expect(f.spins.map((s) => s.totalWinCoins)).toEqual(f.spins.map((s) => STEADY_COINS * s.meterBefore));
    expect(f.totalWinCoins).toBe(STEADY_COINS * 22);
    expect(f.meterEnd).toBe(4);
    expect(f.endedByCap).toBe(false);
    expect(f.spins.map((s) => s.spinsRemainingAfter)).toEqual([9, 8, 7, 6, 5, 4, 3, 2, 1, 0]);
  });

  it('does not step the meter on non-winning spins', () => {
    const cfg = withStrips(GAME_CONFIG.strips.base, neverWin);
    const f = resolveFeature(contextFor(cfg), rngFor('dead', 0), {
      tier: 'free',
      spinsAwarded: 10,
      meter: cfg.freeSpins.meter,
      roundWinSoFar: 0,
    });
    expect(f.totalWinCoins).toBe(0);
    expect(f.meterEnd).toBe(1);
    expect(f.spins.every((s) => s.winsTowardStep === 0 && s.meterBefore === 1)).toBe(true);
  });

  it('super meter rules: start ×3, +2 on every win, capped at ×10', () => {
    const cfg = withStrips(GAME_CONFIG.strips.base, steadyWin);
    const f = resolveFeature(contextFor(cfg), rngFor('super', 0), {
      tier: 'super',
      spinsAwarded: 8,
      meter: { start: 3, winsPerStep: 1, step: 2, cap: 10 },
      roundWinSoFar: 0,
    });
    expect(f.spins.map((s) => s.meterBefore)).toEqual([3, 5, 7, 9, 10, 10, 10, 10]);
    expect(f.meterEnd).toBe(10);
  });

  it('retriggers add spins and the round cap ends the feature', () => {
    const cfg = withStrips(GAME_CONFIG.strips.base, scatterStorm);
    assertValidConfig(cfg);
    const f = resolveFeature(contextFor(cfg), rngFor('storm', 0), {
      tier: 'free',
      spinsAwarded: 10,
      meter: cfg.freeSpins.meter,
      roundWinSoFar: 0,
    });
    expect(f.endedByCap).toBe(true);
    expect(f.totalWinCoins).toBe(CAP);
    const first = f.spins[0];
    expect(first?.scatter.count).toBe(5);
    expect(first?.retriggerSpins).toBe(GAME_CONFIG.freeSpins.awards[5]);
    expect(first?.spinsRemainingAfter).toBe(10 - 1 + GAME_CONFIG.freeSpins.awards[5]);
    const last = f.spins[f.spins.length - 1];
    expect(last?.spinsRemainingAfter).toBe(0);
    expect(last?.retriggerSpins).toBe(0); // no retrigger on the capping spin
    // Every win is paid in full except the last, which is clipped to the cap.
    const sumBeforeLast = f.spins.slice(0, -1).reduce((a, s) => a + s.totalWinCoins, 0);
    expect(sumBeforeLast).toBeLessThan(CAP);
    expect(sumBeforeLast + (last?.totalWinCoins ?? 0)).toBe(CAP);
  });

  it('counts the base spin toward the round cap', () => {
    const cfg = withStrips(GAME_CONFIG.strips.base, scatterStorm);
    const f = resolveFeature(contextFor(cfg), rngFor('storm', 1), {
      tier: 'free',
      spinsAwarded: 10,
      meter: cfg.freeSpins.meter,
      roundWinSoFar: CAP - 500,
    });
    expect(f.spins).toHaveLength(1);
    expect(f.totalWinCoins).toBe(500);
    expect(f.endedByCap).toBe(true);
  });

  it('respects retrigger=false', () => {
    const cfg = withStrips(GAME_CONFIG.strips.base, scatterStorm, {
      freeSpins: { ...GAME_CONFIG.freeSpins, retrigger: false },
    });
    const f = resolveFeature(contextFor(cfg), rngFor('storm', 2), {
      tier: 'free',
      spinsAwarded: 5,
      meter: cfg.freeSpins.meter,
      roundWinSoFar: 0,
    });
    expect(f.spins).toHaveLength(5);
    expect(f.spins.every((s) => s.retriggerSpins === 0)).toBe(true);
  });
});
