import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { GAME_CONFIG } from '@config/game.config';
import { buySpin } from '@math/buy';
import { spin } from '@math/spin';
import type { SpinOutcome } from '@math/types';
import { AnimatedPresenter } from '@/game/AnimatedPresenter';
import { SpinFlow } from '@/game/SpinFlow';
import { GameController } from '@/state/GameController';
import { GameStore, MemoryPersistence } from '@/state/GameStore';
import { betCents, coinsToCents } from '@/state/money';
import { flushMicrotasks, installManualClock } from '../helpers/gsapClock';
import type { ManualClock } from '../helpers/gsapClock';
import { FakeDeps } from './fakeDeps';

let clock: ManualClock;
beforeEach(() => {
  clock = installManualClock();
});
afterEach(() => {
  clock.uninstall();
});

const cpb = GAME_CONFIG.coinsPerBet;

interface Rig {
  store: GameStore;
  controller: GameController;
  presenter: AnimatedPresenter;
  flow: SpinFlow;
  deps: FakeDeps;
}

function rig(seed: string): Rig {
  const store = new GameStore(GAME_CONFIG, new MemoryPersistence());
  store.setSeed(seed, 0);
  store.set({ phase: 'idle' });
  store.credit(10_000_000);
  const deps = new FakeDeps();
  const presenter = new AnimatedPresenter(deps, store, GAME_CONFIG);
  const controller = new GameController(GAME_CONFIG, store, presenter);
  const flow = new SpinFlow(store, controller, presenter, 50);
  return { store, controller, presenter, flow, deps };
}

async function playOut(r: Rig, skipEvery = 0, maxIters = 2000): Promise<void> {
  for (let i = 0; i < maxIters; i++) {
    await flushMicrotasks();
    if (r.store.get().phase === 'idle' && r.controller.roundInFlight === null) return;
    if (skipEvery > 0 && i % skipEvery === 0) r.flow.spinPressed();
    clock.tick(0.5, 8);
  }
  throw new Error('feature did not settle');
}

function findFeatureNonce(seed: string, pred: (o: SpinOutcome) => boolean = () => true): number {
  for (let n = 0; n < 500_000; n++) {
    const o = spin(GAME_CONFIG, seed, n);
    if (o.feature && pred(o)) return n;
  }
  throw new Error('no feature found');
}

