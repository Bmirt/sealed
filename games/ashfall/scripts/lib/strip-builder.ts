/**
 * Deterministic reel-strip builder used by `pnpm strips:gen`.
 * Never used at runtime — the generated arrays are committed to src/config/strips.ts.
 *
 * Symbols are placed as "units": a unit is a run of `blocks[id]` identical symbols (default 1).
 * Stacking lows in blocks lowers hit frequency while raising the ways count when they do hit —
 * the main volatility lever. Units are shuffled, then a repair loop swaps units until every
 * placement rule holds.
 */
import { rngFromString } from '../../../../packages/ashfall-math/src/math/rng';
import type { SymbolCode, SymbolId } from '../../../../packages/ashfall-math/src/math/types';

export interface StripRules {
  /** Minimum index distance between two scatters (≥ rows guarantees ≤ 1 visible per reel). */
  readonly scatterSpacing: number;
  /** Minimum index distance between two wilds (1 = may be adjacent). */
  readonly wildSpacing: number;
  /** Minimum index distance between a wild and a scatter. */
  readonly wildScatterSpacing: number;
  /** Maximum run length of the same symbol per tier (1 = never adjacent to itself). */
  readonly maxRun: Readonly<Record<'high' | 'mid' | 'low', number>>;
}

export interface ReelRecipe {
  /** Symbol counts for this reel. */
  readonly counts: Readonly<Partial<Record<SymbolId, number>>>;
  /** Run length per symbol (count must be divisible). Missing = 1. */
  readonly blocks?: Readonly<Partial<Record<SymbolId, number>>>;
}

export interface StripRecipe {
  readonly reels: readonly ReelRecipe[];
  readonly rules: StripRules;
  readonly seed: string;
}

export interface SymbolMeta {
  readonly code: SymbolCode;
  readonly tier: 'high' | 'mid' | 'low' | 'wild' | 'scatter';
}

function circularDistance(a: number, b: number, len: number): number {
  const d = Math.abs(a - b);
  return Math.min(d, len - d);
}

function flatten(units: readonly (readonly SymbolCode[])[]): SymbolCode[] {
  const out: SymbolCode[] = [];
  for (const u of units) out.push(...u);
  return out;
}

/** Returns the indices of UNITS that start a violating run/placement. */
function violatingUnits(
  units: readonly (readonly SymbolCode[])[],
  meta: ReadonlyMap<SymbolCode, SymbolMeta>,
  rules: StripRules,
): number[] {
  const strip = flatten(units);
  const len = strip.length;
  const unitOfPos: number[] = [];
  units.forEach((u, ui) => u.forEach(() => unitOfPos.push(ui)));

  const tierOf = (c: SymbolCode): SymbolMeta['tier'] => {
    const m = meta.get(c);
    if (!m) throw new Error(`unknown code ${c}`);
    return m.tier;
  };
  const maxSpacing = Math.max(rules.scatterSpacing, rules.wildSpacing, rules.wildScatterSpacing);
  const bad = new Set<number>();

  for (let i = 0; i < len; i++) {
    const c = strip[i];
    if (c === undefined) continue;
    const tier = tierOf(c);
    const unit = unitOfPos[i];
    if (unit === undefined) continue;

    if (tier === 'scatter' || tier === 'wild') {
      for (let d = 1; d <= maxSpacing && d < len; d++) {
        const j = (i + d) % len;
        const o = strip[j];
        if (o === undefined) continue;
        const ot = tierOf(o);
        const dist = circularDistance(i, j, len);
        if (tier === 'scatter' && ot === 'scatter' && dist < rules.scatterSpacing) bad.add(unit);
        if (tier === 'wild' && ot === 'wild' && dist < rules.wildSpacing) bad.add(unit);
        if (((tier === 'wild' && ot === 'scatter') || (tier === 'scatter' && ot === 'wild')) && dist < rules.wildScatterSpacing) bad.add(unit);
      }
    }

    if (tier === 'high' || tier === 'mid' || tier === 'low') {
      const max = rules.maxRun[tier];
      let run = 1;
      for (let d = 1; d < len; d++) {
        if (strip[(i + d) % len] === c) run++;
        else break;
      }
      if (run > max) bad.add(unit);
    }
  }
  return [...bad];
}

export function buildStrip(
  reelIndex: number,
  recipe: ReelRecipe,
  symbols: Readonly<Record<SymbolId, SymbolMeta>>,
  rules: StripRules,
  seed: string,
): SymbolCode[] {
  const rng = rngFromString(`${seed}:reel${reelIndex}`);
  const meta = new Map<SymbolCode, SymbolMeta>();
  for (const m of Object.values(symbols)) meta.set(m.code, m);

  const units: SymbolCode[][] = [];
  for (const [id, n] of Object.entries(recipe.counts) as [SymbolId, number][]) {
    const def = symbols[id];
    const block = recipe.blocks?.[id] ?? 1;
    if (n % block !== 0) throw new Error(`reel ${reelIndex}: ${id} count ${n} not divisible by block ${block}`);
    for (let k = 0; k < n / block; k++) units.push(new Array<SymbolCode>(block).fill(def.code));
  }

  const swap = (i: number, j: number): void => {
    const a = units[i];
    const b = units[j];
    if (a === undefined || b === undefined) return;
    units[i] = b;
    units[j] = a;
  };

  // Fisher–Yates over units.
  for (let i = units.length - 1; i > 0; i--) swap(i, rng.nextInt(i + 1));

  // Repair loop.
  for (let iter = 0; iter < 200_000; iter++) {
    const bad = violatingUnits(units, meta, rules);
    if (bad.length === 0) return flatten(units);
    const i = bad[rng.nextInt(bad.length)];
    if (i === undefined) break;
    swap(i, rng.nextInt(units.length));
  }
  throw new Error(`reel ${reelIndex}: could not satisfy strip rules — relax the constraints or change counts`);
}

export function buildStripSet(recipe: StripRecipe, symbols: Readonly<Record<SymbolId, SymbolMeta>>): SymbolCode[][] {
  return recipe.reels.map((reel, r) => buildStrip(r, reel, symbols, recipe.rules, recipe.seed));
}
