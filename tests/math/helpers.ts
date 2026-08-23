import { GAME_CONFIG } from '@config/game.config';
import type { GameConfig, SymbolCode, SymbolId } from '@math/types';

export const C = (id: SymbolId): SymbolCode => GAME_CONFIG.symbols[id].code;

/** Build a 5×3 grid from rows of symbol ids (top row first). */
export function gridOf(rows: readonly (readonly SymbolId[])[]): SymbolCode[][] {
  const reels = rows[0]?.length ?? 0;
  const grid: SymbolCode[][] = [];
  for (let r = 0; r < reels; r++) {
    const col: SymbolCode[] = [];
    for (const row of rows) {
      const id = row[r];
      if (!id) throw new Error('ragged grid');
      col.push(C(id));
    }
    grid.push(col);
  }
  return grid;
}

/** A strip that is the same symbol everywhere (length ≥ 30 to satisfy validation). */
export function solidStrip(id: SymbolId, length = 30): SymbolCode[] {
  return new Array<SymbolCode>(length).fill(C(id));
}

/** A strip that repeats a pattern to length ≥ 30. */
export function patternStrip(ids: readonly SymbolId[], minLength = 30): SymbolCode[] {
  const out: SymbolCode[] = [];
  while (out.length < minLength) for (const id of ids) out.push(C(id));
  return out;
}

export function withStrips(
  base: readonly (readonly SymbolCode[])[],
  free: readonly (readonly SymbolCode[])[] = base,
  patch: Partial<GameConfig> = {},
): GameConfig {
  return { ...GAME_CONFIG, ...patch, strips: { base, free } };
}
