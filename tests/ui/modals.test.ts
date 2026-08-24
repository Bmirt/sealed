// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { GAME_CONFIG } from '@config/game.config';
import type { GameConfig } from '@math/types';
import { GameStore, MemoryPersistence } from '@/state/GameStore';
import { formatCents } from '@/state/money';
import { openAutoplayModal } from '@/ui/AutoplayModal';
import { openBuyModal } from '@/ui/BuyBonusModal';
import { Modal } from '@/ui/Modal';

function makeStore(config: GameConfig = GAME_CONFIG): GameStore {
  const store = new GameStore(config, new MemoryPersistence());
  store.set({ phase: 'idle' });
  return store;
}

afterEach(() => {
  Modal.closeAll();
  document.body.innerHTML = '';
});

describe('buy modal', () => {
  it('shows both tiers with the exact cost at the current stake and the feature RTPs', () => {
    const store = makeStore();
    store.betUp(); // €2
    const bet = store.bet;
    openBuyModal(document.body, GAME_CONFIG, store, () => undefined);
    const text = document.body.textContent ?? '';
    expect(Modal.anyOpen).toBe(true);
    expect(text).toContain('Summon the Dragons');
    expect(text).toContain('Wake the Elder');
    expect(text).toContain(formatCents(100 * Math.round(bet * 100)));
    expect(text).toContain(formatCents(300 * Math.round(bet * 100)));
    expect(text).toContain(`${(GAME_CONFIG.rtp.declaredBuyFree * 100).toFixed(1)}%`);
    expect(text).toContain(`${(GAME_CONFIG.rtp.declaredBuySuper * 100).toFixed(1)}%`);
  });

  it('confirming a tier closes the modal and reports the tier once', () => {
    const store = makeStore();
    const bought: string[] = [];
    openBuyModal(document.body, GAME_CONFIG, store, (tier) => bought.push(tier));
    (document.querySelector('[data-buy="free"]') as HTMLButtonElement).click();
    expect(bought).toEqual(['free']);
    expect(Modal.anyOpen).toBe(false);
  });

  it('disables tiers the balance cannot cover and says so', () => {
    const store = makeStore();
    // €1 bet: free costs €100, super €300. Leave €150.
    store.debit(store.get().balanceCents - 15_000);
    openBuyModal(document.body, GAME_CONFIG, store, () => undefined);
    const freeBtn = document.querySelector('[data-buy="free"]') as HTMLButtonElement;
    const superBtn = document.querySelector('[data-buy="super"]') as HTMLButtonElement;
    expect(freeBtn.disabled).toBe(false);
    expect(superBtn.disabled).toBe(true);
    expect(document.body.textContent).toContain('Insufficient balance');
  });

  it('respects the bonus-buy flags: disabled kills the modal, superTier hides the second card', () => {
    const off: GameConfig = { ...GAME_CONFIG, features: { ...GAME_CONFIG.features, bonusBuy: { enabled: false, superTier: true } } };
    expect(openBuyModal(document.body, off, makeStore(off), () => undefined)).toBeNull();
    expect(Modal.anyOpen).toBe(false);

    const noSuper: GameConfig = { ...GAME_CONFIG, features: { ...GAME_CONFIG.features, bonusBuy: { enabled: true, superTier: false } } };
    openBuyModal(document.body, noSuper, makeStore(noSuper), () => undefined);
    expect(document.body.textContent).toContain('Summon the Dragons');
    expect(document.body.textContent).not.toContain('Wake the Elder');
  });

  it('Escape closes the dialog', () => {
    openBuyModal(document.body, GAME_CONFIG, makeStore(), () => undefined);
    expect(Modal.anyOpen).toBe(true);
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    expect(Modal.anyOpen).toBe(false);
  });
});

describe('autoplay modal', () => {
  it('offers the configured counts and reports the choice with the stop-on-feature flag', () => {
    const onStart = vi.fn();
    openAutoplayModal(document.body, GAME_CONFIG, onStart);
    for (const n of GAME_CONFIG.features.autoplay.options) {
      expect(document.querySelector(`[data-count="${n}"]`)).not.toBeNull();
    }
    const checkbox = document.getElementById('ap-stop-feature') as HTMLInputElement;
    checkbox.checked = false;
    checkbox.dispatchEvent(new Event('change'));
    (document.querySelector('[data-count="25"]') as HTMLButtonElement).click();
    expect(onStart).toHaveBeenCalledWith(25, false);
    expect(Modal.anyOpen).toBe(false);
  });

  it('is removed entirely by the autoplay flag', () => {
    const off: GameConfig = { ...GAME_CONFIG, features: { ...GAME_CONFIG.features, autoplay: { enabled: false, options: [] } } };
    expect(openAutoplayModal(document.body, off, () => undefined)).toBeNull();
  });
});
