import { contextFor } from './context';
import type { GameConfig, PayingSymbolId, SymbolCode } from './types';

export interface ExactBaseRtp {
  /** Line (ways) RTP of the strip set, as a fraction of bet. */
  readonly lineRtp: number;
  /** Scatter-pay RTP, as a fraction of bet. */
  readonly scatterRtp: number;
  /** lineRtp + scatterRtp. */
  readonly total: number;
  /** Per-symbol contribution (fraction of bet). */
  readonly bySymbol: Readonly<Record<PayingSymbolId, number>>;
  /** P(exactly k scatters visible), k = 0..5. */
  readonly scatterDist: readonly number[];
  /** P(≥ 3 scatters) - feature trigger probability per spin. */
  readonly triggerProb: number;
}

/**
 * Closed-form expected pay for one spin on a strip set (reels independent, one uniform stop each).
 *
 * E[ways for symbol s of exactly n reels] = Π_{r<n} E[count_r] · P(count_n = 0)   (n < 5)
 * where count_r = cells on reel r showing s or wild. Because wilds never sit on reel 1, every way
 * belongs to exactly one symbol and the sum over symbols is exact.
 *
 * Does NOT include free-spin RTP (that is path dependent; use the sim).
 */
export function exactRtp(config: GameConfig, set: 'base' | 'free' = 'base'): ExactBaseRtp {
  const ctx = contextFor(config);
  const strips = config.strips[set];
  const { rows, reels, wildCode, scatterCode } = ctx;
  const coinsPerBet = config.coinsPerBet;

  // Per reel, per stop: window symbol counts.
  const windowCounts = (strip: readonly SymbolCode[], match: (c: SymbolCode) => boolean): number[] => {
    // returns distribution p[k] for k = 0..rows
    const p = new Array<number>(rows + 1).fill(0);
    for (let stop = 0; stop < strip.length; stop++) {
      let k = 0;
      for (let y = 0; y < rows; y++) {
        const c = strip[(stop + y) % strip.length];
        if (c !== undefined && match(c)) k++;
      }
      p[k] = (p[k] ?? 0) + 1 / strip.length;
    }
    return p;
  };

  const bySymbol: Partial<Record<PayingSymbolId, number>> = {};
  let lineCoins = 0;

  for (const id of Object.keys(config.paytable) as PayingSymbolId[]) {
    const code = config.symbols[id].code;
    const line = config.paytable[id];
    const expCount: number[] = [];
    const pZero: number[] = [];
    for (let r = 0; r < reels; r++) {
      const strip = strips[r];
      if (!strip) throw new Error(`missing strip ${r}`);
      const p = windowCounts(strip, (c) => c === code || (r > 0 && c === wildCode));
      let e = 0;
      for (let k = 0; k <= rows; k++) e += k * (p[k] ?? 0);
      expCount.push(e);
      pZero.push(p[0] ?? 0);
    }
    let coins = 0;
    for (let n = 3; n <= reels; n++) {
      let prod = 1;
      for (let r = 0; r < n; r++) prod *= expCount[r] ?? 0;
      const terminator = n < reels ? (pZero[n] ?? 0) : 1;
      coins += prod * terminator * (line[n - 3] ?? 0);
    }
    bySymbol[id] = coins / coinsPerBet;
    lineCoins += coins;
  }

  // Scatter distribution (Poisson-binomial over reels; ≤ 1 scatter per reel is validated).
  let dist: number[] = [1];
  for (let r = 0; r < reels; r++) {
    const strip = strips[r];
    if (!strip) throw new Error(`missing strip ${r}`);
    const p = windowCounts(strip, (c) => c === scatterCode);
    const q = 1 - (p[0] ?? 0);
    const next = new Array<number>(dist.length + 1).fill(0);
    dist.forEach((v, k) => {
      next[k] = (next[k] ?? 0) + v * (1 - q);
      next[k + 1] = (next[k + 1] ?? 0) + v * q;
    });
    dist = next;
  }
  let scatterCoins = 0;
  for (let k = 3; k <= reels; k++) scatterCoins += (dist[k] ?? 0) * config.scatterPays[(k - 3) as 0 | 1 | 2];
  const triggerProb = (dist[3] ?? 0) + (dist[4] ?? 0) + (dist[5] ?? 0);

  const lineRtp = lineCoins / coinsPerBet;
  const scatterRtp = scatterCoins / coinsPerBet;
  return {
    lineRtp,
    scatterRtp,
    total: lineRtp + scatterRtp,
    bySymbol: bySymbol as Record<PayingSymbolId, number>,
    scatterDist: dist,
    triggerProb,
  };
}
