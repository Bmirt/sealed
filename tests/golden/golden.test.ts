/**
 * Golden-file test: same seed → identical spin, byte for byte.
 * If this fails you changed the maths. If that was intended: bump config.version and `pnpm golden:update`.
 */
import { describe, expect, it } from 'vitest';
import { GAME_CONFIG } from '@config/game.config';
import golden from './outcomes.json';
import { GOLDEN_CASES, digest, runCase } from './golden-spec';
import type { GoldenFile } from './golden-spec';

const file = golden as unknown as GoldenFile;

describe('golden outcomes', () => {
  it('fixture was generated for the current config version', () => {
    expect(file.configVersion).toBe(GAME_CONFIG.version);
  });

  it.each(GOLDEN_CASES.map((c) => [c.id, c] as const))('%s reproduces exactly', (id, c) => {
    const expected = file.cases.find((x) => x.id === id)?.outcome;
    expect(expected).toBeDefined();
    expect(runCase(GAME_CONFIG, c)).toEqual(expected);
  });

  it('digest over a long run is unchanged', () => {
    expect(digest(GAME_CONFIG, file.digest.seed, file.digest.spins)).toBe(file.digest.value);
  });
});
