import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { gsap } from 'gsap';
import { FIXED_TIMING, SPEED_PROFILES } from '@config/speeds';
import { anticipationReels, buildReelSpin } from '@/game/anim/reelSpin';
import type { ReelSpinPlan, SpinnableReel } from '@/game/anim/reelSpin';
import { TimelinePresentation } from '@/presentation/Presentation';
import { flushMicrotasks, installManualClock } from '../helpers/gsapClock';
import type { ManualClock } from '../helpers/gsapClock';

let clock: ManualClock;
beforeEach(() => {
  clock = installManualClock();
});
afterEach(() => {
  clock.uninstall();
});

class FakeReel implements SpinnableReel {
  readonly stripLength = 80;
  pos = 10;
  blur = false;
  history: number[] = [];
  blurSeen = false;
  getPos(): number {
    return this.pos;
  }
  setPos(pos: number, blur: boolean): void {
    this.history.push(pos);
    this.pos = pos;
    this.blur = blur;
    if (blur) this.blurSeen = true;
  }
}

const STOPS = [3, 17, 42, 63, 79];

function makeReels(): FakeReel[] {
  return Array.from({ length: 5 }, () => new FakeReel());
}

function mod(v: number, m: number): number {
  return ((Math.round(v) % m) + m) % m;
}

function build(reels: FakeReel[], plan: ReelSpinPlan, mode: 'normal' | 'turbo' | 'quick', hooks = {}): gsap.core.Timeline {
  const tl = gsap.timeline({ paused: true });
  buildReelSpin(tl, reels, plan, SPEED_PROFILES[mode], hooks);
  return tl;
}

describe('reel spin timeline', () => {
  it('lands every reel exactly on its stop, unblurred, moving only downwards', () => {
    const reels = makeReels();
    const tl = build(reels, { stops: STOPS, anticipation: [false, false, false, false, false] }, 'normal');
    tl.play(0);
    clock.tick(tl.duration() + 0.1, 60);
    reels.forEach((r, i) => {
      expect(mod(r.pos, r.stripLength)).toBe(STOPS[i]);
      expect(r.blur).toBe(false);
      expect(r.blurSeen).toBe(true);
      // Never travels upward beyond the settle overshoot.
      for (let k = 1; k < r.history.length; k++) {
        const prev = r.history[k - 1] ?? 0;
        const next = r.history[k] ?? 0;
        expect(next - prev).toBeLessThan(SPEED_PROFILES.normal.overshoot + 0.01);
      }
    });
  });

  it('reels land left to right', () => {
    const reels = makeReels();
    const landed: number[] = [];
    const tl = build(reels, { stops: STOPS, anticipation: [false, false, false, false, false] }, 'normal', {
      onReelLand: (r: number) => landed.push(r),
    });
    tl.play(0);
    clock.tick(tl.duration() + 0.1, 120);
    expect(landed).toEqual([0, 1, 2, 3, 4]);
  });

  it('skip mid-spin snaps to the exact stops with blur off (slam stop)', async () => {
    const reels = makeReels();
    const p = new TimelinePresentation('reels', (tl) =>
      buildReelSpin(tl, reels, { stops: STOPS, anticipation: [false, false, false, false, false] }, SPEED_PROFILES.normal),
    );
    void p.play();
    clock.tick(0.3);
    p.skip();
    await flushMicrotasks();
    reels.forEach((r, i) => {
      expect(mod(r.pos, r.stripLength)).toBe(STOPS[i]);
      expect(r.blur).toBe(false);
    });
  });

  it('turbo and quick are strictly faster than normal', () => {
    const dur = (mode: 'normal' | 'turbo' | 'quick'): number =>
      build(makeReels(), { stops: STOPS, anticipation: [false, false, false, false, false] }, mode).duration();
    expect(dur('turbo')).toBeLessThan(dur('normal') * 0.6);
    expect(dur('quick')).toBeLessThan(dur('turbo'));
  });

  it('anticipation extends the spin by the same fixed time in EVERY speed mode', () => {
    for (const mode of ['normal', 'turbo', 'quick'] as const) {
      const plain = build(makeReels(), { stops: STOPS, anticipation: [false, false, false, false, false] }, mode).duration();
      const anticip = build(makeReels(), { stops: STOPS, anticipation: [false, false, true, false, false] }, mode).duration();
      const extra = anticip - plain;
      expect(extra).toBeGreaterThan(FIXED_TIMING.anticipationTime * 0.8);
      expect(extra).toBeLessThan(FIXED_TIMING.anticipationTime * 1.4);
    }
  });

  it('anticipation hooks fire in order and the slow-roll is unblurred', () => {
    const reels = makeReels();
    const events: string[] = [];
    let blurDuringAnticipation = false;
    let inAnticipation = false;
    const reel2 = reels[2];
    if (!reel2) throw new Error('reel');
    const origSet = reel2.setPos.bind(reel2);
    reel2.setPos = (pos, blur) => {
      if (inAnticipation && blur) blurDuringAnticipation = true;
      origSet(pos, blur);
    };
    const tl = build(reels, { stops: STOPS, anticipation: [false, false, true, false, false] }, 'normal', {
      onAnticipationStart: (r: number) => {
        events.push(`start:${r}`);
        inAnticipation = true;
      },
      onAnticipationEnd: (r: number) => {
        events.push(`end:${r}`);
        inAnticipation = false;
      },
      onReelLand: (r: number) => events.push(`land:${r}`),
    });
    tl.play(0);
    clock.tick(tl.duration() + 0.1, 200);
    expect(events.filter((e) => e.startsWith('start'))).toEqual(['start:2']);
    expect(events.indexOf('start:2')).toBeGreaterThan(events.indexOf('land:1'));
    expect(events.indexOf('end:2')).toBeLessThan(events.indexOf('land:2'));
    expect(blurDuringAnticipation).toBe(false);
    // Reels 3 and 4 still land after the anticipation reel.
    expect(events.indexOf('land:3')).toBeGreaterThan(events.indexOf('land:2'));
  });

  it('later reels keep spinning through an earlier reel’s anticipation', () => {
    const reels = makeReels();
    const tl = build(reels, { stops: STOPS, anticipation: [false, false, true, false, false] }, 'normal');
    tl.play(0);
    // Halfway through the anticipation window, reels 3/4 must still be moving.
    const t = SPEED_PROFILES.normal.baseSpinTime + 2 * SPEED_PROFILES.normal.reelStagger + FIXED_TIMING.anticipationTime * 0.5;
    clock.tick(t, 60);
    const r3 = reels[3];
    const r4 = reels[4];
    if (!r3 || !r4) throw new Error('reels');
    const p3 = r3.pos;
    const p4 = r4.pos;
    clock.tick(0.2, 10);
    expect(r3.pos).toBeLessThan(p3);
    expect(r4.pos).toBeLessThan(p4);
  });
});

describe('anticipationReels', () => {
  it('activates from reel 3 once two scatters have landed to the left', () => {
    expect(anticipationReels([1, 1, 0, 0, 0])).toEqual([false, false, true, true, true]);
    expect(anticipationReels([0, 1, 1, 0, 0])).toEqual([false, false, false, true, true]);
    expect(anticipationReels([1, 0, 0, 1, 0])).toEqual([false, false, false, false, true]);
    expect(anticipationReels([0, 0, 0, 0, 0])).toEqual([false, false, false, false, false]);
    expect(anticipationReels([1, 1, 1, 0, 0])).toEqual([false, false, true, true, true]);
    expect(anticipationReels([0, 0, 1, 1, 1])).toEqual([false, false, false, false, true]);
  });
});
