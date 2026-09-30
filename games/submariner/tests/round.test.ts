import { describe, expect, it } from 'vitest';
import { crashPoint, depthFor, floorMultiplier, multiplierAt, payoutCents, timeToReach, zoneFor } from '../src/game/crash';
import { BOARDING_SECONDS, RESULT_SECONDS, RoundState, START_BALANCE_CENTS, memoryStore } from '../src/game/RoundState';
import type { RoundEvent } from '../src/game/RoundState';
import { createSeededRandom } from '../src/utils/random';

const types = (events: RoundEvent[]): string[] => events.map((e) => e.type);

/** Run the state machine in small steps until `until` returns true (or a time limit). */
function run(state: RoundState, until: (e: RoundEvent[]) => boolean, limit = 600): RoundEvent[] {
  const all: RoundEvent[] = [];
  for (let t = 0; t < limit; t += 1 / 60) {
    const events = state.update(1 / 60);
    all.push(...events);
    if (until(events)) break;
  }
  return all;
}

/** A state whose next crash point is fixed: u = 1 - 0.97 / crash. */
function withCrash(crash: number, balance = START_BALANCE_CENTS): RoundState {
  const u = 1 - 0.97 / crash + 1e-12;
  return new RoundState(() => u, memoryStore(balance));
}

describe('crash maths', () => {
  it('maps U to the crash point with a 3% edge', () => {
    expect(crashPoint(0)).toBe(1);
    expect(crashPoint(0.5)).toBe(1.94);
    expect(crashPoint(0.99)).toBeCloseTo(97, 1);
    expect(crashPoint(0.999999999)).toBe(10_000);
  });

  it('has P(C >= x) = 0.97 / x (Monte Carlo)', () => {
    const rng = createSeededRandom(7);
    const n = 200_000;
    let over2 = 0;
    let over10 = 0;
    let instant = 0;
    for (let i = 0; i < n; i++) {
      const c = crashPoint(rng());
      if (c >= 2) over2++;
      if (c >= 10) over10++;
      if (c === 1) instant++;
    }
    expect(over2 / n).toBeCloseTo(0.485, 2);
    expect(over10 / n).toBeCloseTo(0.097, 2);
    expect(instant / n).toBeCloseTo(1 - 0.97 / 1.01, 2); // every raw value below 1.01 floors to 1.00
  });

  it('returns ~97% for a fixed cash-out target', () => {
    const rng = createSeededRandom(11);
    for (const target of [1.5, 2, 5]) {
      let paid = 0;
      const n = 200_000;
      for (let i = 0; i < n; i++) if (crashPoint(rng()) >= target) paid += target;
      expect(paid / n).toBeCloseTo(0.97, 1);
    }
  });

  it('grows the multiplier and depth consistently', () => {
    expect(multiplierAt(0)).toBe(1);
    expect(timeToReach(2)).toBeCloseTo(8.15, 1);
    expect(multiplierAt(timeToReach(7.5))).toBeCloseTo(7.5, 6);
    expect(depthFor(1)).toBe(0);
    expect(zoneFor(depthFor(2)).name).toBe('Twilight zone');
    expect(floorMultiplier(2.4999)).toBe(2.49);
    expect(payoutCents(1000, 2.4999)).toBe(2490);
  });
});

