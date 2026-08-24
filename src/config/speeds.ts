import type { TurboMode } from '@/state/GameStore';

/**
 * Every presentation duration, per speed mode. Seconds.
 * Anticipation and the Big-Win+ tier sequences are deliberately NOT part of the profile:
 * they play at full length in every mode (the payoff is never auto-skipped — a deliberate
 * click/Space still skips them).
 */
export interface SpeedProfile {
  /** Reel 1 time from spin start to its landing settle. */
  readonly baseSpinTime: number;
  /** Additional spin time per reel index (left → right stagger). */
  readonly reelStagger: number;
  /** Constant reel velocity while spinning, symbols per second. */
  readonly reelSpeed: number;
  /** Spin-up portion at the start (accelerating). */
  readonly spinUpTime: number;
  /** Landing overshoot in symbols and the settle-back time. */
  readonly overshoot: number;
  readonly settleTime: number;
  /** Blur switches off this long before a reel starts landing. */
  readonly blurCutoff: number;
  /** All-winners pulse beat before/while the line-win counter rolls. */
  readonly winShowTime: number;
  /** Line-win roll-up: base + perBetMultiple×x, clamped. */
  readonly rollupBase: number;
  readonly rollupPerX: number;
  readonly rollupMax: number;
  /** Per-symbol win cycle beat (idle loop after the total is shown). */
  readonly winCycleTime: number;
}

export const SPEED_PROFILES: Readonly<Record<TurboMode, SpeedProfile>> = {
  normal: {
    baseSpinTime: 1.05,
    reelStagger: 0.22,
    reelSpeed: 24,
    spinUpTime: 0.18,
    overshoot: 0.38,
    settleTime: 0.3,
    blurCutoff: 0.1,
    winShowTime: 0.75,
    rollupBase: 0.5,
    rollupPerX: 0.09,
    rollupMax: 2.4,
    winCycleTime: 0.9,
  },
  turbo: {
    baseSpinTime: 0.42,
    reelStagger: 0.07,
    reelSpeed: 32,
    spinUpTime: 0.08,
    overshoot: 0.3,
    settleTime: 0.16,
    blurCutoff: 0.06,
    winShowTime: 0.35,
    rollupBase: 0.25,
    rollupPerX: 0.03,
    rollupMax: 0.9,
    winCycleTime: 0.7,
  },
  quick: {
    baseSpinTime: 0.16,
    reelStagger: 0.02,
    reelSpeed: 40,
    spinUpTime: 0.03,
    overshoot: 0.18,
    settleTime: 0.09,
    blurCutoff: 0.03,
    winShowTime: 0.18,
    rollupBase: 0.12,
    rollupPerX: 0.008,
    rollupMax: 0.3,
    winCycleTime: 0.6,
  },
};

/** Mode-independent beats (never shortened by turbo). */
export const FIXED_TIMING = {
  /** Extra slow-roll time per anticipation reel. */
  anticipationTime: 2.3,
  /** Reel velocity during the anticipation slow-roll (symbols/s, unblurred). */
  anticipationSpeed: 6,
  /** Big-Win+ tier sequences. */
  tier: {
    introTime: 0.55,
    holdTime: 1.3,
    outroTime: 0.4,
    /** Roll-up time per tier (Big, Mega, Epic, Legendary). */
    rollupTimes: [2.2, 3.2, 4.2, 5.5] as readonly number[],
  },
} as const;

export interface WinTierDef {
  readonly name: 'big' | 'mega' | 'epic' | 'legendary';
  readonly label: string;
  /** Threshold in bet multiples (inclusive). */
  readonly minX: number;
}

/** Escalating win tiers. Checked top-down. */
export const WIN_TIERS: readonly WinTierDef[] = [
  { name: 'legendary', label: 'LEGENDARY WIN', minX: 500 },
  { name: 'epic', label: 'EPIC WIN', minX: 100 },
  { name: 'mega', label: 'MEGA WIN', minX: 50 },
  { name: 'big', label: 'BIG WIN', minX: 15 },
];

export function tierFor(betMultiple: number): WinTierDef | null {
  for (const t of WIN_TIERS) if (betMultiple >= t.minX) return t;
  return null;
}

export function rollupTime(profile: SpeedProfile, betMultiple: number): number {
  return Math.min(profile.rollupMax, profile.rollupBase + profile.rollupPerX * betMultiple);
}
