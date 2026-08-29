import type { GameConfig, PayingSymbolId, SymbolCode, SymbolId } from './types';

/**
 * Pre-digested lookups derived from a GameConfig. Built once per config object (WeakMap cache)
 * so the hot sim loop never re-parses the config.
 */
export interface EvalContext {
  readonly config: GameConfig;
  readonly reels: number;
  readonly rows: number;
  readonly wildCode: SymbolCode;
  readonly scatterCode: SymbolCode;
  readonly codeToId: readonly SymbolId[];
  /** Paying symbol codes in paytable order (highest first). */
  readonly payingCodes: readonly SymbolCode[];
  /** pay[code][length-3] (0 for non-paying codes). */
  readonly pay: readonly (readonly number[])[];
  readonly capCoins: number;
}

const cache = new WeakMap<GameConfig, EvalContext>();

export function contextFor(config: GameConfig): EvalContext {
  const hit = cache.get(config);
  if (hit) return hit;

  const entries = Object.entries(config.symbols) as [SymbolId, GameConfig['symbols'][SymbolId]][];
  const maxCode = Math.max(...entries.map(([, def]) => def.code));
  const codeToId: SymbolId[] = new Array<SymbolId>(maxCode + 1);
  const pay: number[][] = [];
  for (let c = 0; c <= maxCode; c++) pay.push([0, 0, 0]);

  for (const [id, def] of entries) {
    codeToId[def.code] = id;
    if (id !== 'W' && id !== 'S') {
      const line = config.paytable[id as PayingSymbolId];
      pay[def.code] = [line[0], line[1], line[2]];
    }
  }

  const payingCodes = (Object.keys(config.paytable) as PayingSymbolId[]).map((id) => config.symbols[id].code);

  const ctx: EvalContext = {
    config,
    reels: config.layout.reels,
    rows: config.layout.rows,
    wildCode: config.symbols.W.code,
    scatterCode: config.symbols.S.code,
    codeToId,
    payingCodes,
    pay,
    capCoins: config.maxWinX * config.coinsPerBet,
  };
  cache.set(config, ctx);
  return ctx;
}
