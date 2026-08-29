import { describe, expect, it } from 'vitest';
import { GAME_CONFIG } from '@config/game.config';
import { gridFromStops } from '@math/grid';
import { landingPosition, rowY, stripIndexAt } from '@/game/reelMath';

describe('reel window maths', () => {
  it('at rest (pos = stop) the three visible rows equal the maths window', () => {
    const strips = GAME_CONFIG.strips.base;
    for (let r = 0; r < 5; r++) {
      const strip = strips[r];
      if (!strip) throw new Error('strip');
      for (let stop = 0; stop < strip.length; stop++) {
        const expected = gridFromStops([strip], [stop], 3)[0];
        const shown = [0, 1, 2].map((row) => strip[stripIndexAt(stop, row, strip.length)]);
        expect(shown).toEqual(expected);
        expect([0, 1, 2].map((row) => rowY(stop, row))).toEqual([0, 1, 2]);
      }
    }
  });

  it('wraps negative and overflowing indices', () => {
    expect(stripIndexAt(0, -1, 10)).toBe(9);
    expect(stripIndexAt(-1, 0, 10)).toBe(9);
    expect(stripIndexAt(-11, 0, 10)).toBe(9);
    expect(stripIndexAt(9, 3, 10)).toBe(2);
    expect(stripIndexAt(123.7, 1, 10)).toBe(4);
  });

  it('decreasing pos moves rows down and pulls the buffer symbol in from above', () => {
    // pos 5 → 4.5: the symbol at index 5 is now half a row lower.
    expect(rowY(4.5, 0)).toBeCloseTo(-0.5); // index 4 (buffer) sits half visible at the top
    expect(rowY(4.5, 1)).toBeCloseTo(0.5); // index 5 moved down by half a row
  });

  it('landingPosition lands exactly on the stop after the requested turns, moving down', () => {
    const len = 80;
    for (const from of [0, 7, 79, 160.3, -33]) {
      for (const stop of [0, 1, 40, 79]) {
        for (const turns of [0, 1, 3]) {
          const to = landingPosition(from, stop, len, turns);
          expect(to).toBeLessThan(from);
          expect((((Math.round(to) % len) + len) % len)).toBe(stop);
          expect(from - to).toBeGreaterThanOrEqual(turns * len);
          expect(from - to).toBeLessThanOrEqual((turns + 1) * len + 1);
        }
      }
    }
  });
});
