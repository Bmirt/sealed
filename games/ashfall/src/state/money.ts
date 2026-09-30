/**
 * Money helpers. All amounts are integer cents; the maths speaks in coins (20 per bet).
 */
export const CURRENCY = 'USD';
export const LOCALE = 'en-US';

const fmt = new Intl.NumberFormat(LOCALE, { style: 'currency', currency: CURRENCY, minimumFractionDigits: 2 });

export function formatCents(cents: number): string {
  return fmt.format(cents / 100);
}

export function betCents(betLevel: number): number {
  return Math.round(betLevel * 100);
}

/** Coins → cents for a given bet (exact: bet levels are validated to divide evenly). */
export function coinsToCents(coins: number, betLevel: number, coinsPerBet: number): number {
  return (coins * betCents(betLevel)) / coinsPerBet;
}

/** Win as a multiple of the bet (for tier thresholds). */
export function winMultiple(winCents: number, betLevel: number): number {
  const b = betCents(betLevel);
  return b > 0 ? winCents / b : 0;
}
