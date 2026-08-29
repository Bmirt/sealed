import type { EvalContext } from './context';
import type { Cell, PayingSymbolId, ScatterResult, SymbolCode, WayWin } from './types';

export interface GridEvaluation {
  readonly wins: WayWin[];
  readonly scatter: ScatterResult;
  /** Sum of way wins + scatter pay (no multiplier). */
  readonly lineWinCoins: number;
}

/**
 * 243-ways evaluation.
 *
 * For each paying symbol: count_r = cells on reel r equal to the symbol or wild.
 * length = consecutive reels from reel 0 with count_r ≥ 1; ways = Π count_r; pay if length ≥ 3.
 * Wild is never placed on reel 0 (validated), so every way has exactly one paying symbol and
 * no two symbols can claim the same way.
 */
export function evaluateGrid(ctx: EvalContext, grid: readonly (readonly SymbolCode[])[]): GridEvaluation {
  const { reels, rows, wildCode, scatterCode } = ctx;
  const wins: WayWin[] = [];
  let lineWinCoins = 0;

  for (const code of ctx.payingCodes) {
    // Fast pre-check: the symbol must appear on reel 0 (wild can't be there).
    const first = grid[0];
    if (!first) throw new Error('grid has no reel 0');
    let c0 = 0;
    for (let y = 0; y < rows; y++) if (first[y] === code) c0++;
    if (c0 === 0) continue;

    let ways = c0;
    let length = 1;
    for (let r = 1; r < reels; r++) {
      const col = grid[r];
      if (!col) throw new Error(`grid missing reel ${r}`);
      let c = 0;
      for (let y = 0; y < rows; y++) {
        const s = col[y];
        if (s === code || s === wildCode) c++;
      }
      if (c === 0) break;
      ways *= c;
      length++;
    }
    if (length < 3) continue;

    const payLine = ctx.pay[code];
    const payPerWay = payLine?.[length - 3] ?? 0;
    if (payPerWay <= 0) continue;

    const positions: Cell[] = [];
    for (let r = 0; r < length; r++) {
      const col = grid[r];
      if (!col) continue;
      for (let y = 0; y < rows; y++) {
        const s = col[y];
        if (s === code || s === wildCode) positions.push([r, y]);
      }
    }

    const win = ways * payPerWay;
    lineWinCoins += win;
    const symbol = ctx.codeToId[code];
    if (!symbol || symbol === 'W' || symbol === 'S') throw new Error(`code ${code} is not a paying symbol`);
    wins.push({
      symbol: symbol as PayingSymbolId,
      length: length as 3 | 4 | 5,
      ways,
      payPerWay,
      win,
      positions,
    });
  }

  // Scatters anywhere.
  const scatterPositions: Cell[] = [];
  for (let r = 0; r < reels; r++) {
    const col = grid[r];
    if (!col) continue;
    for (let y = 0; y < rows; y++) if (col[y] === scatterCode) scatterPositions.push([r, y]);
  }
  const count = scatterPositions.length;
  let scatterPay = 0;
  if (count >= 3) {
    const idx = Math.min(count, 5) - 3;
    scatterPay = ctx.config.scatterPays[idx as 0 | 1 | 2];
  }
  lineWinCoins += scatterPay;

  return {
    wins,
    scatter: { count, positions: scatterPositions, pay: scatterPay },
    lineWinCoins,
  };
}

/** Spins awarded for a scatter count (0 if below the trigger threshold). */
export function spinsForScatters(ctx: EvalContext, count: number): number {
  if (count < 3) return 0;
  const awards = ctx.config.freeSpins.awards;
  const key = Math.min(count, 5) as 3 | 4 | 5;
  return awards[key];
}
