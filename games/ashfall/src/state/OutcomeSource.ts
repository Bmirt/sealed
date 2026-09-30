import { spin } from '@math/spin';
import { buySpin } from '@math/buy';
import type { FeatureTier, GameConfig, SpinOutcome } from '@math/types';
import type { GameStore } from './GameStore';

/**
 * Where outcomes come from. The renderer never cares; the game ships with
 * LocalOutcomeSource (the browser's own seeded RNG), tests may inject their own.
 */
export interface OutcomeSource {
  readonly kind: 'local';
  spin(bet: number): Promise<SpinOutcome>;
  buy(tier: FeatureTier, bet: number): Promise<SpinOutcome>;
}

export class LocalOutcomeSource implements OutcomeSource {
  readonly kind = 'local';
  constructor(
    private readonly config: GameConfig,
    private readonly store: GameStore,
  ) {}
  spin(): Promise<SpinOutcome> {
    const { seed, nonce } = this.store.nextNonce();
    return Promise.resolve(spin(this.config, seed, nonce));
  }
  buy(tier: FeatureTier): Promise<SpinOutcome> {
    const { seed, nonce } = this.store.nextNonce();
    return Promise.resolve(buySpin(this.config, seed, nonce, tier));
  }
}
