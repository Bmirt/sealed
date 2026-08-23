import type { SpinOutcome } from '@math/types';
import type { OutcomePresenter } from '@/state/GameController';
import type { GameScene } from './GameScene';

/**
 * Stage-2 presenter: no animation. Snaps the reels to the maths stops. For a feature, shows
 * the final free spin on the free strip set. Replaced by the animated presenter in stage 3.
 */
export class StaticPresenter implements OutcomePresenter {
  private readonly scene: GameScene;

  constructor(scene: GameScene) {
    this.scene = scene;
  }

  presentBase(outcome: SpinOutcome): Promise<void> {
    this.scene.setBackground('base');
    this.scene.reels.showStops(outcome.base.stops, 'base');
    return Promise.resolve();
  }

  presentFeature(outcome: SpinOutcome): Promise<void> {
    const f = outcome.feature;
    if (!f) return Promise.resolve();
    const last = f.spins[f.spins.length - 1];
    if (last) {
      this.scene.setBackground('free');
      this.scene.reels.showStops(last.stops, 'free');
    }
    return Promise.resolve();
  }

  abortToEndState(): void {
    /* nothing in flight in the static presenter */
  }
}
