/**
 * Headless Monte-Carlo over the pure maths. Used by `pnpm sim` and by the RTP lock test.
 */
import { buySpin, buyCostCoins } from '../../../../packages/ashfall-math/src/math/buy';
import { spin } from '../../../../packages/ashfall-math/src/math/spin';
import type { FeatureTier, GameConfig, SpinOutcome } from '../../../../packages/ashfall-math/src/math/types';

export type SimMode = 'base' | 'buy' | 'super';

export interface SimOptions {
  readonly spins: number;
  readonly seed: string;
  readonly mode: SimMode;
  readonly onProgress?: (done: number) => void;
}

export interface Bucket {
  readonly label: string;
  readonly minX: number;
  readonly maxX: number;
  count: number;
}

export interface SimReport {
  readonly mode: SimMode;
  readonly spins: number;
  readonly seed: string;
  /** Cost per round in coins (bet, or buy cost). */
  readonly costCoins: number;
  readonly rtp: number;
  readonly rtpBase: number;
  readonly rtpFeature: number;
  readonly rtpScatterPay: number;
  readonly hitFrequency: number;
  readonly featureFrequency: number; // rounds per feature (Infinity if none)
  readonly features: number;
  readonly avgFeatureWinX: number;
  readonly avgFeatureSpins: number;
  readonly meterEndDist: readonly number[]; // index = meter value
  readonly scatterTriggerDist: readonly number[]; // index = scatter count at trigger (3..5)
  readonly maxWinX: number;
  readonly maxWinSeedNonce: readonly [string, number];
  readonly capHits: number;
  readonly stdDevX: number;
  readonly buckets: readonly Bucket[];
  readonly durationMs: number;
}

const BUCKET_DEFS: ReadonlyArray<readonly [string, number, number]> = [
  ['0', 0, 0],
  ['<1×', 0, 1],
  ['1–2×', 1, 2],
  ['2–5×', 2, 5],
  ['5–10×', 5, 10],
  ['10–15×', 10, 15],
  ['Big 15–50×', 15, 50],
  ['Mega 50–100×', 50, 100],
  ['Epic 100–500×', 100, 500],
  ['Legendary 500×+', 500, Infinity],
];

