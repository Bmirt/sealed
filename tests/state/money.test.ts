import { describe, expect, it } from 'vitest';
import { GAME_CONFIG } from '@config/game.config';
import { betCents, coinsToCents, formatCents, winMultiple } from '@/state/money';

describe('money', () => {
  it('every bet level converts coins to whole cents', () => {
    for (const bet of GAME_CONFIG.betLevels) {
      for (const coins of [1, 3, 7, 22, 243, 38_880, 100_000]) {
        const cents = coinsToCents(coins, bet, GAME_CONFIG.coinsPerBet);
        expect(Number.isInteger(cents)).toBe(true);
      }
      // 20 coins = one bet.
      expect(coinsToCents(GAME_CONFIG.coinsPerBet, bet, GAME_CONFIG.coinsPerBet)).toBe(betCents(bet));
    }
  });

  it('formats en-GB euro', () => {
    expect(formatCents(100_000)).toBe('€1,000.00');
    expect(formatCents(5)).toBe('€0.05');
  });

  it('computes win multiples of the bet', () => {
    expect(winMultiple(1500, 1)).toBe(15);
    expect(winMultiple(20, 0.2)).toBe(1);
    expect(winMultiple(0, 0)).toBe(0);
  });
});