describe('round flow', () => {
  it('boards, dives, implodes and boards again', () => {
    const s = withCrash(1.5);
    expect(s.phase).toBe('boarding');
    const toDive = run(s, (e) => e.some((x) => x.type === 'dive'));
    expect(types(toDive).filter((t) => t === 'countdown')).toHaveLength(3);
    expect(s.phase).toBe('diving');
    const toCrash = run(s, (e) => e.some((x) => x.type === 'implode'));
    expect(s.phase).toBe('imploded');
    expect(s.revealedCrash).toBe(1.5);
    expect(s.history[0]).toBe(1.5);
    expect(types(toCrash)).toContain('implode');
    run(s, (e) => e.some((x) => x.type === 'boarding'));
    expect(s.phase).toBe('boarding');
    expect(s.round).toBe(2);
  });

  it('pays stake x multiplier on a manual cash-out and keeps the payout after the implosion', () => {
    const s = withCrash(3);
    s.placeBet({ stakeCents: 1000, autoCashout: null });
    expect(s.balanceCents).toBe(START_BALANCE_CENTS - 1000);
    run(s, () => s.phase === 'diving' && s.multiplier >= 2);
    const events = s.cashOut();
    const cash = events.find((e) => e.type === 'cashout');
    expect(cash && cash.type === 'cashout' && cash.multiplier).toBeGreaterThanOrEqual(2);
    const paid = s.bet!.payoutCents;
    expect(paid).toBe(Math.floor(1000 * s.bet!.cashedAt!));
    const after = run(s, (e) => e.some((x) => x.type === 'implode'));
    const imp = after.find((e) => e.type === 'implode');
    expect(imp && imp.type === 'implode' && imp.lostCents).toBe(0);
    expect(s.balanceCents).toBe(START_BALANCE_CENTS - 1000 + paid);
  });

  it('loses the stake when the hull implodes first', () => {
    const s = withCrash(1.8);
    s.placeBet({ stakeCents: 500, autoCashout: null });
    const events = run(s, (e) => e.some((x) => x.type === 'implode'));
    const imp = events.find((e) => e.type === 'implode');
    expect(imp && imp.type === 'implode' && imp.lostCents).toBe(500);
    expect(s.balanceCents).toBe(START_BALANCE_CENTS - 500);
    expect(s.cashOut()).toEqual([]); // too late
  });

  it('auto cash-out pays exactly the target when it is at or below the crash point', () => {
    const s = withCrash(2.5);
    s.placeBet({ stakeCents: 1000, autoCashout: 2.5 });
    run(s, (e) => e.some((x) => x.type === 'implode'));
    expect(s.bet!.cashedAt).toBe(2.5);
    expect(s.balanceCents).toBe(START_BALANCE_CENTS - 1000 + 2500);
  });

  it('auto cash-out above the crash point loses', () => {
    const s = withCrash(2.49);
    s.placeBet({ stakeCents: 1000, autoCashout: 2.5 });
    run(s, (e) => e.some((x) => x.type === 'implode'));
    expect(s.bet!.cashedAt).toBeNull();
    expect(s.balanceCents).toBe(START_BALANCE_CENTS - 1000);
  });

  it('an instant 1.00x implosion loses every bet', () => {
    const s = new RoundState(() => 0, memoryStore());
    s.placeBet({ stakeCents: 1000, autoCashout: 1.01 });
    const events = run(s, (e) => e.some((x) => x.type === 'implode'));
    expect(types(events)).toEqual(expect.arrayContaining(['dive', 'implode']));
    expect(s.revealedCrash).toBe(1);
    expect(s.balanceCents).toBe(START_BALANCE_CENTS - 1000);
  });

  it('cancelling during boarding refunds; bets during a dive queue for the next one', () => {
    const s = withCrash(5);
    s.placeBet({ stakeCents: 2000, autoCashout: null });
    expect(types(s.cancelBet())).toContain('betCancelled');
    expect(s.balanceCents).toBe(START_BALANCE_CENTS);
    run(s, () => s.phase === 'diving');
    const queued = s.placeBet({ stakeCents: 700, autoCashout: 3 });
    expect(queued[0]).toMatchObject({ type: 'betPlaced', queued: true });
    expect(s.balanceCents).toBe(START_BALANCE_CENTS); // not charged until it boards
    run(s, (e) => e.some((x) => x.type === 'boarding'));
    expect(s.bet).toMatchObject({ stakeCents: 700, autoCashout: 3 });
    expect(s.balanceCents).toBe(START_BALANCE_CENTS - 700);
  });

  it('rejects bets it cannot take and never goes negative', () => {
    const s = withCrash(2, 300);
    expect(types(s.placeBet({ stakeCents: 5, autoCashout: null }))).toEqual(['rejected']);
    expect(types(s.placeBet({ stakeCents: 500, autoCashout: null }))).toEqual(['rejected']);
    s.placeBet({ stakeCents: 300, autoCashout: null });
    expect(types(s.placeBet({ stakeCents: 100, autoCashout: null }))).toEqual(['rejected']);
    expect(s.balanceCents).toBe(0);
  });

  it('auto-bet repeats the last slip each boarding and stops when broke', () => {
    const s = withCrash(1.2, 1500);
    s.placeBet({ stakeCents: 1000, autoCashout: null });
    s.setAutoBet(true);
    run(s, (e) => e.some((x) => x.type === 'boarding'));
    // lost 1000 in round 1, 500 left: auto-bet cannot afford 1000
    expect(s.bet).toBeNull();
    expect(s.autoBet).toBe(false);
  });

  it('persists the balance', () => {
    const store = memoryStore();
    const s = new RoundState(() => 0.5, store);
    s.placeBet({ stakeCents: 1234, autoCashout: null });
    expect(store.load()).toBe(START_BALANCE_CENTS - 1234);
    expect(new RoundState(() => 0.5, store).balanceCents).toBe(START_BALANCE_CENTS - 1234);
  });

  it('phase timings match the constants', () => {
    const s = withCrash(1);
    run(s, (e) => e.some((x) => x.type === 'implode'));
    const started = s.phaseTime;
    run(s, (e) => e.some((x) => x.type === 'boarding'));
    expect(started).toBeLessThan(0.1);
    expect(BOARDING_SECONDS).toBe(6);
    expect(RESULT_SECONDS).toBeGreaterThan(3);
  });
});
