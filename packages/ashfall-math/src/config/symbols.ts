import type { SymbolDef, SymbolId } from '../math/types';

/** Symbol registry: ids, numeric codes (used in strips), display names and tiers. */
export const SYMBOLS: Readonly<Record<SymbolId, SymbolDef>> = {
  H1: { code: 0, name: 'Gold Dragon', tier: 'high' },
  H2: { code: 1, name: 'Ash Dragon', tier: 'high' },
  H3: { code: 2, name: 'Emerald Dragon', tier: 'high' },
  M1: { code: 3, name: 'Obsidian Crown', tier: 'mid' },
  M2: { code: 4, name: 'Ancestral Blade', tier: 'mid' },
  L1: { code: 5, name: 'Flame Sigil', tier: 'low' },
  L2: { code: 6, name: 'Wolf Sigil', tier: 'low' },
  L3: { code: 7, name: 'Kraken Sigil', tier: 'low' },
  L4: { code: 8, name: 'Rose Sigil', tier: 'low' },
  W: { code: 9, name: 'The Molten Throne', tier: 'wild' },
  S: { code: 10, name: 'Dragon Egg', tier: 'scatter' },
};

/** House / lore names used in copy. All original. */
export const HOUSES = {
  H1: 'House Vaelor',
  H2: 'House Cindrath',
  H3: 'House Myrrowen',
} as const;
