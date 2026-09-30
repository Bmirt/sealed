import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { gsap } from 'gsap';
import { FIXED_TIMING, SPEED_PROFILES, WIN_TIERS, tierFor } from '@config/speeds';
import { buildTierHold, buildTierRoll, buildWinShow } from '@/game/anim/winShow';
import type { CounterLike, TierSurface, WinShowSurface } from '@/game/anim/winShow';
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

class FakeCounter implements CounterLike {
  value = -1;
  visible = false;
  readonly values: number[] = [];
  set(cents: number): void {
    this.value = cents;
    this.values.push(cents);
  }
  show(): void {
    this.visible = true;
  }
  hide(): void {
    this.visible = false;
  }
}

class FakeCell {
  pulse = 1;
  pop = 0;
  setPulse(v: number): void {
    this.pulse = v;
  }
  setPop(v: number): void {
    this.pop = v;
  }
}

class FakeSurface implements WinShowSurface {
  dim = false;
  flares = false;
  celebrations: number[] = [];
  readonly counter = new FakeCounter();
  readonly cells = [new FakeCell(), new FakeCell(), new FakeCell()];
  get winningCells(): FakeCell[] {
    return this.cells;
  }
  setDim(on: boolean): void {
    this.dim = on;
  }
  setFlares(on: boolean): void {
    this.flares = on;
  }
  celebrate(cents: number): void {
    this.celebrations.push(cents);
  }
}

class FakeTier implements TierSurface {
  visible = false;
  label = '';
  readonly counter = new FakeCounter();
  shakes: number[] = [];
  bursts: number[] = [];
  progress = 0;
  show(label: string): void {
    this.visible = true;
    this.label = label;
  }
  hide(): void {
    this.visible = false;
  }
  shake(i: number): void {
    this.shakes.push(i);
  }
  burst(s: number): void {
    this.bursts.push(s);
  }
  setRollProgress(p: number): void {
    this.progress = p;
  }
}

describe('win show', () => {
  it('dims, pulses, rolls up monotonically to the exact total, then restores everything', async () => {
    const s = new FakeSurface();
    const p = new TimelinePresentation('wins', (tl) => buildWinShow(tl, s, 12_345, 5, SPEED_PROFILES.normal));
    void p.play();
    clock.tick(0.05);
    expect(s.dim).toBe(true);
    expect(s.flares).toBe(true);
    expect(s.counter.visible).toBe(true);
    clock.tick(0.3);
    expect(s.cells[0]?.pop).toBeGreaterThan(0);
    expect(s.celebrations).toEqual([12_345]);
    clock.tick(5, 100);
    await flushMicrotasks();
    expect(s.counter.value).toBe(12_345);
    for (let i = 1; i < s.counter.values.length; i++) {
      expect(s.counter.values[i] ?? 0).toBeGreaterThanOrEqual(s.counter.values[i - 1] ?? 0);
    }
    expect(s.dim).toBe(false);
    expect(s.flares).toBe(false);
    expect(s.cells.every((c) => c.pulse === 1 && c.pop >= 1)).toBe(true);
    expect(p.done).toBe(true);
  });

  it('skip mid-roll snaps the counter to the total with the full end state (no double credit surface)', async () => {
    const s = new FakeSurface();
    const p = new TimelinePresentation('wins', (tl) => buildWinShow(tl, s, 50_000, 20, SPEED_PROFILES.normal));
    void p.play();
    clock.tick(0.2);
    const before = s.counter.value;
    expect(before).toBeLessThan(50_000);
    p.skip();
    await flushMicrotasks();
    expect(s.counter.value).toBe(50_000);
    expect(s.dim).toBe(false);
    expect(s.flares).toBe(false);
    // A second skip changes nothing.
    p.skip();
    expect(s.counter.value).toBe(50_000);
  });

  it('turbo and quick roll-ups are shorter than normal', () => {
    const dur = (mode: 'normal' | 'turbo' | 'quick'): number => {
      const tl = gsap.timeline({ paused: true });
      buildWinShow(tl, new FakeSurface(), 10_000, 10, SPEED_PROFILES[mode]);
      return tl.duration();
    };
    expect(dur('turbo')).toBeLessThan(dur('normal'));
    expect(dur('quick')).toBeLessThan(dur('turbo'));
  });
});

describe('tier sequence', () => {
  it('tier thresholds map 15/50/100/500× to big/mega/epic/legendary', () => {
    expect(tierFor(14.9)).toBeNull();
    expect(tierFor(15)?.name).toBe('big');
    expect(tierFor(49)?.name).toBe('big');
    expect(tierFor(50)?.name).toBe('mega');
    expect(tierFor(100)?.name).toBe('epic');
    expect(tierFor(499)?.name).toBe('epic');
    expect(tierFor(500)?.name).toBe('legendary');
    expect(tierFor(5000)?.name).toBe('legendary');
  });

  it('the roll length is fixed per tier - the same in every speed mode (turbo never shortens it)', () => {
    const tier = WIN_TIERS[3];
    if (!tier) throw new Error('tier');
    const dur = (): number => {
      const tl = gsap.timeline({ paused: true });
      buildTierRoll(tl, new FakeTier(), tier, 0, 100_000);
      return tl.duration();
    };
    // The builder takes no speed profile at all - assert the length matches the fixed config.
    expect(dur()).toBeCloseTo(FIXED_TIMING.tier.introTime + (FIXED_TIMING.tier.rollupTimes[0] ?? 0), 3);
  });

  it('escalating tiers roll longer', () => {
    const roll = (i: number): number => {
      const tier = WIN_TIERS[WIN_TIERS.length - 1 - i];
      if (!tier) throw new Error('tier');
      const tl = gsap.timeline({ paused: true });
      buildTierRoll(tl, new FakeTier(), tier, i, 100_000);
      return tl.duration();
    };
    expect(roll(1)).toBeGreaterThan(roll(0));
    expect(roll(3)).toBeGreaterThan(roll(2));
  });

  it('roll: shows, shakes, bursts, counts to the total; skip snaps the counter but keeps the overlay up', async () => {
    const s = new FakeTier();
    const tier = WIN_TIERS[2];
    if (!tier) throw new Error('tier');
    const p = new TimelinePresentation('tier-roll', (tl) => buildTierRoll(tl, s, tier, 1, 777_00));
    void p.play();
    clock.tick(FIXED_TIMING.tier.introTime + 0.3);
    expect(s.visible).toBe(true);
    expect(s.label).toBe('MEGA WIN');
    expect(s.shakes.length).toBe(1);
    expect(s.counter.value).toBeLessThan(777_00);
    p.skip();
    await flushMicrotasks();
    expect(s.counter.value).toBe(777_00);
    expect(s.progress).toBe(1);
    expect(s.visible).toBe(true); // still up - dismissing is the hold presentation's job
    expect(s.bursts.length).toBeGreaterThanOrEqual(2); // entry + fountain(s) + completion
  });

  it('hold: waits, then dismisses; skipping the hold dismisses immediately', async () => {
    const s = new FakeTier();
    s.show('BIG WIN');
    const p = new TimelinePresentation('tier-hold', (tl) => buildTierHold(tl, s));
    void p.play();
    clock.tick(0.2);
    expect(s.visible).toBe(true);
    p.skip();
    await flushMicrotasks();
    expect(s.visible).toBe(false);
    expect(p.done).toBe(true);
  });
});
