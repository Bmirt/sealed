import { describe, expect, it } from 'vitest';
import { GAME_CONFIG } from '@config/game.config';
import { spin } from '@math/spin';
import { Autoplay } from '@/state/Autoplay';
import { GameController } from '@/state/GameController';
import type { OutcomePresenter } from '@/state/GameController';
import { GameStore, MemoryPersistence } from '@/state/GameStore';
import { betCents } from '@/state/money';

/** Instant presenter — rounds resolve immediately. */
const instant: OutcomePresenter = {
  presentBase: () => Promise.resolve(),
  presentFeature: () => Promise.resolve(),
  abortToEndState: () => undefined,
};

function rig(seed: string): { store: GameStore; controller: GameController; autoplay: Autoplay } {
  const store = new GameStore(GAME_CONFIG, new MemoryPersistence());
  store.setSeed(seed, 0);
  store.set({ phase: 'idle' });
  const controller = new GameController(GAME_CONFIG, store, instant);
  const autoplay = new Autoplay(store, controller, 1);
  return { store, controller, autoplay };
}

async function settle(store: GameStore, maxMs = 4000): Promise<void> {
  const t0 = Date.now();
  for (;;) {
    await new Promise((r) => setTimeout(r, 10));
    const s = store.get();
    if (s.phase === 'idle' && s.autoplayRemaining === 0) return;
    if (Date.now() - t0 > maxMs) throw new Error(`autoplay did not settle (remaining ${s.autoplayRemaining})`);
  }
}

function firstFeatureNonce(seed: string): number {
  for (let n = 0; n < 200_000; n++) if (spin(GAME_CONFIG, seed, n).feature) return n;
  throw new Error('no feature');
}

describe('Autoplay', () => {
  it('plays exactly N spins and stops', async () => {
    const seed = 'auto-n';
    // Ensure no feature interferes in the first 10 spins.
    for (let n = 0; n < 10; n++) {
      if (spin(GAME_CONFIG, seed, n).feature) throw new Error('pick another seed for this test');
    }
    const { store, autoplay } = rig(seed);
    autoplay.start(10, true);
    await settle(store);
    expect(store.get().nonce).toBe(10);
  });

  it('stops when a feature triggers (stop-on-feature on)', async () => {
    const seed = 'auto-feature';
    const featureAt = firstFeatureNonce(seed);
    const { store, autoplay } = rig(seed);
    autoplay.start(featureAt + 50, true);
    await settle(store, 30_000);
    expect(store.get().nonce).toBe(featureAt + 1); // stopped right after the triggering round
  });

  it('continues through a feature when stop-on-feature is off', async () => {
    const seed = 'auto-feature';
    const featureAt = firstFeatureNonce(seed);
    const count = featureAt + 3;
    const { store, autoplay } = rig(seed);
    store.credit(100_000_000);
    autoplay.start(count, false);
    await settle(store, 30_000);
    expect(store.get().nonce).toBe(count);
  });

  it('stops when the balance cannot cover the next bet', async () => {
    const seed = 'dead-run'; // first two spins of this seed are losses
    const { store, autoplay } = rig(seed);
    // Leave enough for exactly 2 bets (wins may extend it, so pick a dead run).
    let deadRun = 0;
    for (let n = 0; n < 10; n++) {
      if (spin(GAME_CONFIG, seed, n).totalWinCoins === 0) deadRun++;
      else break;
    }
    expect(deadRun).toBeGreaterThanOrEqual(2);
    store.debit(store.get().balanceCents - 2 * betCents(store.bet));
    autoplay.start(50, true);
    await settle(store);
    expect(store.get().nonce).toBe(2);
    expect(store.get().balanceCents).toBe(0);
  });

  it('the stop button halts a session', async () => {
    const seed = 'auto-stop';
    const { store, autoplay } = rig(seed);
    autoplay.start(100, true);
    await new Promise((r) => setTimeout(r, 30));
    autoplay.stop();
    const nonceAtStop = store.get().nonce;
    await new Promise((r) => setTimeout(r, 60));
    expect(store.get().autoplayRemaining).toBe(0);
    expect(store.get().nonce).toBeLessThanOrEqual(nonceAtStop + 1); // at most the in-flight round
    expect(store.get().nonce).toBeLessThan(100);
  });

  it('respects the feature flag', () => {
    const cfg = { ...GAME_CONFIG, features: { ...GAME_CONFIG.features, autoplay: { enabled: false, options: [10] } } };
    const store = new GameStore(cfg, new MemoryPersistence());
    store.set({ phase: 'idle' });
    const controller = new GameController(cfg, store, instant);
    const autoplay = new Autoplay(store, controller, 1);
    autoplay.start(10, true);
    expect(store.get().autoplayRemaining).toBe(0);
  });
});
