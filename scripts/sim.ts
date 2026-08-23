/**
 * pnpm sim [--spins N] [--seed S] [--mode base|buy|super]
 * Runs the maths headlessly and prints measured RTP, hit frequency, feature stats and max win.
 */
import { GAME_CONFIG } from '../src/config/game.config';
import { assertValidConfig } from '../src/math/validate';
import { formatReport, runSim } from './lib/sim-core';
import type { SimMode } from './lib/sim-core';

function arg(name: string, fallback: string): string {
  const i = process.argv.indexOf(`--${name}`);
  const v = i >= 0 ? process.argv[i + 1] : undefined;
  return v ?? fallback;
}

const spins = Number.parseInt(arg('spins', '1000000'), 10);
const seed = arg('seed', 'sim-2026');
const modeArg = arg('mode', 'base');
const isMode = (m: string): m is SimMode => m === 'base' || m === 'buy' || m === 'super';
if (!isMode(modeArg)) {
  console.error(`unknown mode "${modeArg}" — use base | buy | super`);
  process.exit(1);
}
const mode: SimMode = modeArg;

assertValidConfig(GAME_CONFIG);
const report = runSim(GAME_CONFIG, {
  spins,
  seed,
  mode,
  onProgress: (d) => process.stderr.write(`\r${d.toLocaleString()} / ${spins.toLocaleString()}`),
});
process.stderr.write('\r'.padEnd(40) + '\r');
console.log(formatReport(report));
console.log(`\nconfig v${GAME_CONFIG.version}  target ${(GAME_CONFIG.rtp.target * 100).toFixed(1)}%  declared ${mode === 'base' ? GAME_CONFIG.rtp.declaredBase : mode === 'buy' ? GAME_CONFIG.rtp.declaredBuyFree : GAME_CONFIG.rtp.declaredBuySuper}`);
