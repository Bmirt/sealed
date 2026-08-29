import type { GameConfig } from '@math/types';

import type { TurboMode } from '@config/speeds';
export type { TurboMode };
export type Phase = 'booting' | 'idle' | 'spinning' | 'presenting' | 'feature';

export interface PersistedState {
  readonly balanceCents: number;
  readonly betIndex: number;
  readonly turboMode: TurboMode;
  readonly soundOn: boolean;
  readonly seed: string;
  readonly nonce: number;
}

export interface GameState extends PersistedState {
  readonly phase: Phase;
  readonly lastWinCents: number;
  readonly autoplayRemaining: number;
  readonly autoplayStopOnFeature: boolean;
  readonly message: string | null;
  readonly stripSet: 'base' | 'free';
}

export interface Persistence {
  load(): Partial<PersistedState> | null;
  save(state: PersistedState): void;
}

export const STORAGE_KEY = 'ashfall-dynasty.v1';
export const STARTING_BALANCE_CENTS = 100_000;

export class LocalStoragePersistence implements Persistence {
  load(): Partial<PersistedState> | null {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return null;
      const parsed: unknown = JSON.parse(raw);
      return typeof parsed === 'object' && parsed !== null ? (parsed as Partial<PersistedState>) : null;
    } catch {
      return null;
    }
  }
  save(state: PersistedState): void {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch {
      /* storage may be unavailable (private mode) — the game still works */
    }
  }
}

export class MemoryPersistence implements Persistence {
  private data: Partial<PersistedState> | null = null;
  load(): Partial<PersistedState> | null {
    return this.data;
  }
  save(state: PersistedState): void {
    this.data = { ...state };
  }
}

type Listener = (state: GameState, prev: GameState) => void;

const TURBO_MODES: readonly TurboMode[] = ['normal', 'turbo', 'quick'];

function randomSeed(): string {
  const bytes = new Uint8Array(8);
  if (typeof crypto !== 'undefined' && 'getRandomValues' in crypto) crypto.getRandomValues(bytes);
  else for (let i = 0; i < bytes.length; i++) bytes[i] = Math.floor(Math.random() * 256);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}

/**
 * Single source of truth for UI state. Plain observable; persists the subset that should
 * survive a reload (balance, bet, turbo, sound, RNG seed/nonce).
 */
export class GameStore {
  private state: GameState;
  private readonly listeners = new Set<Listener>();
  private readonly persistence: Persistence;
  readonly config: GameConfig;

  constructor(config: GameConfig, persistence: Persistence) {
    this.config = config;
    this.persistence = persistence;
    const saved = persistence.load() ?? {};
    const betIndex = clampIndex(saved.betIndex, config.betLevels.length, config.defaultBetIndex);
    this.state = {
      balanceCents: isFiniteNonNegInt(saved.balanceCents) ? saved.balanceCents : STARTING_BALANCE_CENTS,
      betIndex,
      turboMode: saved.turboMode && TURBO_MODES.includes(saved.turboMode) ? saved.turboMode : 'normal',
      soundOn: saved.soundOn ?? true,
      seed: typeof saved.seed === 'string' && saved.seed.length > 0 ? saved.seed : randomSeed(),
      nonce: isFiniteNonNegInt(saved.nonce) ? saved.nonce : 0,
      phase: 'booting',
      lastWinCents: 0,
      autoplayRemaining: 0,
      autoplayStopOnFeature: true,
      message: null,
      stripSet: 'base',
    };
    this.persist();
  }

  get(): GameState {
    return this.state;
  }

  get bet(): number {
    return this.config.betLevels[this.state.betIndex] ?? this.config.betLevels[0] ?? 1;
  }

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  set(patch: Partial<GameState>): void {
    const prev = this.state;
    this.state = { ...prev, ...patch };
    this.persist();
    for (const l of this.listeners) l(this.state, prev);
  }

  // Convenience mutations -------------------------------------------------

  betUp(): void {
    this.set({ betIndex: Math.min(this.config.betLevels.length - 1, this.state.betIndex + 1) });
  }

  betDown(): void {
    this.set({ betIndex: Math.max(0, this.state.betIndex - 1) });
  }

  cycleTurbo(): TurboMode {
    const i = TURBO_MODES.indexOf(this.state.turboMode);
    const next = TURBO_MODES[(i + 1) % TURBO_MODES.length] ?? 'normal';
    this.set({ turboMode: next });
    return next;
  }

  toggleSound(): void {
    this.set({ soundOn: !this.state.soundOn });
  }

  /** Reserve the next RNG nonce (each round consumes exactly one). */
  nextNonce(): { seed: string; nonce: number } {
    const nonce = this.state.nonce;
    this.set({ nonce: nonce + 1 });
    return { seed: this.state.seed, nonce };
  }

  /** Dev: force a seed/nonce for reproducible outcomes. */
  setSeed(seed: string, nonce: number): void {
    this.set({ seed, nonce });
  }

  debit(cents: number): boolean {
    if (cents > this.state.balanceCents) return false;
    this.set({ balanceCents: this.state.balanceCents - cents });
    return true;
  }

  credit(cents: number): void {
    if (cents <= 0) return;
    this.set({ balanceCents: this.state.balanceCents + cents });
  }

  resetBalance(): void {
    this.set({ balanceCents: STARTING_BALANCE_CENTS });
  }

  private persist(): void {
    const { balanceCents, betIndex, turboMode, soundOn, seed, nonce } = this.state;
    this.persistence.save({ balanceCents, betIndex, turboMode, soundOn, seed, nonce });
  }
}

function clampIndex(v: number | undefined, length: number, fallback: number): number {
  if (!Number.isInteger(v) || v === undefined || v < 0 || v >= length) return fallback;
  return v;
}

function isFiniteNonNegInt(v: unknown): v is number {
  return typeof v === 'number' && Number.isInteger(v) && v >= 0;
}
