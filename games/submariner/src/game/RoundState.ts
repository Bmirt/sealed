import { crashPoint, floorMultiplier, multiplierAt, payoutCents, timeToReach } from './crash';

/**
 * The round state machine and the player's money: the single source of truth the scene, HUD and
 * audio read from. No rendering, no DOM; everything happens through update(dt) and intents, and
 * every change is reported as an event.
 *
 *   boarding (countdown, bets open) → diving (multiplier climbs, cash out) → imploded (result) → boarding …
 */
export type Phase = 'boarding' | 'diving' | 'imploded';

export const BOARDING_SECONDS = 6;
export const RESULT_SECONDS = 3.5;
export const START_BALANCE_CENTS = 100_000;
export const MIN_STAKE_CENTS = 10;
export const MAX_STAKE_CENTS = 100_000;
export const MILESTONES = [2, 5, 10, 25, 50, 100, 250, 1000];

export interface BetSlip {
  stakeCents: number;
  /** Auto cash-out target, or null for manual. */
  autoCashout: number | null;
}

export interface ActiveBet extends BetSlip {
  cashedAt: number | null;
  payoutCents: number;
}

export type RoundEvent =
  | { type: 'boarding'; round: number }
  | { type: 'countdown'; secondsLeft: number }
  | { type: 'dive' }
  | { type: 'milestone'; multiplier: number }
  | { type: 'betPlaced'; slip: BetSlip; queued: boolean }
  | { type: 'betCancelled'; refundedCents: number }
  | { type: 'cashout'; multiplier: number; payoutCents: number; stakeCents: number; auto: boolean }
  | { type: 'implode'; crash: number; lostCents: number }
  | { type: 'rejected'; reason: string }
  | { type: 'balance'; balanceCents: number };

export interface MoneyStore {
  load(): number | null;
  save(balanceCents: number): void;
}

export const memoryStore = (initial: number | null = null): MoneyStore => {
  let value = initial;
  return { load: () => value, save: (v) => (value = v) };
};

export class RoundState {
  phase: Phase = 'boarding';
  /** Seconds spent in the current phase. */
  phaseTime = 0;
  round = 1;
  /** Current multiplier (1 while boarding; frozen at the crash point once imploded). */
  multiplier = 1;
  /** Recent crash points, newest first. */
  readonly history: number[] = [];
  balanceCents: number;
  bet: ActiveBet | null = null;
  /** A bet placed during a dive, waiting for the next boarding. */
  queued: BetSlip | null = null;
  autoBet = false;
  private lastSlip: BetSlip | null = null;
  private crash = 1;
  private nextMilestone = 0;
  private events: RoundEvent[] = [];

  constructor(
    private rng: () => number,
    private readonly store: MoneyStore = memoryStore(),
  ) {
    const saved = store.load();
    this.balanceCents = saved !== null && Number.isFinite(saved) && saved >= 0 ? Math.floor(saved) : START_BALANCE_CENTS;
    this.crash = crashPoint(this.rng());
  }

  setRng(rng: () => number): void {
    this.rng = rng;
  }

  /** Advance the simulation; returns everything that happened, in order. */
  update(dt: number): RoundEvent[] {
    this.phaseTime += dt;
    if (this.phase === 'boarding') {
      const left = BOARDING_SECONDS - this.phaseTime;
      const before = Math.ceil(left + dt);
      const now = Math.ceil(left);
      if (now < before && now >= 1 && now <= 3) this.emit({ type: 'countdown', secondsLeft: now });
      if (left <= 0) this.startDive();
    } else if (this.phase === 'diving') {
      this.advanceDive();
    } else if (this.phaseTime >= RESULT_SECONDS) {
      this.startBoarding();
    }
    return this.flush();
  }

  /** Seconds until the dive starts (boarding) or 0. */
  get countdown(): number {
    return this.phase === 'boarding' ? Math.max(0, BOARDING_SECONDS - this.phaseTime) : 0;
  }

  /** Multiplier for display and payouts (floored to 2 decimals). */
  get shownMultiplier(): number {
    return this.phase === 'imploded' ? this.crash : floorMultiplier(this.multiplier);
  }

  /** The crash point, only once it is public. */
  get revealedCrash(): number | null {
    return this.phase === 'imploded' ? this.crash : null;
  }

  // ---------------------------------------------------------------- intents

  placeBet(slip: BetSlip): RoundEvent[] {
    const stake = Math.floor(slip.stakeCents);
    const auto = slip.autoCashout !== null && slip.autoCashout >= 1.01 ? floorMultiplier(slip.autoCashout) : null;
    if (!Number.isFinite(stake) || stake < MIN_STAKE_CENTS) return this.reject(`Minimum stake is $${(MIN_STAKE_CENTS / 100).toFixed(2)}`);
    if (stake > MAX_STAKE_CENTS) return this.reject(`Maximum stake is $${(MAX_STAKE_CENTS / 100).toLocaleString('en-US')}`);
    const clean: BetSlip = { stakeCents: stake, autoCashout: auto };
    if (this.phase === 'boarding') {
      if (this.bet) return this.reject('You already have a bet on this dive');
      if (stake > this.balanceCents) return this.reject('Not enough balance');
      this.debit(stake);
      this.bet = { ...clean, cashedAt: null, payoutCents: 0 };
      this.lastSlip = clean;
      this.emit({ type: 'betPlaced', slip: clean, queued: false });
    } else {
      if (this.queued) return this.reject('A bet is already queued for the next dive');
      if (stake > this.balanceCents) return this.reject('Not enough balance');
      this.queued = clean;
      this.lastSlip = clean;
      this.emit({ type: 'betPlaced', slip: clean, queued: true });
    }
    return this.flush();
  }

