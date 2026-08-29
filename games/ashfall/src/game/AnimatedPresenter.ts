import { gsap } from 'gsap';
import { FIXED_TIMING, SPEED_PROFILES, tierFor, WIN_TIERS } from '@config/speeds';
import { contextFor } from '@math/context';
import type { GameConfig, ScatterResult, SpinOutcome, WayWin } from '@math/types';
import type { OutcomePresenter } from '@/state/GameController';
import type { GameStore } from '@/state/GameStore';
import { betCents, coinsToCents, formatCents } from '@/state/money';
import { Sequencer } from '@/presentation/Sequencer';
import { InstantPresentation, TimelinePresentation } from '@/presentation/Presentation';
import { anticipationReels, buildReelSpin } from './anim/reelSpin';
import type { SpinnableReel } from './anim/reelSpin';
import { buildTierHold, buildTierRoll, buildWinShow } from './anim/winShow';
import type { TierSurface, WinShowSurface } from './anim/winShow';

export type PresenterStage = 'idle' | 'reels' | 'wins' | 'tier' | 'feature';

/** The Dragonfire feature dressing (meter, spins-left, total, banners). */
export interface FeatureDeps {
  showHud(on: boolean): void;
  /** Meter value + step progress (pips filled / required). */
  setMeter(multiplier: number, winsTowardStep: number, winsPerStep: number): void;
  /** Meter step celebration pulse (0..1 progress, driven by a tween). */
  pulseMeter(progress: number): void;
  setSpinsLeft(n: number): void;
  /** Accumulated feature win. */
  setTotal(cents: number): void;
  showBanner(title: string, sub: string): void;
  hideBanner(): void;
}

/** The bought-feature entry cinematic (dragon pass + reel ignite), driven by 0..1 progress. */
export interface CinematicDeps {
  begin(tier: 'free' | 'super'): void;
  update(progress: number): void;
  end(): void;
}

/**
 * Everything the presenter needs from the rendering side, Pixi-free.
 * `PixiPresenterDeps` adapts the real scene; tests provide fakes — so the REAL presentation
 * flow (sequencing, skip, abort, stage tracking) is what the tests exercise.
 */
export interface PresenterDeps {
  reels(): SpinnableReel[];
  setStripSet(set: 'base' | 'free'): void;
  setBackground(variant: 'base' | 'free'): void;
  /** Snap the reels to stops (feature outro restores the triggering grid). */
  showStops(stops: readonly number[], set: 'base' | 'free'): void;
  readonly winSurface: WinShowSurface & { prepare(wins: readonly WayWin[]): void };
  readonly tierSurface: TierSurface;
  readonly anticipation: { start(reel: number): void; end(reel: number): void; reset(): void };
  readonly cycle: { show(win: WayWin, betCents: number, coinsPerBet: number): void; clear(): void };
  readonly feature: FeatureDeps;
  readonly cinematic: CinematicDeps;
  /** A reel landed: dust/thud, plus scatter chime and wild fire-trail dressing. */
  landPuff(reel: number, fx: { readonly scatter: boolean; readonly wildRows: readonly number[] }): void;
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
    this.deps.feature.showHud(false);
    this.deps.setBackground('base');
    this.deps.setStripSet('base');

    // Bought features open with the cinematic: darken, dragon pass, reels ignite.
    if (outcome.kind !== 'base') {
      const tier = outcome.kind === 'buySuper' ? 'super' : 'free';
      this.stageName = 'feature';
      this.seq.enqueue(
        new TimelinePresentation('cinematic', (tl) => {
          const state = { p: 0 };
          tl.add(() => this.deps.cinematic.begin(tier));
          tl.to(state, {
            p: 1,
            duration: FIXED_TIMING.feature.cinematicTime,
            ease: 'none',
            onUpdate: () => this.deps.cinematic.update(state.p),
          });
          tl.add(() => this.deps.cinematic.end());
        }),
      );
    }

