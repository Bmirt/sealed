/**
 * pnpm rtp:exact — closed-form base-game RTP (line + scatter pays) for both strip sets.
 * Free-spin RTP is path dependent (meter, retriggers, cap) — use `pnpm sim` for the full picture.
 */
import { GAME_CONFIG } from '../src/config/game.config';
import { exactRtp } from '../src/math/exact';
import { assertValidConfig } from '../src/math/validate';

assertValidConfig(GAME_CONFIG);
const pct = (v: number): string => `${(v * 100).toFixed(3)}%`;

for (const set of ['base', 'free'] as const) {
  const r = exactRtp(GAME_CONFIG, set);
  console.log(`── ${set} strips ──`);
  console.log(`  line RTP      ${pct(r.lineRtp)}`);
  console.log(`  scatter pays  ${pct(r.scatterRtp)}`);
  console.log(`  total/spin    ${pct(r.total)}   (no feature value)`);
  console.log(`  P(≥3 scatter) ${pct(r.triggerProb)}  → 1 in ${(1 / r.triggerProb).toFixed(1)}`);
  console.log(`  scatter dist  ${r.scatterDist.map((p, k) => `${k}:${pct(p)}`).join('  ')}`);
  console.log(`  by symbol     ${Object.entries(r.bySymbol).map(([id, v]) => `${id}:${pct(v)}`).join('  ')}`);
}
