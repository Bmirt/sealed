/**
 * Pure maths types. Nothing in this file (or module) may reference the DOM, Pixi, GSAP or Howler.
 *
 * Money model: all values are integer COINS. One total bet = `coinsPerBet` coins (20).
 * The UI converts coins → currency with coinValue = bet / coinsPerBet.
 */

export type SymbolId = 'H1' | 'H2' | 'H3' | 'M1' | 'M2' | 'L1' | 'L2' | 'L3' | 'L4' | 'W' | 'S';
export type PayingSymbolId = Exclude<SymbolId, 'W' | 'S'>;
export type SymbolTier = 'high' | 'mid' | 'low' | 'wild' | 'scatter';

/** Numeric code used inside reel strips and grids (fast paths in the sim). */
export type SymbolCode = number;

export interface SymbolDef {
  readonly code: SymbolCode;
  readonly name: string;
  readonly tier: SymbolTier;
}

export type PayLine = readonly [three: number, four: number, five: number];

export type ScatterCount = 3 | 4 | 5;

/** Dragonfire Meter rules. */
export interface MeterRules {
  readonly start: number;
  /** Winning spins required per step. */
  readonly winsPerStep: number;
  /** Amount added per step. */
  readonly step: number;
  readonly cap: number;
}

export interface FreeSpinsConfig {
  /** scatters → spins awarded (also used for retriggers). */
  readonly awards: Readonly<Record<ScatterCount, number>>;
  readonly retrigger: boolean;
  readonly meter: MeterRules;
}

export interface BuyConfig {
  readonly free: { readonly costX: number; readonly minScatters: number };
  /** Super tier: fixed spin count and its own meter rules (faster, hotter meter). */
  readonly super: { readonly costX: number; readonly spins: number; readonly meter: MeterRules };
}

export interface RtpDeclaration {
  readonly target: number;
  readonly declaredBase: number;
  readonly declaredBuyFree: number;
  readonly declaredBuySuper: number;
}

export interface FeatureFlags {
  readonly bonusBuy: { readonly enabled: boolean; readonly superTier: boolean };
  readonly autoplay: { readonly enabled: boolean; readonly options: readonly number[] };
}

export interface GameConfig {
  readonly id: 'ashfall-dynasty';
  /** Bump whenever any maths-affecting value changes; golden files are keyed on it. */
  readonly version: string;
  readonly layout: { readonly reels: 5; readonly rows: 3 };
  readonly coinsPerBet: number;
  readonly betLevels: readonly number[];
  readonly defaultBetIndex: number;
  readonly symbols: Readonly<Record<SymbolId, SymbolDef>>;
  readonly wild: { readonly id: 'W'; readonly reels: readonly boolean[] };
  readonly scatter: { readonly id: 'S' };
  readonly paytable: Readonly<Record<PayingSymbolId, PayLine>>;
  readonly scatterPays: PayLine;
  readonly strips: { readonly base: readonly (readonly SymbolCode[])[]; readonly free: readonly (readonly SymbolCode[])[] };
  readonly freeSpins: FreeSpinsConfig;
  readonly buy: BuyConfig;
  readonly maxWinX: number;
  readonly rtp: RtpDeclaration;
  readonly features: FeatureFlags;
}

export type Cell = readonly [reel: number, row: number];

export interface WayWin {
  readonly symbol: PayingSymbolId;
  readonly length: 3 | 4 | 5;
  readonly ways: number;
  readonly payPerWay: number;
  /** ways × payPerWay, before any multiplier. */
  readonly win: number;
  /** Every participating cell (symbol or wild) on the winning reels. */
  readonly positions: readonly Cell[];
}

export interface ScatterResult {
  readonly count: number;
  readonly positions: readonly Cell[];
  readonly pay: number;
}

export interface SpinResult {
  readonly stops: readonly number[];
  /** grid[reel][row], top → bottom. */
  readonly grid: readonly (readonly SymbolCode[])[];
  readonly wins: readonly WayWin[];
  readonly scatter: ScatterResult;
  /** Sum of way wins + scatter pay, before multiplier. */
  readonly lineWinCoins: number;
  readonly multiplier: number;
  /** (lineWinCoins) × multiplier, after cap clipping if applicable. */
  readonly totalWinCoins: number;
  /** Spins triggered by this spin's scatters (0 if < 3). */
  readonly triggersSpins: number;
}

export interface FreeSpinResult extends SpinResult {
  readonly index: number;
  readonly spinsRemainingAfter: number;
  readonly meterBefore: number;
  readonly meterAfter: number;
  /** Progress toward the next step after this spin (0 … winsPerStep-1). */
  readonly winsTowardStep: number;
  readonly retriggerSpins: number;
}

export type FeatureTier = 'free' | 'super';

export interface FeatureOutcome {
  readonly tier: FeatureTier;
  readonly spinsAwarded: number;
  readonly meter: MeterRules;
  readonly spins: readonly FreeSpinResult[];
  readonly totalWinCoins: number;
  readonly meterEnd: number;
  readonly endedByCap: boolean;
}

export type SpinKind = 'base' | 'buyFree' | 'buySuper';

export interface SpinOutcome {
  readonly configVersion: string;
  readonly seed: string;
  readonly nonce: number;
  readonly kind: SpinKind;
  readonly base: SpinResult;
  readonly feature: FeatureOutcome | null;
  /** Whole-round win after the max-win cap. */
  readonly totalWinCoins: number;
  readonly capped: boolean;
}
