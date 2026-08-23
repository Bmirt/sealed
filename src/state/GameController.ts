import { spin } from '@math/spin';
import { buySpin, buyCostCoins } from '@math/buy';
import type { FeatureTier, GameConfig, SpinOutcome } from '@math/types';
import type { GameStore } from './GameStore';
import { betCents, coinsToCents } from './money';

/**
 * What the controller needs from the rendering side. Stage 2 ships a static presenter (snap to
 * result); stage 3 swaps in the animated one. The controller never touches outcomes.
 */
export interface OutcomePresenter {
  /** Show the base spin result. Resolves when the player may be credited / may spin again. */
  presentBase(outcome: SpinOutcome, opts: { readonly bet: number }): Promise<void>;
  /** Show the feature (stage 4). Stage 2: resolves immediately after showing the last free spin. */
  presentFeature(outcome: SpinOutcome, opts: { readonly bet: number }): Promise<void>;
  /** Abort whatever is on screen to its end state (stage 3). */
  abortToEndState(): void;
}

export interface ControllerEvents {
  onRoundStart?: (outcome: SpinOutcome) => void;
  onRoundEnd?: (outcome: SpinOutcome, winCents: number) => void;
  onInsufficientBalance?: (neededCents: number) => void;
}

/**
 * The game loop: debit → maths → present → credit. Owns the nonce; owns no RNG of its own.
 */
export class GameController {
  readonly config: GameConfig;
  readonly store: GameStore;
  private presenter: OutcomePresenter;
  private events: ControllerEvents;
  private lastOutcome: SpinOutcome | null = null;

  constructor(config: GameConfig, store: GameStore, presenter: OutcomePresenter, events: ControllerEvents = {}) {
    this.config = config;
    this.store = store;
    this.presenter = presenter;
    this.events = events;
  }

  setPresenter(presenter: OutcomePresenter): void {
    this.presenter = presenter;
  }

  get outcome(): SpinOutcome | null {
    return this.lastOutcome;
  }

  get canSpin(): boolean {
    return this.store.get().phase === 'idle';
  }

  /** A normal spin at the current bet. Returns false if nothing happened. */
  async spin(): Promise<boolean> {
    if (!this.canSpin) return false;
    const bet = this.store.bet;
    const cost = betCents(bet);
    if (!this.store.debit(cost)) {
      this.events.onInsufficientBalance?.(cost);
      return false;
    }
    const { seed, nonce } = this.store.nextNonce();
    const outcome = spin(this.config, seed, nonce);
    await this.runRound(outcome, bet);
    return true;
  }

  /** Buy a feature at the current bet. */
  async buy(tier: FeatureTier): Promise<boolean> {
    if (!this.canSpin) return false;
    if (!this.config.features.bonusBuy.enabled) return false;
    if (tier === 'super' && !this.config.features.bonusBuy.superTier) return false;
    const bet = this.store.bet;
    const cost = coinsToCents(buyCostCoins(this.config, tier), bet, this.config.coinsPerBet);
    if (!this.store.debit(cost)) {
      this.events.onInsufficientBalance?.(cost);
      return false;
    }
    const { seed, nonce } = this.store.nextNonce();
    const outcome = buySpin(this.config, seed, nonce, tier);
    await this.runRound(outcome, bet);
    return true;
  }

  /** Dev/testing: play a specific outcome without touching the balance for the bet. */
  async replay(outcome: SpinOutcome): Promise<void> {
    if (!this.canSpin) return;
    await this.runRound(outcome, this.store.bet);
  }

  private async runRound(outcome: SpinOutcome, bet: number): Promise<void> {
    this.lastOutcome = outcome;
    const cpb = this.config.coinsPerBet;
    this.store.set({ phase: 'spinning', lastWinCents: 0, message: null });
    this.events.onRoundStart?.(outcome);

    await this.presenter.presentBase(outcome, { bet });
    const baseWin = coinsToCents(outcome.base.totalWinCoins, bet, cpb);
    this.store.credit(baseWin);
    this.store.set({ lastWinCents: baseWin });

    let featureWin = 0;
    if (outcome.feature) {
      this.store.set({ phase: 'feature' });
      await this.presenter.presentFeature(outcome, { bet });
      featureWin = coinsToCents(outcome.feature.totalWinCoins, bet, cpb);
      this.store.credit(featureWin);
    }

    const total = baseWin + featureWin;
    this.store.set({ phase: 'idle', lastWinCents: total, stripSet: 'base' });
    this.events.onRoundEnd?.(outcome, total);
  }
}
