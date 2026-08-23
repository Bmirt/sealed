import type { GameConfig } from '@math/types';
import { BASE_STRIPS, FREE_STRIPS } from './strips';
import { SYMBOLS } from './symbols';

/**
 * THE game configuration. Every maths-affecting number lives here (or in the generated strips).
 * Bump `version` whenever any of it changes, then run `pnpm golden:update` and `pnpm sim`
 * and copy the measured RTPs into `rtp.declared*`.
 */
export const GAME_CONFIG: GameConfig = {
  id: 'ashfall-dynasty',
  version: '1.0.0',
  layout: { reels: 5, rows: 3 },
  coinsPerBet: 20,
  // Every level × 100 must divide by coinsPerBet so coin values are whole cents.
  betLevels: [0.2, 0.4, 1, 2, 5, 10, 20, 50, 100],
  defaultBetIndex: 2,
  symbols: SYMBOLS,
  wild: { id: 'W', reels: [false, true, true, true, true] },
  scatter: { id: 'S' },
  // coins per way; total bet = 20 coins
  paytable: {
    H1: [20, 65, 160],
    H2: [16, 50, 120],
    H3: [12, 40, 100],
    M1: [10, 25, 60],
    M2: [8, 22, 55],
    L1: [5, 12, 25],
    L2: [5, 12, 25],
    L3: [3, 9, 22],
    L4: [3, 9, 22],
  },
  // total (not per way) for 3 / 4 / 5 scatters anywhere
  scatterPays: [40, 200, 1000],
  strips: { base: BASE_STRIPS, free: FREE_STRIPS },
  freeSpins: {
    awards: { 3: 10, 4: 15, 5: 20 },
    retrigger: true,
    meter: { start: 1, winsPerStep: 3, step: 1, cap: 10 },
  },
  buy: {
    free: { costX: 100, minScatters: 3 },
    // Super: fewer spins; the meter starts at ×3 and jumps +2 on EVERY win (see README § Super Free Spins).
    super: { costX: 300, spins: 8, meter: { start: 3, winsPerStep: 1, step: 2, cap: 10 } },
  },
  maxWinX: 5000,
  rtp: {
    target: 0.965,
    // Measured: exact base-game RTP + (feature EV from a 200k bought-feature sim × trigger probability).
    // 1M-spin Monte-Carlo (seed "sim-2026") reads 96.46 %. Asserted by tests/math/rtp.test.ts.
    declaredBase: 0.9656,
    declaredBuyFree: 0.977,
    declaredBuySuper: 0.958,
  },
  features: {
    bonusBuy: { enabled: true, superTier: true },
    autoplay: { enabled: true, options: [10, 25, 50, 100] },
  },
};
