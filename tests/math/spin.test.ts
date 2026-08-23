import { describe, expect, it } from 'vitest';
import { GAME_CONFIG } from '@config/game.config';
import { buySpin, buyCostCoins } from '@math/buy';
import { gridFromStops } from '@math/grid';
import { spin } from '@math/spin';
import type { SpinOutcome, SpinResult } from '@math/types';

const cfg = GAME_CONFIG;
const CAP = cfg.maxWinX * cfg.coinsPerBet;
const W = cfg.symbols.W.code;
const S = cfg.symbols.S.code;

function checkSpinResult(r: SpinResult, strips: readonly (readonly number[])[]): void {
  expect(r.stops).toHaveLength(5);
  expect(r.grid).toEqual(gridFromStops(strips, r.stops, 3));
  // Wild never on reel 1.
  expect(r.grid[0]?.includes(W)).toBe(false);
  // ≤ 1 scatter per reel.
  for (const col of r.grid) expect(col.filter((c) => c === S).length).toBeLessThanOrEqual(1);
  // Scatter bookkeeping.
  const scatters = r.grid.flatMap((col, reel) => col.map((c, row) => (c === S ? [reel, row] : null)).filter(Boolean));
  expect(r.scatter.count).toBe(scatters.length);
  expect(r.scatter.positions).toEqual(scatters);
  expect(r.scatter.pay).toBe(r.scatter.count >= 3 ? cfg.scatterPays[(Math.min(r.scatter.count, 5) - 3) as 0 | 1 | 2] : 0);
  // Win bookkeeping.
  let sum = r.scatter.pay;
  for (const w of r.wins) {
    expect(w.win).toBe(w.ways * w.payPerWay);
    expect(w.payPerWay).toBe(cfg.paytable[w.symbol][w.length - 3]);
    expect(w.positions.length).toBeGreaterThanOrEqual(w.length);
    for (const [reel, row] of w.positions) {
      const c = r.grid[reel]?.[row];
      expect(c === cfg.symbols[w.symbol].code || c === W).toBe(true);
      expect(reel).toBeLessThan(w.length);
    }
    sum += w.win;
  }
  expect(r.lineWinCoins).toBe(sum);
  expect(r.totalWinCoins).toBeLessThanOrEqual(r.lineWinCoins * r.multiplier);
  expect(r.triggersSpins).toBe(r.scatter.count >= 3 ? cfg.freeSpins.awards[Math.min(r.scatter.count, 5) as 3 | 4 | 5] : 0);
}

function checkOutcome(o: SpinOutcome): void {
  expect(o.configVersion).toBe(cfg.version);
  checkSpinResult(o.base, cfg.strips.base);
  expect(o.base.multiplier).toBe(1);
  if (o.kind === 'base') expect(o.feature !== null).toBe(o.base.scatter.count >= 3 && !o.capped);
  let total = o.base.totalWinCoins;
  if (o.feature) {
    const f = o.feature;
    let spinsExpected = f.spinsAwarded;
    let cumulative = o.base.totalWinCoins;
    f.spins.forEach((s, i) => {
      expect(s.index).toBe(i);
      checkSpinResult(s, cfg.strips.free);
      expect(s.multiplier).toBe(s.meterBefore);
      cumulative += s.totalWinCoins;
      spinsExpected += s.retriggerSpins;
      if (i > 0) expect(s.meterBefore).toBe(f.spins[i - 1]?.meterAfter);
    });
    expect(f.spins[0]?.meterBefore).toBe(f.meter.start);
    expect(f.meterEnd).toBe(f.spins[f.spins.length - 1]?.meterAfter);
    expect(f.totalWinCoins).toBe(f.spins.reduce((a, s) => a + s.totalWinCoins, 0));
    if (f.endedByCap) {
      expect(cumulative).toBe(CAP);
      expect(o.capped).toBe(true);
    } else {
      expect(f.spins).toHaveLength(spinsExpected);
      expect(cumulative).toBeLessThan(CAP);
    }
    total += f.totalWinCoins;
  }
  expect(o.totalWinCoins).toBe(total);
  expect(o.totalWinCoins).toBeLessThanOrEqual(CAP);
  if (!o.capped) expect(o.totalWinCoins).toBeLessThan(CAP);
}

describe('spin()', () => {
  it('is deterministic for the same seed and nonce', () => {
    for (let n = 0; n < 50; n++) {
      expect(spin(cfg, 'determinism', n)).toEqual(spin(cfg, 'determinism', n));
    }
  });

  it('changes with the nonce and with the seed', () => {
    const a = spin(cfg, 'seed', 1);
    const b = spin(cfg, 'seed', 2);
    const c = spin(cfg, 'other-seed', 1);
    expect(a.base.stops).not.toEqual(b.base.stops);
    expect(a.base.stops).not.toEqual(c.base.stops);
    expect(a.nonce).toBe(1);
    expect(a.seed).toBe('seed');
    expect(a.kind).toBe('base');
  });

  it('returns internally consistent outcomes over 5,000 spins', () => {
    let features = 0;
    for (let n = 0; n < 5000; n++) {
      const o = spin(cfg, 'invariants', n);
      checkOutcome(o);
      if (o.feature) features++;
    }
    expect(features).toBeGreaterThan(5); // ~22 expected at 1 in 230
  });

  it('never mutates the config', () => {
    const snapshot = JSON.stringify(cfg);
    for (let n = 0; n < 200; n++) spin(cfg, 'immutability', n);
    expect(JSON.stringify(cfg)).toBe(snapshot);
  });
});

describe('buySpin()', () => {
  it('costs the configured multiple of the bet', () => {
    expect(buyCostCoins(cfg, 'free')).toBe(cfg.buy.free.costX * cfg.coinsPerBet);
    expect(buyCostCoins(cfg, 'super')).toBe(cfg.buy.super.costX * cfg.coinsPerBet);
  });

  it('free tier always triggers with ≥ 3 scatters and the normal meter', () => {
    for (let n = 0; n < 300; n++) {
      const o = buySpin(cfg, 'buy', n, 'free');
      expect(o.kind).toBe('buyFree');
      expect(o.base.scatter.count).toBeGreaterThanOrEqual(3);
      expect(o.feature).not.toBeNull();
      expect(o.feature?.tier).toBe('free');
      expect(o.feature?.spinsAwarded).toBe(cfg.freeSpins.awards[Math.min(o.base.scatter.count, 5) as 3 | 4 | 5]);
      expect(o.feature?.meter).toEqual(cfg.freeSpins.meter);
      checkOutcome(o);
    }
  });

  it('super tier forces exactly 3 scatters, fixed spins and the super meter', () => {
    for (let n = 0; n < 300; n++) {
      const o = buySpin(cfg, 'super', n, 'super');
      expect(o.kind).toBe('buySuper');
      expect(o.base.scatter.count).toBe(3);
      expect(o.feature?.tier).toBe('super');
      expect(o.feature?.spinsAwarded).toBe(cfg.buy.super.spins);
      expect(o.feature?.meter).toEqual(cfg.buy.super.meter);
      expect(o.feature?.spins[0]?.meterBefore).toBe(cfg.buy.super.meter.start);
      checkOutcome(o);
    }
  });

  it('is deterministic', () => {
    expect(buySpin(cfg, 'd', 3, 'free')).toEqual(buySpin(cfg, 'd', 3, 'free'));
    expect(buySpin(cfg, 'd', 3, 'super')).toEqual(buySpin(cfg, 'd', 3, 'super'));
  });
});
