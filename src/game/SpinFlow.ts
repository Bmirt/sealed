import type { GameController } from '@/state/GameController';
import type { GameStore } from '@/state/GameStore';

/** What the input flow needs from the presenter (AnimatedPresenter satisfies this). */
export interface FlowPresenter {
  readonly stage: 'idle' | 'reels' | 'wins' | 'tier' | 'feature';
  skipCurrent(): void;
  abortToEndState(): void;
}

/**
 * Input semantics — the part of a slot front-end that usually breaks:
 *
 *  SPIN (button / Space):
 *    idle        → start a spin
 *    reels       → slam-stop (skip the reel presentation; outcome unchanged)
 *    wins / tier → everything to its end state, then start the next spin
 *    feature     → skip the current beat only (never starts a base spin mid-feature)
 *
 *  SKIP (canvas click):
 *    skips the current beat only, never starts a spin.
 *
 *  Holding SPIN auto-repeats: as soon as the game is idle again, the next spin starts.
 */
export class SpinFlow {
  private readonly store: GameStore;
  private readonly controller: GameController;
  private readonly presenter: FlowPresenter;
  private held = false;
  private repeatDelayMs: number;
  private repeatTimer: ReturnType<typeof setTimeout> | null = null;
  private unsubscribe: (() => void) | null = null;

  constructor(store: GameStore, controller: GameController, presenter: FlowPresenter, repeatDelayMs = 120) {
    this.store = store;
    this.controller = controller;
    this.presenter = presenter;
    this.repeatDelayMs = repeatDelayMs;
    this.unsubscribe = store.subscribe((s, prev) => {
      if (this.held && s.phase === 'idle' && prev.phase !== 'idle') this.scheduleRepeat();
    });
  }

  /** The spin button / Space. */
  spinPressed(): void {
    const phase = this.store.get().phase;
    if (phase === 'idle') {
      void this.controller.spin();
      return;
    }
    if (phase === 'feature') {
      this.presenter.skipCurrent();
      return;
    }
    switch (this.presenter.stage) {
      case 'reels':
        this.presenter.skipCurrent();
        break;
      case 'wins':
      case 'tier':
        void this.interruptAndSpin();
        break;
      default:
        this.presenter.skipCurrent();
    }
  }

  /** Canvas click / dedicated skip: current beat to its end state, nothing else. */
  skipPressed(): void {
    if (this.store.get().phase === 'idle') return;
    this.presenter.skipCurrent();
  }

  holdStart(): void {
    this.held = true;
  }

  holdEnd(): void {
    this.held = false;
    if (this.repeatTimer !== null) {
      clearTimeout(this.repeatTimer);
      this.repeatTimer = null;
    }
  }

  private scheduleRepeat(): void {
    if (this.repeatTimer !== null) return;
    this.repeatTimer = setTimeout(() => {
      this.repeatTimer = null;
      if (this.held && this.store.get().phase === 'idle') void this.controller.spin();
    }, this.repeatDelayMs);
  }

  private async interruptAndSpin(): Promise<void> {
    this.presenter.abortToEndState();
    await this.controller.roundInFlight;
    if (this.store.get().phase === 'idle') void this.controller.spin();
  }

  destroy(): void {
    this.unsubscribe?.();
    this.unsubscribe = null;
    this.holdEnd();
  }
}
