/**
 * pnpm golden:update — regenerate tests/golden/outcomes.json from the current config.
 * Run ONLY after an intentional maths change (and bump config.version first). Review the diff.
 */
import { writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { GAME_CONFIG } from '../src/config/game.config';
import { assertValidConfig } from '../src/math/validate';
import { DIGEST_SEED, DIGEST_SPINS, GOLDEN_CASES, digest, runCase } from '../tests/golden/golden-spec';
import type { GoldenFile } from '../tests/golden/golden-spec';

assertValidConfig(GAME_CONFIG);

const file: GoldenFile = {
  configVersion: GAME_CONFIG.version,
  cases: GOLDEN_CASES.map((c) => ({ id: c.id, outcome: runCase(GAME_CONFIG, c) })),
  digest: { seed: DIGEST_SEED, spins: DIGEST_SPINS, value: digest(GAME_CONFIG, DIGEST_SEED, DIGEST_SPINS) },
};

const target = resolve(process.cwd(), 'tests/golden/outcomes.json');
writeFileSync(target, JSON.stringify(file, null, 1) + '\n');
console.log(`wrote ${target} (config v${file.configVersion}, ${file.cases.length} cases, digest ${file.digest.value})`);
