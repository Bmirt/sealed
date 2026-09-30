import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { GAME_CONFIG } from '@config/game.config';
import { spin } from '@math/spin';
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

interface Rig {
  store: GameStore;
  controller: GameController;
  presenter: AnimatedPresenter;
  flow: SpinFlow;
  deps: FakeDeps;
}

function rig(seed = 'flow-seed'): Rig {
  const store = new GameStore(GAME_CONFIG, new MemoryPersistence());
  store.setSeed(seed, 0);
  store.set({ phase: 'idle' });
  const deps = new FakeDeps();
  const presenter = new AnimatedPresenter(deps, store, GAME_CONFIG);
  const controller = new GameController(GAME_CONFIG, store, presenter);
  const flow = new SpinFlow(store, controller, presenter, 50);
  return { store, controller, presenter, flow, deps };
}

/** Find a nonce whose base spin matches a predicate. */
function findNonce(seed: string, pred: (o: ReturnType<typeof spin>) => boolean, from = 0): number {
  for (let n = from; n < 400_000; n++) {
    if (pred(spin(GAME_CONFIG, seed, n))) return n;
  }
  throw new Error('no nonce found');
}

const cpb = GAME_CONFIG.coinsPerBet;

/**
 * Interleave clock ticks and microtask flushes until the round settles.
 * (A later presentation's timeline is only created after the previous one's promise resolves,
 * so time must advance in slices with microtasks flushed between them - like a real frame loop.)
 */
async function playOut(controller: GameController, store: GameStore, maxSeconds = 120): Promise<void> {
  for (let i = 0; i < maxSeconds * 2; i++) {
    await flushMicrotasks();
    if (store.get().phase === 'idle' && controller.roundInFlight === null) return;
    clock.tick(0.5, 8);
  }
  throw new Error('round did not settle');
}

