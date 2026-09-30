/**
 * RTP lock. These sims are seeded, so they are deterministic - they fail only when the maths changes.
 * If you changed the maths on purpose: run `pnpm sim` (1M), update `rtp.declared*` in game.config.ts,
 * bump `version`, and run `pnpm golden:update`.
 */
import { describe, expect, it } from 'vitest';
import { GAME_CONFIG } from '@config/game.config';
import { exactRtp } from '@math/exact';
import { runSim } from '../../scripts/lib/sim-core';

const cfg = GAME_CONFIG;

describe('RTP', () => {
  it('exact base-game RTP matches the Monte-Carlo base part (300k spins)', () => {
    const exact = exactRtp(cfg, 'base');
    const sim = runSim(cfg, { spins: 300_000, seed: 'rtp-lock-base', mode: 'base' });
    expect(Math.abs(sim.rtpBase - exact.total)).toBeLessThan(0.01);
    expect(Math.abs(1 / sim.featureFrequency - exact.triggerProb) / exact.triggerProb).toBeLessThan(0.1);
  });

  it('total RTP (exact base + precise feature EV) matches the declared value within ±0.5 %', () => {
    const exact = exactRtp(cfg, 'base');
    // Feature EV per natural trigger, from 100k bought features (se ≈ 0.4× bet).
    const buy = runSim(cfg, { spins: 100_000, seed: 'rtp-lock-feature', mode: 'buy' });
    const featureEvX = buy.rtpFeature * cfg.buy.free.costX;
    const total = exact.total + featureEvX * exact.triggerProb;
    expect(Math.abs(total - cfg.rtp.declaredBase)).toBeLessThan(0.005);
    expect(Math.abs(total - cfg.rtp.target)).toBeLessThan(0.005);
    // And the bought feature itself.
    expect(Math.abs(buy.rtp - cfg.rtp.declaredBuyFree)).toBeLessThan(0.01);
  });

  it('super tier RTP matches the declared value within ±1.5 %', () => {
    const sup = runSim(cfg, { spins: 40_000, seed: 'rtp-lock-super', mode: 'super' });
    expect(Math.abs(sup.rtp - cfg.rtp.declaredBuySuper)).toBeLessThan(0.015);
  });

  it('profile: high volatility, hit rate ≈ 22 %, feature ≈ 1 in 230, max win reachable', () => {
    const sim = runSim(cfg, { spins: 300_000, seed: 'rtp-lock-profile', mode: 'base' });
    expect(sim.hitFrequency).toBeGreaterThan(0.19);
    expect(sim.hitFrequency).toBeLessThan(0.26);
    expect(sim.featureFrequency).toBeGreaterThan(190);
    expect(sim.featureFrequency).toBeLessThan(280);
    expect(sim.stdDevX).toBeGreaterThan(7); // high volatility
    // The 5,000× cap is reachable: the super tier hits it roughly 1 in 100k; the uncapped
    // distribution exceeds 1,500× in the base game within 300k spins.
    expect(sim.maxWinX).toBeGreaterThan(500);
  });
});