export function runSim(config: GameConfig, opts: SimOptions): SimReport {
  const t0 = performance.now();
  const { spins: n, seed, mode } = opts;
  const coinsPerBet = config.coinsPerBet;
  const tier: FeatureTier | null = mode === 'buy' ? 'free' : mode === 'super' ? 'super' : null;
  const costCoins = tier ? buyCostCoins(config, tier) : coinsPerBet;

  let totalWin = 0;
  let baseWin = 0;
  let featureWin = 0;
  let scatterPayWin = 0;
  let hits = 0;
  let features = 0;
  let featureSpins = 0;
  let capHits = 0;
  let maxWin = 0;
  let maxWinNonce = 0;
  let sumSq = 0;
  const meterEndDist: number[] = new Array<number>(config.freeSpins.meter.cap + 1).fill(0);
  const scatterTriggerDist: number[] = [0, 0, 0, 0, 0, 0];
  const buckets: Bucket[] = BUCKET_DEFS.map(([label, minX, maxX]) => ({ label, minX, maxX, count: 0 }));

  const bucketFor = (x: number): Bucket => {
    if (x === 0) return buckets[0] as Bucket;
    for (let i = 1; i < buckets.length; i++) {
      const b = buckets[i] as Bucket;
      if (x >= b.minX && x < b.maxX) return b;
    }
    return buckets[buckets.length - 1] as Bucket;
  };

  for (let i = 0; i < n; i++) {
    const o: SpinOutcome = tier ? buySpin(config, seed, i, tier) : spin(config, seed, i);
    const w = o.totalWinCoins;
    totalWin += w;
    baseWin += o.base.totalWinCoins;
    scatterPayWin += o.base.scatter.pay;
    if (w > 0) hits++;
    if (o.capped) capHits++;
    if (o.feature) {
      features++;
      featureWin += o.feature.totalWinCoins;
      featureSpins += o.feature.spins.length;
      meterEndDist[o.feature.meterEnd] = (meterEndDist[o.feature.meterEnd] ?? 0) + 1;
      const sc = Math.min(o.base.scatter.count, 5);
      scatterTriggerDist[sc] = (scatterTriggerDist[sc] ?? 0) + 1;
      for (const fs of o.feature.spins) scatterPayWin += fs.scatter.pay * fs.multiplier;
    }
    const x = w / coinsPerBet;
    sumSq += x * x;
    if (w > maxWin) {
      maxWin = w;
      maxWinNonce = i;
    }
    bucketFor(x).count++;
    if (opts.onProgress && i % 100_000 === 0 && i > 0) opts.onProgress(i);
  }

  const mean = totalWin / coinsPerBet / n;
  const variance = sumSq / n - mean * mean;
  const cost = costCoins * n;

  return {
    mode,
    spins: n,
    seed,
    costCoins,
    rtp: totalWin / cost,
    rtpBase: baseWin / cost,
    rtpFeature: featureWin / cost,
    rtpScatterPay: scatterPayWin / cost,
    hitFrequency: hits / n,
    featureFrequency: features > 0 ? n / features : Infinity,
    features,
    avgFeatureWinX: features > 0 ? featureWin / coinsPerBet / features : 0,
    avgFeatureSpins: features > 0 ? featureSpins / features : 0,
    meterEndDist,
    scatterTriggerDist,
    maxWinX: maxWin / coinsPerBet,
    maxWinSeedNonce: [seed, maxWinNonce],
    capHits,
    stdDevX: Math.sqrt(Math.max(0, variance)),
    buckets,
    durationMs: performance.now() - t0,
  };
}

export function formatReport(r: SimReport): string {
  const pct = (v: number): string => `${(v * 100).toFixed(2)}%`;
  const lines: string[] = [];
  lines.push(`── Ashfall Dynasty sim ── mode=${r.mode} spins=${r.spins.toLocaleString()} seed="${r.seed}" (${(r.durationMs / 1000).toFixed(1)}s)`);
  lines.push(`RTP            ${pct(r.rtp)}   (base ${pct(r.rtpBase)} + feature ${pct(r.rtpFeature)}; scatter pays ${pct(r.rtpScatterPay)})`);
  lines.push(`Hit frequency  ${pct(r.hitFrequency)}  (1 in ${(1 / r.hitFrequency).toFixed(2)})`);
  lines.push(`Feature        ${r.features.toLocaleString()} triggers → 1 in ${Number.isFinite(r.featureFrequency) ? r.featureFrequency.toFixed(1) : '∞'}  avg ${r.avgFeatureWinX.toFixed(1)}× bet over ${r.avgFeatureSpins.toFixed(1)} spins`);
  lines.push(`  trigger by scatters  3:${r.scatterTriggerDist[3] ?? 0}  4:${r.scatterTriggerDist[4] ?? 0}  5:${r.scatterTriggerDist[5] ?? 0}`);
  lines.push(`  meter at end         ${r.meterEndDist.map((c, m) => (c > 0 ? `×${m}:${c}` : null)).filter(Boolean).join('  ')}`);
  lines.push(`Max win        ${r.maxWinX.toFixed(1)}× bet  (nonce ${r.maxWinSeedNonce[1]})   cap hits: ${r.capHits}`);
  lines.push(`Std dev        ${r.stdDevX.toFixed(2)}× bet`);
  lines.push(`Win distribution (rounds):`);
  for (const b of r.buckets) {
    lines.push(`  ${b.label.padEnd(18)} ${b.count.toLocaleString().padStart(10)}   ${pct(b.count / r.spins).padStart(8)}   ${b.count > 0 ? `1 in ${(r.spins / b.count).toFixed(0)}` : ''}`);
  }
  return lines.join('\n');
}
