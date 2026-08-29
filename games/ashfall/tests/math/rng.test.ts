import { describe, expect, it } from 'vitest';
import { cyrb128, rngFor, rngFromString } from '@math/rng';

describe('rng', () => {
  it('same seed + nonce → identical stream', () => {
    const a = rngFor('seed-A', 7);
    const b = rngFor('seed-A', 7);
    for (let i = 0; i < 1000; i++) expect(a.nextU32()).toBe(b.nextU32());
  });

  it('different nonce → different stream', () => {
    const a = rngFor('seed-A', 7);
    const b = rngFor('seed-A', 8);
    const sa = Array.from({ length: 8 }, () => a.nextU32());
    const sb = Array.from({ length: 8 }, () => b.nextU32());
    expect(sa).not.toEqual(sb);
  });

  it('different seed → different stream', () => {
    const a = rngFor('seed-A', 0);
    const b = rngFor('seed-B', 0);
    expect(a.nextU32()).not.toBe(b.nextU32());
  });

  it('cyrb128 is stable (platform-independent constants)', () => {
    expect(cyrb128('ashfall')).toEqual(cyrb128('ashfall'));
    expect(cyrb128('ashfall')).not.toEqual(cyrb128('ashfalL'));
    // Pinned value: if this changes, every golden file changes. Change deliberately.
    expect(cyrb128('ashfall dynasty')).toEqual([19160090, 2753322031, 835905795, 1757385138]);
  });

  it('nextInt is in range and roughly uniform', () => {
    const rng = rngFromString('uniform');
    const n = 7;
    const counts = new Array<number>(n).fill(0);
    const draws = 70_000;
    for (let i = 0; i < draws; i++) {
      const v = rng.nextInt(n);
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(n);
      counts[v] = (counts[v] ?? 0) + 1;
    }
    for (const c of counts) expect(Math.abs(c - draws / n)).toBeLessThan(draws / n * 0.05);
  });

  it('next() is in [0,1)', () => {
    const rng = rngFromString('float');
    for (let i = 0; i < 1000; i++) {
      const v = rng.next();
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });

  it('rejects invalid arguments', () => {
    expect(() => rngFor('x', -1)).toThrow(RangeError);
    expect(() => rngFor('x', 1.5)).toThrow(RangeError);
    expect(() => rngFromString('x').nextInt(0)).toThrow(RangeError);
  });

  it('counts draws', () => {
    const rng = rngFor('draws', 0);
    rng.nextU32();
    rng.nextInt(10);
    expect(rng.draws).toBeGreaterThanOrEqual(2);
  });
});
