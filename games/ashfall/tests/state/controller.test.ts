import { describe, expect, it } from 'vitest';
import { GAME_CONFIG } from '@config/game.config';
import { buySpin, buyCostCoins } from '@math/buy';
import { spin } from '@math/spin';
import type { GameConfig, SpinOutcome } from '@math/types';
import { GameController } from '@/state/GameController';
import type { OutcomePresenter } from '@/state/GameController';
import { GameStore, MemoryPersistence, STARTING_BALANCE_CENTS } from '@/state/GameStore';
import type { Phase } from '@/state/GameStore';
import { betCents, coinsToCents } from '@/state/money';

class FakePresenter implements OutcomePresenter {
  readonly calls: string[] = [];
  readonly phasesSeen: Phase[] = [];
  constructor(private readonly store: GameStore) {}
  presentBase(): Promise<void> {
    this.calls.push('base');
    this.phasesSeen.push(this.store.get().phase);
    return Promise.resolve();
  }
  presentFeature(): Promise<void> {
    this.calls.push('feature');
    this.phasesSeen.push(this.store.get().phase);
    return Promise.resolve();
  }
  abortToEndState(): void {
    this.calls.push('abort');
  }
}

function setup(config: GameConfig = GAME_CONFIG): { store: GameStore; controller: GameController; presenter: FakePresenter; insufficient: number[] } {
  const store = new GameStore(config, new MemoryPersistence());
  store.set({ phase: 'idle' });
  const presenter = new FakePresenter(store);
  const insufficient: number[] = [];
  const controller = new GameController(config, store, presenter, { onInsufficientBalance: (c) => insufficient.push(c) });
  return { store, controller, presenter, insufficient };
}

describe('GameController', () => {
  it('debits the bet, plays the maths outcome for the reserved nonce and credits exactly the outcome win', async () => {
    const { store, controller, presenter } = setup();
    const { seed } = store.get();
    const bet = store.bet;
    const expected = spin(GAME_CONFIG, seed, 0);
    expect(await controller.spin()).toBe(true);
    const o = controller.outcome;
    expect(o).toEqual(expected);
    const winCents = coinsToCents(expected.totalWinCoins, bet, GAME_CONFIG.coinsPerBet);
    expect(store.get().balanceCents).toBe(STARTING_BALANCE_CENTS - betCents(bet) + winCents);
    expect(store.get().lastWinCents).toBe(winCents);
    expect(store.get().nonce).toBe(1);
    expect(store.get().phase).toBe('idle');
    expect(presenter.calls[0]).toBe('base');
    expect(presenter.phasesSeen[0]).toBe('spinning');
    if (expected.feature) {
      expect(presenter.calls).toEqual(['base', 'feature']);
      expect(presenter.phasesSeen[1]).toBe('feature');
    } else {
      expect(presenter.calls).toEqual(['base']);
    }
  });

  it('plays many rounds with the balance always equal to start − bets + outcome wins', async () => {
    const { store, controller } = setup();
    store.credit(10_000_000);
    const start = store.get().balanceCents;
    const { seed } = store.get();
    const bet = store.bet;
    let expectedBalance = start;
    for (let n = 0; n < 300; n++) {
      const o = spin(GAME_CONFIG, seed, n);
      expectedBalance += coinsToCents(o.totalWinCoins, bet, GAME_CONFIG.coinsPerBet) - betCents(bet);
      expect(await controller.spin()).toBe(true);
      expect(store.get().balanceCents).toBe(expectedBalance);
    }
  });

  it('refuses to spin with insufficient balance and reports the needed amount', async () => {
    const { store, controller, insufficient } = setup();
    store.debit(store.get().balanceCents - 10);
    expect(await controller.spin()).toBe(false);
    expect(insufficient).toEqual([betCents(store.bet)]);
    expect(store.get().nonce).toBe(0); // no nonce consumed
    expect(store.get().balanceCents).toBe(10);
  });

  it('refuses to spin while a round is in progress', async () => {
    const { store, controller } = setup();
    store.set({ phase: 'presenting' });
    expect(await controller.spin()).toBe(false);
    expect(store.get().nonce).toBe(0);
  });

  it('buys a feature: charges the tier cost, plays buySpin for the nonce, credits the full round', async () => {
    const { store, controller, presenter } = setup();
    store.credit(1_000_000);
    const start = store.get().balanceCents;
    const bet = store.bet;
    const { seed } = store.get();
    const expected = buySpin(GAME_CONFIG, seed, 0, 'super');
    expect(await controller.buy('super')).toBe(true);
    expect(controller.outcome).toEqual(expected);
    const cost = coinsToCents(buyCostCoins(GAME_CONFIG, 'super'), bet, GAME_CONFIG.coinsPerBet);
    expect(cost).toBe(300 * betCents(bet));
    expect(store.get().balanceCents).toBe(start - cost + coinsToCents(expected.totalWinCoins, bet, GAME_CONFIG.coinsPerBet));
    expect(presenter.calls).toEqual(['base', 'feature']);
  });

  it('buy respects the feature flags and the balance', async () => {
    const disabled: GameConfig = { ...GAME_CONFIG, features: { ...GAME_CONFIG.features, bonusBuy: { enabled: false, superTier: true } } };
    const a = setup(disabled);
    expect(await a.controller.buy('free')).toBe(false);

    const noSuper: GameConfig = { ...GAME_CONFIG, features: { ...GAME_CONFIG.features, bonusBuy: { enabled: true, superTier: false } } };
    const b = setup(noSuper);
    expect(await b.controller.buy('super')).toBe(false);
    expect(await b.controller.buy('free')).toBe(true);

    const c = setup();
    c.store.debit(c.store.get().balanceCents - 100);
    expect(await c.controller.buy('free')).toBe(false);
    expect(c.insufficient).toEqual([100 * betCents(c.store.bet)]);
  });

  it('replay plays a given outcome without charging a bet', async () => {
    const { store, controller } = setup();
    const o: SpinOutcome = spin(GAME_CONFIG, 'replay', 3);
    const before = store.get().balanceCents;
    await controller.replay(o);
    expect(store.get().balanceCents).toBe(before + coinsToCents(o.totalWinCoins, store.bet, GAME_CONFIG.coinsPerBet));
    expect(store.get().nonce).toBe(0);
  });
});
