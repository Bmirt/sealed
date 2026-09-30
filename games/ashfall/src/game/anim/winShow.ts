import { FIXED_TIMING, rollupTime } from '@config/speeds';
import type { SpeedProfile, WinTierDef } from '@config/speeds';

/** A tweenable win-animation target - SymbolView satisfies this; tests use fakes. */
export interface PulseTarget {
  /** Gentle scale pulse (idle win cycle). */
  setPulse(scale: number): void;
  /** Win pop 0→1 (overshooting ease): swell + flash + wiggle; 0 and ≥1 are the rest state. */
  setPop(v: number): void;
}

export interface CounterLike {
  /** Show the counter at a value (cents). */
  set(cents: number): void;
  show(): void;
  hide(): void;
}

export interface WinShowSurface {
  /** Dim every non-winning cell (true) / restore (false). */
  setDim(on: boolean): void;
  /** Flare frames on the winning cells (true = visible). */
  setFlares(on: boolean): void;
  /** One-shot celebration at win-show start: cell sprays + the rising win plume. */
  celebrate(totalCents: number): void;
  readonly winningCells: readonly PulseTarget[];
  readonly counter: CounterLike;
}

/**
 * The standard line-win beat: dim losers, pulse winners, roll the counter up to the total.
 * End state (played out or skipped): dim off, flares off, pulse 1, counter at the final value
 * and left visible (the idle cycle or the next spin clears it).
 */
export function buildWinShow(
  tl: gsap.core.Timeline,
  surface: WinShowSurface,
  totalCents: number,
  betMultiple: number,
  profile: SpeedProfile,
  hooks: { onTick?: (cents: number) => void } = {},
): void {
  const state = { cents: 0, pop: 0 };
  tl.add(() => {
    surface.setDim(true);
    surface.setFlares(true);
    surface.celebrate(totalCents);
    surface.counter.show();
    surface.counter.set(0);
  });
  // Winner POP: swell with an overshooting settle, flash and wiggle riding along.
  tl.to(state, {
    pop: 1,
    duration: profile.winShowTime,
    ease: 'back.out(2.1)',
    onUpdate: () => {
      for (const c of surface.winningCells) c.setPop(state.pop);
    },
  });
  // Roll-up (starts with the pulse, may outlast it).
  tl.to(
    state,
    {
      cents: totalCents,
      duration: rollupTime(profile, betMultiple),
      ease: 'power1.out',
      onUpdate: () => {
        surface.counter.set(Math.round(state.cents));
        hooks.onTick?.(Math.round(state.cents));
      },
    },
    0,
  );
  // Guaranteed end state.
  tl.add(() => {
    state.cents = totalCents;
    surface.counter.set(totalCents);
    for (const c of surface.winningCells) {
      c.setPulse(1);
      c.setPop(1);
    }
    surface.setDim(false);
    surface.setFlares(false);
  });
}

export interface TierSurface {
  show(label: string): void;
  hide(): void;
  readonly counter: CounterLike;
  shake(intensity: number): void;
  burst(strength: number): void;
  /** 0..1 progress of the roll-up - drives counter scale/pitch ramps. */
  setRollProgress(p: number): void;
}

/**
 * Big/Mega/Epic/Legendary - the roll-up half. Fixed length per tier, independent of turbo.
 * End state: overlay visible, counter at the full amount. (The hold/dismiss is a separate
 * presentation so a first skip snaps the counter and a second skip dismisses.)
 */
export function buildTierRoll(
  tl: gsap.core.Timeline,
  surface: TierSurface,
  tier: WinTierDef,
  tierIndex: number,
  totalCents: number,
  hooks: { onTick?: (cents: number, progress: number) => void } = {},
): void {
  const t = FIXED_TIMING.tier;
  const roll = t.rollupTimes[Math.min(tierIndex, t.rollupTimes.length - 1)] ?? 2.2;
  const state = { cents: 0 };
  tl.add(() => {
    surface.show(tier.label);
    surface.counter.show();
    surface.counter.set(0);
    surface.shake(1 + tierIndex * 0.5);
    surface.burst(1 + tierIndex * 0.6);
  });
  tl.to(state, {
    cents: totalCents,
    duration: roll,
    ease: 'power1.inOut',
    onUpdate: () => {
      const p = totalCents > 0 ? state.cents / totalCents : 1;
      surface.counter.set(Math.round(state.cents));
      surface.setRollProgress(p);
      hooks.onTick?.(Math.round(state.cents), p);
    },
  }, `+=${t.introTime}`);
  // Ember fountain riding the roll (skipping collapses these into one final burst).
  const fountains = Math.max(2, Math.floor(roll / 0.45));
  for (let i = 0; i < fountains; i++) {
    tl.add(() => surface.burst(0.35 + tierIndex * 0.12), t.introTime + (i + 0.5) * (roll / fountains));
  }
  tl.add(() => {
    state.cents = totalCents;
    surface.counter.set(totalCents);
    surface.setRollProgress(1);
    surface.burst(1.5 + tierIndex * 0.7);
  });
}

/** The hold + dismiss half. Skipping it dismisses immediately. */
export function buildTierHold(tl: gsap.core.Timeline, surface: TierSurface): void {
  const t = FIXED_TIMING.tier;
  tl.to({}, { duration: t.holdTime });
  tl.add(() => {
    surface.hide();
    surface.counter.hide();
  });
  tl.to({}, { duration: t.outroTime });
}
