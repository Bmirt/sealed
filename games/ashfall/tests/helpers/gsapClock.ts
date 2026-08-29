import { gsap } from 'gsap';

export interface ManualClock {
  /** Advance time by `seconds` (in steps so onUpdate fires like a real ticker). */
  tick(seconds: number, steps?: number): void;
  now(): number;
  uninstall(): void;
}

/**
 * Drive GSAP with a manual clock (the documented `gsap.updateRoot` pattern):
 * removes the internal RAF tick and advances the global timeline explicitly.
 */
export function installManualClock(): ManualClock {
  gsap.ticker.lagSmoothing(0);
  gsap.ticker.remove(gsap.updateRoot);
  gsap.globalTimeline.clear();
  let t = 0;
  gsap.updateRoot(t);
  return {
    tick(seconds: number, steps = 8): void {
      for (let i = 0; i < steps; i++) {
        t += seconds / steps;
        gsap.updateRoot(t);
      }
    },
    now(): number {
      return t;
    },
    uninstall(): void {
      gsap.globalTimeline.clear();
      gsap.ticker.add(gsap.updateRoot);
    },
  };
}

/** Let queued microtasks (resolved presentation promises) run. */
export async function flushMicrotasks(rounds = 6): Promise<void> {
  for (let i = 0; i < rounds; i++) await Promise.resolve();
}