    const profile = SPEED_PROFILES[this.store.get().turboMode];
    const ctx = contextFor(this.config);
    const scatterByReel = outcome.base.grid.map((col) => col.filter((c) => c === ctx.scatterCode).length);
    const wildRowsByReel = outcome.base.grid.map((col) => col.flatMap((c, row) => (c === ctx.wildCode ? [row] : [])));
    const plan = { stops: outcome.base.stops, anticipation: anticipationReels(scatterByReel) };

    this.stageName = 'reels';
    this.seq.enqueue(
      new TimelinePresentation('reels', (tl) => {
        buildReelSpin(tl, this.deps.reels(), plan, profile, {
          onReelLand: (r) => this.deps.landPuff(r, { scatter: (scatterByReel[r] ?? 0) > 0, wildRows: wildRowsByReel[r] ?? [] }),
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
          this.deps.winSurface.prepare(this.flareCells(outcome.base.wins, outcome.base.scatter));
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

  async presentFeature(outcome: SpinOutcome, opts: { readonly bet: number }): Promise<void> {
    const f = outcome.feature;
    if (!f) return;
    this.stopCycle();
    this.stageName = 'feature';
    const ctx = contextFor(this.config);
    const cpb = this.config.coinsPerBet;
    const bet = opts.bet;
    const cents = (coins: number): number => coinsToCents(coins, bet, cpb);
    const ft = FIXED_TIMING.feature;
    const fd = this.deps.feature;

    // ---- intro: night set, HUD on, banner ----
    const introTitle = f.tier === 'super' ? 'SUPER DRAGONFIRE' : 'DRAGONFIRE FREE SPINS';
    const introSub = `${f.spinsAwarded} FREE SPINS · MULTIPLIER STARTS ×${f.meter.start}`;
    this.seq.enqueue(
      new TimelinePresentation('feature:intro', (tl) => {
        tl.add(() => {
          this.deps.resetOverlay();
          this.deps.setBackground('free');
          this.deps.setStripSet('free');
          fd.showHud(true);
          fd.setMeter(f.meter.start, 0, f.meter.winsPerStep);
          fd.setSpinsLeft(f.spinsAwarded);
          fd.setTotal(0);
          fd.showBanner(introTitle, introSub);
        });
        tl.to({}, { duration: ft.introTime });
        tl.add(() => fd.hideBanner());
      }),
    );

    // ---- each free spin, fully scripted from the outcome ----
    let runningTotal = 0;
    for (const fs of f.spins) {
      const profileNow = (): (typeof SPEED_PROFILES)['normal'] => SPEED_PROFILES[this.store.get().turboMode];
      const scatterByReel = fs.grid.map((col) => col.filter((c) => c === ctx.scatterCode).length);
      const wildRowsByReel = fs.grid.map((col) => col.flatMap((c, row) => (c === ctx.wildCode ? [row] : [])));
      const plan = { stops: fs.stops, anticipation: anticipationReels(scatterByReel) };

      this.seq.enqueue(
        new TimelinePresentation(`feature:spin:${fs.index}`, (tl) => {
          buildReelSpin(tl, this.deps.reels(), plan, profileNow(), {
            onReelLand: (r) => this.deps.landPuff(r, { scatter: (scatterByReel[r] ?? 0) > 0, wildRows: wildRowsByReel[r] ?? [] }),
            onAnticipationStart: (r) => this.deps.anticipation.start(r),
            onAnticipationEnd: (r) => this.deps.anticipation.end(r),
          });
          tl.add(() => this.deps.anticipation.reset());
        }),
      );

      const spinTotal = runningTotal + fs.totalWinCoins;
      if (fs.lineWinCoins > 0) {
        const winCents = cents(fs.totalWinCoins);
        const totalAfter = cents(spinTotal);
        this.seq.enqueue(
          new InstantPresentation(`feature:prepare:${fs.index}`, () => {
            this.deps.winSurface.prepare(this.flareCells(fs.wins, fs.scatter));
          }),
          new TimelinePresentation(`feature:win:${fs.index}`, (tl) => {
            buildWinShow(tl, this.deps.winSurface, winCents, winCents / Math.max(1, betCents(bet)), profileNow());
            tl.add(() => fd.setTotal(totalAfter));
          }),
        );
      }
      runningTotal = spinTotal;

      // Meter pips / step.
      if (fs.meterAfter > fs.meterBefore) {
        this.seq.enqueue(
          new TimelinePresentation(`feature:meter:${fs.index}`, (tl) => {
            const state = { p: 0 };
            tl.to(state, {
              p: 1,
              duration: ft.meterStepTime,
              ease: 'power2.out',
              onUpdate: () => fd.pulseMeter(state.p),
            });
            tl.add(() => {
              fd.setMeter(fs.meterAfter, fs.winsTowardStep, f.meter.winsPerStep);
              fd.pulseMeter(0);
            });
          }),
        );
      } else if (fs.lineWinCoins > 0) {
        this.seq.enqueue(new InstantPresentation(`feature:pips:${fs.index}`, () => fd.setMeter(fs.meterAfter, fs.winsTowardStep, f.meter.winsPerStep)));
      }

      // Retrigger.
      if (fs.retriggerSpins > 0) {
        this.seq.enqueue(
          new TimelinePresentation(`feature:retrigger:${fs.index}`, (tl) => {
            tl.add(() => {
              fd.showBanner(`+${fs.retriggerSpins} FREE SPINS`, 'THE EGGS HATCH AGAIN');
              fd.setSpinsLeft(fs.spinsRemainingAfter);
            });
            tl.to({}, { duration: ft.retriggerTime });
            tl.add(() => fd.hideBanner());
          }),
        );
      } else {
        this.seq.enqueue(new InstantPresentation(`feature:left:${fs.index}`, () => fd.setSpinsLeft(fs.spinsRemainingAfter)));
      }
    }

    // ---- outro: tier on the whole round, then the summary banner ----
    const roundCents = cents(outcome.totalWinCoins);
    const multiple = roundCents / Math.max(1, betCents(bet));
    const tier = tierFor(multiple);
    if (tier) {
      const tierIndex = WIN_TIERS.length - 1 - WIN_TIERS.findIndex((t) => t.name === tier.name);
      this.seq.enqueue(
        new TimelinePresentation('feature:tier-roll', (tl) => {
          buildTierRoll(tl, this.deps.tierSurface, tier, tierIndex, roundCents);
        }),
        new TimelinePresentation('feature:tier-hold', (tl) => {
          buildTierHold(tl, this.deps.tierSurface);
        }),
      );
    }
    this.seq.enqueue(
      new TimelinePresentation('feature:outro', (tl) => {
        tl.add(() => {
          fd.showBanner(f.endedByCap ? 'MAX WIN' : 'DRAGONFIRE COMPLETE', `TOTAL WIN ${formatCents(cents(f.totalWinCoins))}`);
        });
        tl.to({}, { duration: ft.outroTime });
        tl.add(() => {
          fd.hideBanner();
          fd.showHud(false);
          this.deps.setBackground('base');
          this.deps.showStops(outcome.base.stops, 'base');
        });
      }),
    );

    await this.seq.run();
    this.stageName = 'idle';
  }

  /** Cells that flare during a win show: every way-win cell plus paying scatters. */
  private flareCells(wins: readonly WayWin[], scatter: ScatterResult): WayWin[] {
    const out = [...wins];
    if (scatter.pay > 0 || scatter.count >= 3) {
      out.push({
        symbol: 'H1', // synthetic entry — only its positions are used
        length: 3,
        ways: 0,
        payPerWay: 0,
        win: scatter.pay,
        positions: scatter.positions,
      });
    }
    return out;
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
