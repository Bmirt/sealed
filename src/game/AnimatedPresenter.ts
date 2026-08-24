import { gsap } from 'gsap';
import { SPEED_PROFILES, tierFor, WIN_TIERS } from '@config/speeds';
import { contextFor } from '@math/context';
import type { GameConfig, SpinOutcome, WayWin } from '@math/types';
import type { OutcomePresenter } from '@/state/GameController';
import type { GameStore } from '@/state/GameStore';
import { betCents, coinsToCents } from '@/state/money';
import { Sequencer } from '@/presentation/Sequencer';
import { InstantPresentation, TimelinePresentation } from '@/presentation/Presentation';
import { anticipationReels, buildReelSpin } from './anim/reelSpin';
import type { SpinnableReel } from './anim/reelSpin';
import { buildTierHold, buildTierRoll, buildWinShow } from './anim/winShow';
import type { TierSurface, WinShowSurface } from './anim/winShow';

export type PresenterStage = 'idle' | 'reels' | 'wins' | 'tier' | 'feature';

/**
 * Everything the presenter needs from the rendering side, Pixi-free.
 * `PixiPresenterDeps` adapts the real scene; tests provide fakes — so the REAL presentation
 * flow (sequencing, skip, abort, stage tracking) is what the tests exercise.
 */
export interface PresenterDeps {
  reels(): SpinnableReel[];
  setStripSet(set: 'base' | 'free'): void;
  setBackground(variant: 'base' | 'free'): void;
  /** Snap the reels to stops (used by the stage-4 feature placeholder). */
  showStops(stops: readonly number[], set: 'base' | 'free'): void;
  readonly winSurface: WinShowSurface & { prepare(wins: readonly WayWin[]): void };
  readonly tierSurface: TierSurface;
  readonly anticipation: { start(reel: number): void; end(reel: number): void; reset(): void };
  readonly cycle: { show(win: WayWin, betCents: number, coinsPerBet: number): void; clear(): void };
  landPuff(reel: number): void;
  resetOverlay(): void;
}

/**
 * The stage-3 presenter: animated reel spins, anticipation, win presentation with tiers.
 * Everything runs through one Sequencer, so skip/abort semantics are uniform.
 * (The feature presentation is still a static placeholder until stage 4.)
 */
export class AnimatedPresenter implements OutcomePresenter {
  private readonly deps: PresenterDeps;
  private readonly store: GameStore;
  private readonly config: GameConfig;
  private readonly seq = new Sequencer();
  private cycleTl: gsap.core.Timeline | null = null;
  private stageName: PresenterStage = 'idle';

  constructor(deps: PresenterDeps, store: GameStore, config: GameConfig) {
    this.deps = deps;
    this.store = store;
    this.config = config;
  }

  get stage(): PresenterStage {
    return this.stageName;
  }

  skipCurrent(): void {
    this.seq.skipCurrent();
  }

  abortToEndState(): void {
    this.stopCycle();
    this.seq.abortToEndState();
  }

  async presentBase(outcome: SpinOutcome, opts: { readonly bet: number }): Promise<void> {
    this.stopCycle();
    this.deps.resetOverlay();
    this.deps.anticipation.reset();
    this.deps.setBackground('base');
    this.deps.setStripSet('base');

    const profile = SPEED_PROFILES[this.store.get().turboMode];
    const ctx = contextFor(this.config);
    const scatterByReel = outcome.base.grid.map((col) => col.filter((c) => c === ctx.scatterCode).length);
    const plan = { stops: outcome.base.stops, anticipation: anticipationReels(scatterByReel) };

    this.stageName = 'reels';
    this.seq.enqueue(
      new TimelinePresentation('reels', (tl) => {
        buildReelSpin(tl, this.deps.reels(), plan, profile, {
          onReelLand: (r) => this.deps.landPuff(r),
          onAnticipationStart: (r) => this.deps.anticipation.start(r),
          onAnticipationEnd: (r) => this.deps.anticipation.end(r),
        });
        // Whatever happens (skip included), the anticipation dressing ends with the spin.
        tl.add(() => this.deps.anticipation.reset());
      }),
    );

    const totalCents = coinsToCents(outcome.base.totalWinCoins, opts.bet, this.config.coinsPerBet);
    const bCents = betCents(opts.bet);
    const multiple = bCents > 0 ? totalCents / bCents : 0;

    if (outcome.base.totalWinCoins > 0) {
      this.seq.enqueue(
        new InstantPresentation('stage:wins', () => {
          this.stageName = 'wins';
          this.deps.winSurface.prepare(this.flareWins(outcome));
        }),
        new TimelinePresentation('wins', (tl) => {
          buildWinShow(tl, this.deps.winSurface, totalCents, multiple, profile);
        }),
      );

      const tier = tierFor(multiple);
      if (tier) {
        const tierIndex = WIN_TIERS.length - 1 - WIN_TIERS.findIndex((t) => t.name === tier.name);
        this.seq.enqueue(
          new InstantPresentation('stage:tier', () => {
            this.stageName = 'tier';
          }),
          new TimelinePresentation('tier-roll', (tl) => {
            buildTierRoll(tl, this.deps.tierSurface, tier, tierIndex, totalCents);
          }),
          new TimelinePresentation('tier-hold', (tl) => {
            buildTierHold(tl, this.deps.tierSurface);
          }),
        );
      }
    }

    await this.seq.run();
    this.stageName = 'idle';
    if (outcome.base.wins.length > 0) this.startCycle(outcome.base.wins, opts.bet);
  }

  presentFeature(outcome: SpinOutcome): Promise<void> {
    // Stage-4 placeholder: show the final free spin on the night set, briefly.
    const f = outcome.feature;
    if (!f) return Promise.resolve();
    this.stageName = 'feature';
    this.seq.enqueue(
      new InstantPresentation('feature:static', () => {
        const last = f.spins[f.spins.length - 1];
        if (last) {
          this.deps.setBackground('free');
          this.deps.showStops(last.stops, 'free');
        }
      }),
      new TimelinePresentation('feature:pause', (tl) => {
        tl.to({}, { duration: 1.0 });
      }),
    );
    return this.seq.run().then(() => {
      this.stageName = 'idle';
    });
  }

  /** Cells that flare during the win show: every way-win cell plus paying scatters. */
  private flareWins(outcome: SpinOutcome): WayWin[] {
    const wins = [...outcome.base.wins];
    if (outcome.base.scatter.pay > 0) {
      wins.push({
        symbol: 'H1', // synthetic entry — only its positions are used
        length: 3,
        ways: 0,
        payPerWay: 0,
        win: outcome.base.scatter.pay,
        positions: outcome.base.scatter.positions,
      });
    }
    return wins;
  }

  private startCycle(wins: readonly WayWin[], bet: number): void {
    const beat = SPEED_PROFILES[this.store.get().turboMode].winCycleTime;
    const tl = gsap.timeline({ repeat: -1, repeatDelay: 0.2 });
    wins.forEach((w, i) => {
      tl.add(() => this.deps.cycle.show(w, betCents(bet), this.config.coinsPerBet), i * beat);
    });
    tl.to({}, { duration: wins.length * beat });
    this.cycleTl = tl;
  }

  private stopCycle(): void {
    if (this.cycleTl) {
      this.cycleTl.kill();
      this.cycleTl = null;
      this.deps.cycle.clear();
    }
  }
}
