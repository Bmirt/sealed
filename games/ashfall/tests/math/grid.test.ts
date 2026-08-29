import { describe, expect, it } from 'vitest';
import { drawStops, gridFromStops } from '@math/grid';
import { rngFromString } from '@math/rng';

describe('grid', () => {
  const strips = [
    [0, 1, 2, 3, 4],
    [5, 6, 7, 8, 9],
    [1, 1, 1, 1, 1],
    [2, 3, 4, 5, 6],
    [9, 8, 7, 6, 5],
  ];

  it('reads a 3-row window top → bottom from each stop', () => {
    const grid = gridFromStops(strips, [0, 1, 2, 3, 4], 3);
    expect(grid[0]).toEqual([0, 1, 2]);
    expect(grid[1]).toEqual([6, 7, 8]);
    expect(grid[2]).toEqual([1, 1, 1]);
    expect(grid[3]).toEqual([5, 6, 2]); // wraps
    expect(grid[4]).toEqual([5, 9, 8]); // wraps
  });

  it('draws one stop per reel inside the strip bounds', () => {
    const rng = rngFromString('stops');
    for (let i = 0; i < 200; i++) {
      const stops = drawStops(rng, strips);
      expect(stops).toHaveLength(5);
      stops.forEach((s, r) => {
        expect(s).toBeGreaterThanOrEqual(0);
        expect(s).toBeLessThan(strips[r]?.length ?? 0);
      });
    }
  });
});
