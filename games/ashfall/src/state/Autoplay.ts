import type { GameController } from './GameController';
import type { GameStore } from './GameStore';
import { betCents } from './money';

/**
 * Autoplay: N spins, decremented as each starts. Stops on: count exhausted, feature triggered
 * (when stop-on-feature is set), insufficient balance for the next bet, or the stop button.
 */
export class Autoplay {
  private readonly store: GameStore;
  private readonly controller: GameController;
  private readonly delayMs: number;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private unsubscribe: (() => void) | null = null;

  constructor(store: GameStore, controller: GameController, delayMs = 250) {
    this.store = store;
    this.controller = controller;
    this.delayMs = delayMs;
    this.unsubscribe = store.subscribe((s, prev) => {
      if (s.phase === 'idle' && prev.phase !== 'idle' && s.autoplayRemaining > 0) {
        this.afterRound();
      }
    });
  }

  /** Begin an autoplay session and start the first spin. */
  start(count: number, stopOnFeature: boolean): void {
    if (!this.store.config.features.autoplay.enabled) return;
    if (this.store.get().phase !== 'idle') return;
    this.store.set({ autoplayRemaining: count, autoplayStopOnFeature: stopOnFeature });
    this.spinNext();
  }

  stop(): void {
    this.store.set({ autoplayRemaining: 0 });
    if (this.timer !== null) {
      clearTimeout(this.timer);
      this.timer = null;
    }
  }

  private afterRound(): void {
    const s = this.store.get();
    if (s.autoplayRemaining <= 0) return;
    if (s.autoplayStopOnFeature && this.controller.outcome?.feature) {
      this.stop();
      return;
    }
    if (this.timer !== null) clearTimeout(this.timer);
    this.timer = setTimeout(() => {
      this.timer = null;
      this.spinNext();
    }, this.delayMs);
  }

  private spinNext(): void {
    const s = this.store.get();
    if (s.autoplayRemaining <= 0 || s.phase !== 'idle') return;
    if (s.balanceCents < betCents(this.store.bet)) {
      this.stop();
      return;
    }
    this.store.set({ autoplayRemaining: s.autoplayRemaining - 1 });
    void this.controller.spin();
  }

  destroy(): void {
    this.unsubscribe?.();
    this.unsubscribe = null;
    this.stop();
  }
}