describe('Dragonfire feature presentation', () => {
  it('plays a natural feature end to end with exact meter, spins-left, total and balance', async () => {
    const seed = 'feat-natural';
    const n = findFeatureNonce(seed);
    const r = rig(seed);
    r.store.setSeed(seed, n);
    const outcome = spin(GAME_CONFIG, seed, n);
    const f = outcome.feature;
    if (!f) throw new Error('expected feature');
    const before = r.store.get().balanceCents;

    r.flow.spinPressed();
    await playOut(r);

    // HUD lifecycle.
    expect(r.deps.hudOn).toBe(false); // off again at the end
    expect(r.deps.banners.some(([t]) => t.includes('DRAGONFIRE'))).toBe(true);

    // Meter trace: every free spin's meterAfter appears in order; final value = meterEnd.
    const meterValues = r.deps.meterCalls.map(([m]) => m);
    expect(meterValues[meterValues.length - 1]).toBe(f.meterEnd);
    expect(meterValues[0]).toBe(f.meter.start);

    // Spins left ends at 0; total accumulates to the feature total.
    expect(r.deps.spinsLeftCalls[0]).toBe(f.spinsAwarded);
    expect(r.deps.spinsLeftCalls[r.deps.spinsLeftCalls.length - 1]).toBe(0);
    const totalCents = coinsToCents(f.totalWinCoins, r.store.bet, cpb);
    if (f.totalWinCoins > 0) {
      expect(r.deps.totalCalls[r.deps.totalCalls.length - 1]).toBe(totalCents);
    }
    // The outro banner carries the total and the reels return to the triggering base grid.
    const outro = r.deps.banners[r.deps.banners.length - 1];
    expect(outro?.[1]).toContain('TOTAL WIN');
    expect(r.deps.log).toContain('showStops');

    // Balance: bet debited once, full round credited.
    const expected = before - betCents(r.store.bet) + coinsToCents(outcome.totalWinCoins, r.store.bet, cpb);
    expect(r.store.get().balanceCents).toBe(expected);
    expect(r.store.get().phase).toBe('idle');
  });

  it('shows the retrigger banner and bumps spins-left when the outcome retriggers', async () => {
    const seed = 'feat-retrigger';
    const n = findFeatureNonce(seed, (o) => (o.feature?.spins.some((fs) => fs.retriggerSpins > 0) ?? false));
    const r = rig(seed);
    r.store.setSeed(seed, n);
    const f = spin(GAME_CONFIG, seed, n).feature;
    if (!f) throw new Error('expected feature');
    r.flow.spinPressed();
    await playOut(r);
    expect(r.deps.banners.some(([t]) => /\+\d+ FREE SPINS/.test(t))).toBe(true);
    const retriggerSpin = f.spins.find((fs) => fs.retriggerSpins > 0);
    if (!retriggerSpin) throw new Error('expected retrigger');
    expect(r.deps.spinsLeftCalls).toContain(retriggerSpin.spinsRemainingAfter);
  });

  it('buy free: cinematic plays first, then the feature; balance charged the buy cost', async () => {
    const seed = 'feat-buy';
    const r = rig(seed);
    const before = r.store.get().balanceCents;
    const expected = buySpin(GAME_CONFIG, seed, 0, 'free');
    void r.controller.buy('free');
    await flushMicrotasks();
    clock.tick(0.1);
    expect(r.deps.cinematicEvents[0]).toBe('begin:free');
    await playOut(r);
    expect(r.deps.cinematicEvents).toEqual(['begin:free', 'end']);
    const cost = 100 * betCents(r.store.bet);
    expect(r.store.get().balanceCents).toBe(before - cost + coinsToCents(expected.totalWinCoins, r.store.bet, cpb));
    expect(r.controller.outcome?.kind).toBe('buyFree');
  });

  it('buy super: meter starts ×3 with per-win stepping and the super banner', async () => {
    const seed = 'feat-super';
    const r = rig(seed);
    void r.controller.buy('super');
    await flushMicrotasks();
    clock.tick(0.1);
    expect(r.deps.cinematicEvents[0]).toBe('begin:super');
    await playOut(r);
    expect(r.deps.meterCalls[0]).toEqual([3, 0, 1]);
    expect(r.deps.banners.some(([t]) => t.includes('SUPER'))).toBe(true);
    const f = r.controller.outcome?.feature;
    expect(f?.tier).toBe('super');
    expect(f?.spinsAwarded).toBe(GAME_CONFIG.buy.super.spins);
  });

  it('skip-spamming through an entire feature lands on the identical end state', async () => {
    const seed = 'feat-skipspam';
    const n = findFeatureNonce(seed);
    // Reference run: no skipping.
    const a = rig(seed);
    a.store.setSeed(seed, n);
    a.flow.spinPressed();
    await playOut(a);
    // Spam run: skip pressed constantly.
    const b = rig(seed);
    b.store.setSeed(seed, n);
    b.flow.spinPressed();
    await playOut(b, 1);

    expect(b.store.get().balanceCents).toBe(a.store.get().balanceCents);
    expect(b.deps.meterCalls[b.deps.meterCalls.length - 1]).toEqual(a.deps.meterCalls[a.deps.meterCalls.length - 1]);
    expect(b.deps.spinsLeftCalls[b.deps.spinsLeftCalls.length - 1]).toBe(0);
    expect(b.deps.hudOn).toBe(false);
    expect(b.deps.bannerVisible).toBe(false);
    expect(b.store.get().phase).toBe('idle');
    // Spamming is faster (or at worst equal), never slower.
    expect(b.deps.totalCalls[b.deps.totalCalls.length - 1] ?? 0).toBe(a.deps.totalCalls[a.deps.totalCalls.length - 1] ?? 0);
  });

  it('spin presses during the feature only skip — they never queue a base spin', async () => {
    const seed = 'feat-nospin';
    const n = findFeatureNonce(seed);
    const r = rig(seed);
    r.store.setSeed(seed, n);
    r.flow.spinPressed();
    await playOut(r, 3);
    expect(r.store.get().nonce).toBe(n + 1); // exactly the one round
  });
});
