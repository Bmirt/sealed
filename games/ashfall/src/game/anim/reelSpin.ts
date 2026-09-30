import { gsap } from 'gsap';
import { FIXED_TIMING } from '@config/speeds';
import type { SpeedProfile } from '@config/speeds';
import { landingPosition } from '../reelMath';

/** What the spin animation needs from a reel - ReelView satisfies this; tests use fakes. */
export interface SpinnableReel {
  readonly stripLength: number;
  getPos(): number;
  setPos(pos: number, blur: boolean): void;
}

export interface ReelSpinHooks {
  /** A reel starts its landing settle (thud / dust). */
  onReelLand?: (reel: number) => void;
  /** A reel enters its anticipation slow-roll. */
  onAnticipationStart?: (reel: number) => void;
  /** The anticipation slow-roll on this reel ended (it landed). */
  onAnticipationEnd?: (reel: number) => void;
}

export interface ReelSpinPlan {
  readonly stops: readonly number[];
  /** Per reel: play the extended anticipation slow-roll before this reel lands. */
  readonly anticipation: readonly boolean[];
}

/**
 * Build the whole five-reel spin as ONE timeline: spin-up, constant-velocity blur travel,
 * left→right staggered landings with overshoot + settle. Anticipation reels get an extra
 * fixed-length slow-roll (never shortened by turbo); reels to their right keep spinning.
 *
 * Deterministic: the outcome's stops are known before the timeline is built; skipping to the
 * end lands every reel exactly on its stop with blur off.
 */
export function buildReelSpin(
  tl: gsap.core.Timeline,
  reels: readonly SpinnableReel[],
  plan: ReelSpinPlan,
  profile: SpeedProfile,
  hooks: ReelSpinHooks = {},
): void {
  const antTime = FIXED_TIMING.anticipationTime;
  const antSpeed = FIXED_TIMING.anticipationSpeed;

  let anticipationsBefore = 0;
  for (let r = 0; r < reels.length; r++) {
    const reel = reels[r];
    const stop = plan.stops[r];
    if (!reel || stop === undefined) continue;
    const len = reel.stripLength;
    const anticipate = plan.anticipation[r] === true;

    // This reel's fast-spin time: profile stagger + full anticipation time of reels to its left.
    const fastTime = profile.baseSpinTime + r * profile.reelStagger + anticipationsBefore * antTime;
    const slowTime = anticipate ? antTime : 0;

    // Distances (in symbols, travelling "down" = decreasing pos).
    const fastDistance = Math.max(len, profile.reelSpeed * fastTime);
    const slowDistance = antSpeed * slowTime;
    const from = reel.getPos();
    // Land exactly on the stop after covering at least fast+slow distance.
    const minTurns = Math.max(1, Math.ceil((fastDistance + slowDistance) / len));
    const target = landingPosition(from, stop, len, minTurns);
    const totalDistance = from - target;
    const fastPortion = totalDistance - slowDistance - profile.overshoot;

    const state = { pos: from };
    const apply = (blur: boolean) => () => {
      reel.setPos(state.pos, blur);
    };

    const sub = gsap.timeline();
    // Anticipation dip: a small pull UP before the reel launches down (classic wind-up).
    sub.to(state, {
      pos: from + 0.22,
      duration: 0.1,
      ease: 'power2.out',
      onUpdate: apply(false),
    });
    // Spin-up: accelerate into the travel (small share of the fast portion).
    const spinUpDist = Math.min(fastPortion * 0.15, profile.reelSpeed * profile.spinUpTime * 0.5);
    sub.to(state, {
      pos: from - spinUpDist,
      duration: profile.spinUpTime,
      ease: 'power2.in',
      onUpdate: apply(false),
    });
    // Constant-velocity travel, blurred; unblur shortly before the end.
    const travelTime = Math.max(0.05, fastTime - profile.spinUpTime);
    sub.to(state, {
      pos: from - fastPortion,
      duration: travelTime,
      ease: 'none',
      onUpdate: apply(true),
    });
    sub.add(() => {
      reel.setPos(state.pos, false);
    }, `>-${Math.min(profile.blurCutoff, travelTime * 0.5)}`);

    if (anticipate) {
      sub.add(() => hooks.onAnticipationStart?.(r));
      sub.to(state, {
        pos: from - fastPortion - slowDistance,
        duration: slowTime,
        ease: 'none',
        onUpdate: apply(false),
      });
      sub.add(() => hooks.onAnticipationEnd?.(r));
    }

    // The travel ends one overshoot-length above the stop; carry the reel past it…
    sub.add(() => hooks.onReelLand?.(r));
    sub.to(state, {
      pos: target - profile.overshoot,
      duration: Math.max(0.05, (2 * profile.overshoot) / (anticipate ? antSpeed : profile.reelSpeed) + 0.03),
      ease: 'power1.out',
      onUpdate: apply(false),
    });
    // …then settle back up onto it.
    sub.to(state, {
      pos: target,
      duration: profile.settleTime,
      ease: 'back.out(2.5)',
      onUpdate: apply(false),
    });
    // Hard guarantee of the end state (also what skip() lands on).
    sub.add(() => {
      state.pos = target;
      reel.setPos(target, false);
    });

    tl.add(sub, 0);
    if (anticipate) anticipationsBefore++;
  }
}

/**
 * Which reels deserve the anticipation slow-roll for a final grid: every reel from the third
 * onward that spins while ≥ 2 scatters have already landed to its left.
 */
export function anticipationReels(scatterByReel: readonly number[]): boolean[] {
  const out: boolean[] = [];
  let seen = 0;
  for (let r = 0; r < scatterByReel.length; r++) {
    out.push(r >= 2 && seen >= 2);
    seen += scatterByReel[r] ?? 0;
  }
  return out;
}