  cancelBet(): RoundEvent[] {
    if (this.queued) {
      this.queued = null;
      this.emit({ type: 'betCancelled', refundedCents: 0 });
    } else if (this.phase === 'boarding' && this.bet) {
      const refund = this.bet.stakeCents;
      this.bet = null;
      this.credit(refund);
      this.emit({ type: 'betCancelled', refundedCents: refund });
    }
    return this.flush();
  }

  cashOut(): RoundEvent[] {
    if (this.phase === 'diving' && this.bet && this.bet.cashedAt === null) this.settle(floorMultiplier(this.multiplier), false);
    return this.flush();
  }

  setAutoBet(on: boolean): void {
    this.autoBet = on;
  }

  resetBalance(): RoundEvent[] {
    this.balanceCents = START_BALANCE_CENTS;
    this.store.save(this.balanceCents);
    this.emit({ type: 'balance', balanceCents: this.balanceCents });
    return this.flush();
  }

  /** Test/screenshot hook: jump to a phase deterministically. */
  debugJump(phase: Phase, multiplier = 1, crash = 2.5): RoundEvent[] {
    this.crash = Math.max(1, crash);
    if (phase === 'boarding') {
      this.startBoarding();
    } else {
      this.phase = 'diving';
      this.multiplier = 1;
      this.phaseTime = 0;
      this.nextMilestone = 0;
      if (phase === 'diving') {
        this.phaseTime = timeToReach(Math.min(multiplier, this.crash - 0.01));
        this.multiplier = multiplierAt(this.phaseTime);
        while ((MILESTONES[this.nextMilestone] ?? Infinity) <= this.multiplier) this.nextMilestone++;
      } else {
        this.phaseTime = timeToReach(this.crash);
        this.implode();
        this.phaseTime = 0.6;
      }
    }
    return this.flush();
  }

  // ---------------------------------------------------------------- internals

  private startBoarding(): void {
    if (this.phase === 'imploded') this.round += 1;
    this.phase = 'boarding';
    this.phaseTime = 0;
    this.multiplier = 1;
    this.bet = null;
    this.crash = crashPoint(this.rng());
    this.emit({ type: 'boarding', round: this.round });
    const slip = this.queued ?? (this.autoBet ? this.lastSlip : null);
    this.queued = null;
    if (slip) {
      if (slip.stakeCents <= this.balanceCents) {
        this.debit(slip.stakeCents);
        this.bet = { ...slip, cashedAt: null, payoutCents: 0 };
        this.emit({ type: 'betPlaced', slip, queued: false });
      } else {
        this.autoBet = false;
        this.emit({ type: 'rejected', reason: 'Not enough balance for your queued bet' });
      }
    }
  }

  private startDive(): void {
    this.phase = 'diving';
    this.phaseTime = 0;
    this.multiplier = 1;
    this.nextMilestone = 0;
    this.emit({ type: 'dive' });
    this.advanceDive();
  }

  private advanceDive(): void {
    const m = multiplierAt(this.phaseTime);
    const bet = this.bet;
    // An auto cash-out at or below the crash point always pays, even if this frame overshoots it.
    if (bet && bet.cashedAt === null && bet.autoCashout !== null && bet.autoCashout <= this.crash && m >= bet.autoCashout) {
      this.multiplier = bet.autoCashout;
      this.settle(bet.autoCashout, true);
    }
    if (m >= this.crash) {
      this.multiplier = this.crash;
      this.implode();
      return;
    }
    this.multiplier = m;
    while ((MILESTONES[this.nextMilestone] ?? Infinity) <= m) {
      this.emit({ type: 'milestone', multiplier: MILESTONES[this.nextMilestone]! });
      this.nextMilestone++;
    }
  }

  private settle(multiplier: number, auto: boolean): void {
    const bet = this.bet!;
    bet.cashedAt = multiplier;
    bet.payoutCents = payoutCents(bet.stakeCents, multiplier);
    this.credit(bet.payoutCents);
    this.emit({ type: 'cashout', multiplier, payoutCents: bet.payoutCents, stakeCents: bet.stakeCents, auto });
  }

  private implode(): void {
    this.phase = 'imploded';
    this.phaseTime = 0;
    this.history.unshift(this.crash);
    if (this.history.length > 30) this.history.length = 30;
    const lost = this.bet && this.bet.cashedAt === null ? this.bet.stakeCents : 0;
    this.emit({ type: 'implode', crash: this.crash, lostCents: lost });
  }

  private debit(cents: number): void {
    this.balanceCents -= cents;
    this.store.save(this.balanceCents);
    this.emit({ type: 'balance', balanceCents: this.balanceCents });
  }

  private credit(cents: number): void {
    this.balanceCents += cents;
    this.store.save(this.balanceCents);
    this.emit({ type: 'balance', balanceCents: this.balanceCents });
  }

  private reject(reason: string): RoundEvent[] {
    this.emit({ type: 'rejected', reason });
    return this.flush();
  }

  private emit(e: RoundEvent): void {
    this.events.push(e);
  }

  private flush(): RoundEvent[] {
    const out = this.events;
    this.events = [];
    return out;
  }
}
