import type { GameConfig, MeterRules, PayingSymbolId, SymbolId } from './types';

export interface ValidationIssue {
  readonly path: string;
  readonly message: string;
}

const ALL_IDS: readonly SymbolId[] = ['H1', 'H2', 'H3', 'M1', 'M2', 'L1', 'L2', 'L3', 'L4', 'W', 'S'];
const PAYING_IDS: readonly PayingSymbolId[] = ['H1', 'H2', 'H3', 'M1', 'M2', 'L1', 'L2', 'L3', 'L4'];

/**
 * Structural + maths-invariant checks. Returns every issue found (empty = valid).
 * Invariants that the evaluator relies on:
 *  - wild never on reel 0
 *  - ≤ 1 scatter visible per reel (no two scatters within `rows` positions on a strip, wrapping)
 *  - every strip long enough to be a sensible uniform draw
 */
export function validateConfig(config: GameConfig): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const push = (path: string, message: string): void => {
    issues.push({ path, message });
  };

  const { reels, rows } = config.layout;
  if (reels !== 5 || rows !== 3) push('layout', 'expected 5 reels × 3 rows');
  if (!Number.isInteger(config.coinsPerBet) || config.coinsPerBet <= 0) push('coinsPerBet', 'must be a positive integer');
  if (config.betLevels.length === 0) push('betLevels', 'must not be empty');
  config.betLevels.forEach((bet, i) => {
    const cents = Math.round(bet * 100);
    if (cents <= 0) push(`betLevels[${i}]`, 'must be positive');
    else if (cents % config.coinsPerBet !== 0) push(`betLevels[${i}]`, `${bet} × 100 cents is not divisible by coinsPerBet (${config.coinsPerBet})`);
  });
  if (config.defaultBetIndex < 0 || config.defaultBetIndex >= config.betLevels.length) push('defaultBetIndex', 'out of range');

  // Symbols & codes.
  const codes = new Set<number>();
  for (const id of ALL_IDS) {
    const def = config.symbols[id];
    if (!def) {
      push(`symbols.${id}`, 'missing');
      continue;
    }
    if (!Number.isInteger(def.code) || def.code < 0) push(`symbols.${id}.code`, 'must be a non-negative integer');
    if (codes.has(def.code)) push(`symbols.${id}.code`, `duplicate code ${def.code}`);
    codes.add(def.code);
  }
  if (config.symbols.W?.tier !== 'wild') push('symbols.W.tier', "must be 'wild'");
  if (config.symbols.S?.tier !== 'scatter') push('symbols.S.tier', "must be 'scatter'");

  // Paytable.
  for (const id of PAYING_IDS) {
    const line = config.paytable[id];
    if (!line) {
      push(`paytable.${id}`, 'missing');
      continue;
    }
    if (line.length !== 3) push(`paytable.${id}`, 'must have 3 entries');
    line.forEach((v, i) => {
      if (!Number.isInteger(v) || v < 0) push(`paytable.${id}[${i}]`, 'must be a non-negative integer');
    });
    if (!(line[0] <= line[1] && line[1] <= line[2])) push(`paytable.${id}`, 'must be non-decreasing');
  }
  config.scatterPays.forEach((v, i) => {
    if (!Number.isInteger(v) || v < 0) push(`scatterPays[${i}]`, 'must be a non-negative integer');
  });

  // Wild placement.
  if (config.wild.reels.length !== reels) push('wild.reels', `must have ${reels} entries`);
  if (config.wild.reels[0]) push('wild.reels[0]', 'wild must never be allowed on reel 1 (ways evaluation relies on it)');

  // Strips.
  const wildCode = config.symbols.W?.code;
  const scatterCode = config.symbols.S?.code;
  for (const setName of ['base', 'free'] as const) {
    const set = config.strips[setName];
    if (set.length !== reels) {
      push(`strips.${setName}`, `must have ${reels} strips`);
      continue;
    }
    set.forEach((strip, r) => {
      const path = `strips.${setName}[${r}]`;
      if (strip.length < 30) push(path, `too short (${strip.length}); minimum 30`);
      let scatterCount = 0;
      strip.forEach((code, i) => {
        if (!codes.has(code)) push(`${path}[${i}]`, `unknown symbol code ${code}`);
        if (code === wildCode && !config.wild.reels[r]) push(`${path}[${i}]`, `wild not allowed on reel ${r + 1}`);
        if (code === scatterCode) {
          scatterCount++;
          for (let d = 1; d < rows; d++) {
            if (strip[(i + d) % strip.length] === scatterCode) {
              push(`${path}[${i}]`, `two scatters within ${rows} positions (would show 2 on one reel)`);
            }
          }
        }
      });
      if (setName === 'base' && scatterCount === 0) push(path, 'base strip has no scatter; feature could never trigger');
    });
  }

  // Feature.
  const fs = config.freeSpins;
  for (const k of [3, 4, 5] as const) {
    if (!Number.isInteger(fs.awards[k]) || fs.awards[k] <= 0) push(`freeSpins.awards.${k}`, 'must be a positive integer');
  }
  const checkMeter = (path: string, m: MeterRules): void => {
    if (!Number.isInteger(m.start) || m.start < 1) push(`${path}.start`, 'must be an integer ≥ 1');
    if (!Number.isInteger(m.winsPerStep) || m.winsPerStep < 1) push(`${path}.winsPerStep`, 'must be an integer ≥ 1');
    if (!Number.isInteger(m.step) || m.step < 1) push(`${path}.step`, 'must be an integer ≥ 1');
    if (!Number.isInteger(m.cap) || m.cap < m.start) push(`${path}.cap`, 'must be an integer ≥ start');
  };
  checkMeter('freeSpins.meter', fs.meter);

  // Buy.
  if (config.buy.free.costX <= 0) push('buy.free.costX', 'must be positive');
  if (config.buy.free.minScatters < 3) push('buy.free.minScatters', 'must be ≥ 3');
  if (config.buy.super.costX <= 0) push('buy.super.costX', 'must be positive');
  if (config.buy.super.spins <= 0) push('buy.super.spins', 'must be positive');
  checkMeter('buy.super.meter', config.buy.super.meter);

  if (config.maxWinX <= 0) push('maxWinX', 'must be positive');

  return issues;
}

/** Throws with all issues if the config is invalid. */
export function assertValidConfig(config: GameConfig): void {
  const issues = validateConfig(config);
  if (issues.length > 0) {
    throw new Error(`Invalid game config:\n${issues.map((i) => `  ${i.path}: ${i.message}`).join('\n')}`);
  }
}