describe('spin flow - skip & interrupt semantics', () => {
  it('a full spin runs reels → wins → idle and credits exactly the outcome', async () => {
    const seed = 'full';
    const n = findNonce(seed, (o) => o.base.totalWinCoins > 0 && !o.feature);
    const { store, controller, flow, deps } = rig(seed);
    store.setSeed(seed, n);
    const expected = spin(GAME_CONFIG, seed, n);
    const before = store.get().balanceCents;

    flow.spinPressed();
    await flushMicrotasks();
    expect(store.get().phase).toBe('spinning');
    await playOut(controller, store);
    expect(store.get().phase).toBe('idle');
    const winCents = coinsToCents(expected.totalWinCoins, store.bet, cpb);
    expect(store.get().balanceCents).toBe(before - betCents(store.bet) + winCents);
    expect(deps.counterValue).toBe(coinsToCents(expected.base.totalWinCoins, store.bet, cpb));
  });

  it('SPIN during the reel spin slam-stops (same outcome, no new spin, no double debit)', async () => {
    const seed = 'slam';
    const n = findNonce(seed, (o) => o.base.totalWinCoins === 0);
    const { store, controller, flow } = rig(seed);
    store.setSeed(seed, n);
    const expected = spin(GAME_CONFIG, seed, n);
    const before = store.get().balanceCents;

    flow.spinPressed();
    await flushMicrotasks();
    clock.tick(0.2);
    expect(store.get().phase).toBe('spinning');
    flow.spinPressed(); // slam stop
    await flushMicrotasks();
    await controller.roundInFlight;
    expect(store.get().phase).toBe('idle');
    expect(store.get().nonce).toBe(n + 1); // exactly one round
    expect(store.get().balanceCents).toBe(before - betCents(store.bet));
    expect(controller.outcome).toEqual(expected);
  });

  it('SPIN during the win presentation finishes it (full credit) and starts the next spin', async () => {
    const seed = 'interrupt';
    const n = findNonce(seed, (o) => o.base.totalWinCoins > 0 && !o.feature);
    const { store, controller, flow, presenter, deps } = rig(seed);
    store.setSeed(seed, n);
    const first = spin(GAME_CONFIG, seed, n);
    const firstWin = coinsToCents(first.base.totalWinCoins, store.bet, cpb);
    const before = store.get().balanceCents;

    flow.spinPressed();
    await flushMicrotasks();
    // Play until the win presentation is up.
    while (presenter.stage !== 'wins') {
      clock.tick(0.2, 4);
      await flushMicrotasks();
    }
    clock.tick(0.05);
    expect(deps.counterValue).toBeLessThan(firstWin);

    flow.spinPressed(); // abort + respin
    await flushMicrotasks();
    await flushMicrotasks();
    // First round fully credited despite the interrupt; second round debited and running.
    expect(store.get().nonce).toBe(n + 2);
    expect(deps.counterValue).toBe(firstWin); // counter snapped to the full amount, exactly once
    expect(store.get().phase).toBe('spinning');
    const expectedBalance = before - betCents(store.bet) + firstWin - betCents(store.bet);
    // Let the second round finish naturally.
    await playOut(controller, store);
    const second = spin(GAME_CONFIG, seed, n + 1);
    expect(store.get().balanceCents).toBe(expectedBalance + coinsToCents(second.totalWinCoins, store.bet, cpb));
    expect(store.get().phase).toBe('idle');
  });

  it('canvas click (skip) during the win presentation snaps it but does NOT start a spin', async () => {
    const seed = 'clickskip';
    const n = findNonce(seed, (o) => o.base.totalWinCoins > 0 && !o.feature);
    const { store, controller, flow, presenter, deps } = rig(seed);
    store.setSeed(seed, n);
    const winCents = coinsToCents(spin(GAME_CONFIG, seed, n).base.totalWinCoins, store.bet, cpb);

    flow.spinPressed();
    await flushMicrotasks();
    while (presenter.stage !== 'wins') {
      clock.tick(0.2, 4);
      await flushMicrotasks();
    }
    flow.skipPressed();
    await flushMicrotasks();
    expect(deps.counterValue).toBe(winCents);
    await playOut(controller, store);
    expect(store.get().phase).toBe('idle');
    expect(store.get().nonce).toBe(n + 1); // no extra spin
  });

  it('big-win tier: first skip snaps the counter, overlay stays; second skip dismisses; turbo never pre-empts it', async () => {
    const seed = 'bigwin';
    const n = findNonce(seed, (o) => !o.feature && o.base.totalWinCoins >= 15 * cpb && o.base.totalWinCoins < 100 * cpb);
    const { store, controller, flow, presenter, deps } = rig(seed);
    store.set({ turboMode: 'quick' }); // quick mode must still play the tier at full length
    store.setSeed(seed, n);
    const total = coinsToCents(spin(GAME_CONFIG, seed, n).base.totalWinCoins, store.bet, cpb);

    flow.spinPressed();
    await flushMicrotasks();
    while (presenter.stage !== 'tier') {
      clock.tick(0.15, 3);
      await flushMicrotasks();
    }
    clock.tick(0.7, 8); // into the tier roll
    expect(deps.tierVisible).toBe(true);
    expect(deps.tierCounterValue).toBeLessThan(total);
    flow.skipPressed(); // snap the roll
    await flushMicrotasks();
    expect(deps.tierCounterValue).toBe(total);
    expect(deps.tierVisible).toBe(true); // still holding
    flow.skipPressed(); // dismiss the hold
    await flushMicrotasks();
    expect(deps.tierVisible).toBe(false);
    await playOut(controller, store);
    expect(store.get().phase).toBe('idle');
  });

  it('holding SPIN auto-repeats as soon as the game is idle', async () => {
    const seed = 'hold';
    const { store, flow, controller } = rig(seed);
    flow.holdStart();
    flow.spinPressed();
    await flushMicrotasks();
    expect(store.get().phase).toBe('spinning');
    // Finish round 1.
    await playOut(controller, store);
    expect(store.get().phase).toBe('idle');
    // The repeat timer is a real setTimeout(50ms).
    await new Promise((r) => setTimeout(r, 80));
    await flushMicrotasks();
    expect(store.get().nonce).toBe(2); // second spin started by the hold
    flow.holdEnd();
    await playOut(controller, store);
    await new Promise((r) => setTimeout(r, 80));
    expect(store.get().nonce).toBe(2); // released - no third spin
  });

  it('anticipation plays in turbo mode (never auto-skipped) but a deliberate skip cuts it', async () => {
    const seed = 'anticipate';
    // Two scatters on reels 1–2 → anticipation, regardless of win.
    const n = findNonce(seed, (o) => {
      const byReel = o.base.scatter.positions.map(([r]) => r);
      return byReel.filter((r) => r <= 1).length >= 2 && !o.feature;
    });
    const { store, controller, flow, presenter, deps } = rig(seed);
    store.set({ turboMode: 'turbo' });
    store.setSeed(seed, n);

    flow.spinPressed();
    await flushMicrotasks();
    clock.tick(3, 60); // way past the turbo reel time - anticipation must still be running
    expect(deps.log).toContain('ant:start');
    expect(store.get().phase).toBe('spinning');
    expect(presenter.stage).toBe('reels');
    flow.skipPressed(); // deliberate skip IS allowed
    await flushMicrotasks();
    await playOut(controller, store);
    expect(store.get().phase).toBe('idle');
    expect(controller.outcome?.nonce).toBe(n);
  });

  it('spamming skip and spin never double-credits or wedges the flow', async () => {
    const seed = 'chaos';
    const { store, controller, flow } = rig(seed);
    const bets = 6;
    store.credit(1_000_000);
    const start = store.get().balanceCents;
    for (let i = 0; i < bets; i++) {
      flow.spinPressed();
      await flushMicrotasks();
      // Hammer inputs at random-ish moments.
      clock.tick(0.15, 3);
      flow.skipPressed();
      flow.spinPressed();
      await flushMicrotasks();
      clock.tick(0.3, 5);
      flow.skipPressed();
      await flushMicrotasks();
      await playOut(controller, store);
      if (store.get().nonce >= bets) break;
    }
    // Drain anything still going.
    await playOut(controller, store);
    expect(store.get().phase).toBe('idle');
    const played = store.get().nonce;
    let expected = start;
    for (let i = 0; i < played; i++) {
      const o = spin(GAME_CONFIG, seed, i);
      expected += coinsToCents(o.totalWinCoins, store.bet, cpb) - betCents(store.bet);
    }
    expect(store.get().balanceCents).toBe(expected);
  });
});
