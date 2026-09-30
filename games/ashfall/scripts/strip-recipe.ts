/**
 * Reel-strip recipe: per-reel symbol counts, block (stack) sizes and placement rules.
 * Edit this, run `pnpm strips:gen`, then `pnpm rtp:exact` / `pnpm sim` to see the effect.
 * Strips are regenerated deterministically from `seed`, so the same recipe always yields the same strips.
 *
 * Tuning notes (see README § Maths):
 *  - lows stacked in blocks (3 on reel 1, 2 on reels 2–3) lower hit frequency and raise ways-per-hit
 *  - base scatter counts set feature frequency (≈ 1 in 240); free scatter counts set the retrigger rate (≈ 1 in 100 / spin)
 *  - free strips are deliberately "hot": more highs, more wilds, fewer lows - a bought feature returns ≈ 97× bet
 *  - high-symbol pays drive ~90 % of feature value, so tune base RTP with the low/mid paytable, not the highs
 */
import type { StripRecipe } from './lib/strip-builder';

// H1 H2 H3 | M1 M2 | L1 L2 L3 L4 | W S

export const BASE_RECIPE: StripRecipe = {
  seed: 'ashfall-base-v1',
  rules: {
    scatterSpacing: 3,
    wildSpacing: 2,
    wildScatterSpacing: 2,
    maxRun: { high: 2, mid: 2, low: 3 },
  },
  reels: [
    { counts: { H1: 5, H2: 5, H3: 6, M1: 7, M2: 7, L1: 12, L2: 12, L3: 12, L4: 12, S: 2 }, blocks: { L1: 3, L2: 3, L3: 3, L4: 3 } },
    { counts: { H1: 5, H2: 5, H3: 6, M1: 7, M2: 7, L1: 12, L2: 12, L3: 12, L4: 12, W: 2, S: 2 }, blocks: { L1: 2, L2: 2, L3: 2, L4: 2 } },
    { counts: { H1: 5, H2: 5, H3: 6, M1: 7, M2: 7, L1: 12, L2: 12, L3: 12, L4: 12, W: 5, S: 3 }, blocks: { L1: 2, L2: 2, L3: 2, L4: 2 } },
    { counts: { H1: 5, H2: 5, H3: 6, M1: 7, M2: 7, L1: 12, L2: 12, L3: 12, L4: 12, W: 5, S: 2 } },
    { counts: { H1: 5, H2: 5, H3: 6, M1: 7, M2: 7, L1: 12, L2: 12, L3: 12, L4: 12, W: 4, S: 2 } },
  ],
};

export const FREE_RECIPE: StripRecipe = {
  seed: 'ashfall-free-v1',
  rules: {
    scatterSpacing: 3,
    wildSpacing: 1,
    wildScatterSpacing: 2,
    maxRun: { high: 3, mid: 3, low: 3 },
  },
  reels: [
    { counts: { H1: 13, H2: 13, H3: 13, M1: 8, M2: 8, L1: 5, L2: 5, L3: 5, L4: 5, S: 3 } },
    { counts: { H1: 13, H2: 13, H3: 13, M1: 8, M2: 8, L1: 5, L2: 5, L3: 5, L4: 5, W: 8, S: 3 } },
    { counts: { H1: 13, H2: 13, H3: 13, M1: 8, M2: 8, L1: 5, L2: 5, L3: 5, L4: 5, W: 11, S: 3 } },
    { counts: { H1: 13, H2: 13, H3: 13, M1: 8, M2: 8, L1: 5, L2: 5, L3: 5, L4: 5, W: 10, S: 3 } },
    { counts: { H1: 13, H2: 13, H3: 13, M1: 8, M2: 8, L1: 5, L2: 5, L3: 5, L4: 5, W: 8, S: 3 } },
  ],
};
