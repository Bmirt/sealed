import { describe, expect, it } from 'vitest';
import { GAME_CONFIG } from '@config/game.config';
import { assertValidConfig, validateConfig } from '@math/validate';
import type { GameConfig } from '@math/types';
import { C, patternStrip, solidStrip, withStrips } from './helpers';

describe('validateConfig', () => {
  it('accepts the shipped config', () => {
    expect(validateConfig(GAME_CONFIG)).toEqual([]);
    expect(() => assertValidConfig(GAME_CONFIG)).not.toThrow();
  });

  it('rejects a wild on reel 1', () => {
    const bad = withStrips([solidStrip('W'), ...GAME_CONFIG.strips.base.slice(1)]);
    const issues = validateConfig(bad);
    expect(issues.some((i) => i.path.startsWith('strips.base[0]') && /wild/.test(i.message))).toBe(true);
  });

  it('rejects wild.reels allowing reel 1', () => {
    const bad: GameConfig = { ...GAME_CONFIG, wild: { id: 'W', reels: [true, true, true, true, true] } };
    expect(validateConfig(bad).some((i) => i.path === 'wild.reels[0]')).toBe(true);
  });

  it('rejects two scatters within a window', () => {
    const strip = [...solidStrip('L1')];
    strip[0] = C('S');
    strip[2] = C('S');
    const bad = withStrips([strip, ...GAME_CONFIG.strips.base.slice(1)]);
    expect(validateConfig(bad).some((i) => /two scatters/.test(i.message))).toBe(true);
  });

  it('rejects a base strip with no scatter', () => {
    const bad = withStrips(GAME_CONFIG.strips.base.map(() => solidStrip('L1')));
    expect(validateConfig(bad).some((i) => /no scatter/.test(i.message))).toBe(true);
  });

  it('rejects short strips and unknown codes', () => {
    const bad = withStrips([[1, 2, 3], ...GAME_CONFIG.strips.base.slice(1)]);
    const issues = validateConfig(bad);
    expect(issues.some((i) => /too short/.test(i.message))).toBe(true);
    const bad2 = withStrips([[...patternStrip(['S', 'L1', 'L2']).slice(0, 29), 99], ...GAME_CONFIG.strips.base.slice(1)]);
    expect(validateConfig(bad2).some((i) => /unknown symbol code 99/.test(i.message))).toBe(true);
  });

  it('rejects a non-monotonic paytable and bad meter rules', () => {
    const bad: GameConfig = {
      ...GAME_CONFIG,
      paytable: { ...GAME_CONFIG.paytable, H1: [50, 20, 10] },
      freeSpins: { ...GAME_CONFIG.freeSpins, meter: { start: 5, winsPerStep: 0, step: 1, cap: 2 } },
    };
    const paths = validateConfig(bad).map((i) => i.path);
    expect(paths).toContain('paytable.H1');
    expect(paths).toContain('freeSpins.meter.winsPerStep');
    expect(paths).toContain('freeSpins.meter.cap');
  });

  it('assertValidConfig throws with every issue listed', () => {
    const bad: GameConfig = { ...GAME_CONFIG, maxWinX: 0, buy: { ...GAME_CONFIG.buy, free: { costX: 0, minScatters: 2 } } };
    let message = '';
    try {
      assertValidConfig(bad);
    } catch (e: unknown) {
      message = e instanceof Error ? e.message : String(e);
    }
    expect(message).toMatch(/maxWinX/);
    expect(message).toMatch(/buy\.free\.costX/);
    expect(message).toMatch(/buy\.free\.minScatters/);
  });
});
