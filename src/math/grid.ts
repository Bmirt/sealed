import type { Rng } from './rng';
import type { SymbolCode } from './types';

/** Draw one uniform stop per reel. */
export function drawStops(rng: Rng, strips: readonly (readonly SymbolCode[])[]): number[] {
  const stops: number[] = new Array<number>(strips.length);
  for (let r = 0; r < strips.length; r++) {
    const strip = strips[r];
    if (!strip) throw new Error(`missing strip ${r}`);
    stops[r] = rng.nextInt(strip.length);
  }
  return stops;
}

/** Visible window for a set of stops: grid[reel][row], wrapping around the strip. */
export function gridFromStops(
  strips: readonly (readonly SymbolCode[])[],
  stops: readonly number[],
  rows: number,
): SymbolCode[][] {
  const grid: SymbolCode[][] = [];
  for (let r = 0; r < strips.length; r++) {
    const strip = strips[r];
    const stop = stops[r];
    if (!strip || stop === undefined) throw new Error(`missing strip/stop ${r}`);
    const column: SymbolCode[] = new Array<SymbolCode>(rows);
    for (let y = 0; y < rows; y++) {
      const code = strip[(stop + y) % strip.length];
      if (code === undefined) throw new Error(`strip ${r} has a hole at ${(stop + y) % strip.length}`);
      column[y] = code;
    }
    grid.push(column);
  }
  return grid;
}
