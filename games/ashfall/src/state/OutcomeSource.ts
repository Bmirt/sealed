import { spin } from '@math/spin';
import { buySpin } from '@math/buy';
import type { FeatureTier, GameConfig, SpinOutcome } from '@math/types';
import type { GameStore } from './GameStore';

/**
 * Where outcomes come from. The renderer never cares:
 *  - LocalOutcomeSource: the browser's own seeded RNG (offline demo / tests).
 *  - SealedOutcomeSource: the SEALED server, which holds the seed committed on Solana before play
 *    and records every round for the public verifier (see ../../../server).
 */
export interface OutcomeSource {
  readonly kind: 'local' | 'sealed';
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

export interface SealedRoundInfo {
  cycleId: number;
  seedHash: string;
  cyclePda: string;
  nonce: number;
  roundIndex: number;
  clientSeed: string;
}

export class SealedOutcomeSource implements OutcomeSource {
  readonly kind = 'sealed';
  lastRound: SealedRoundInfo | null = null;
  constructor(
    readonly serverUrl: string,
    private readonly playerId: string,
    private readonly clientSeed: () => string,
  ) {}

  private async request(body: Record<string, unknown>): Promise<SpinOutcome> {
    const res = await fetch(`${this.serverUrl}/slot/spin`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ playerId: this.playerId, clientSeed: this.clientSeed(), ...body }),
    });
    if (!res.ok) throw new Error(`SEALED server: ${res.status} ${await res.text()}`);
    const data = (await res.json()) as { outcome: SpinOutcome } & SealedRoundInfo;
    this.lastRound = { cycleId: data.cycleId, seedHash: data.seedHash, cyclePda: data.cyclePda, nonce: data.nonce, roundIndex: data.roundIndex, clientSeed: data.clientSeed };
    return data.outcome;
  }

  spin(bet: number): Promise<SpinOutcome> {
    return this.request({ bet });
  }

  buy(tier: FeatureTier, bet: number): Promise<SpinOutcome> {
    return this.request({ bet, buy: tier });
  }
}
