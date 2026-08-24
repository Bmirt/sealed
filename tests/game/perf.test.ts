import { describe, expect, it } from 'vitest';
import { PerfGovernor } from '@/game/perf';

function feed(g: PerfGovernor, fps: number, seconds: number): void {
  const delta = 1000 / fps;
  for (let t = 0; t < seconds * 1000; t += delta) g.update(delta);
}

describe('PerfGovernor', () => {
  it('stays at full quality at 60 fps', () => {
    const g = new PerfGovernor();
    feed(g, 60, 5);
    expect(g.quality).toBe('full');
    expect(g.emberScale()).toBe(1);
  });

  it('sheds to reduced below ~48 fps and to minimal below ~38 fps', () => {
    const g = new PerfGovernor();
    feed(g, 60, 2);
    feed(g, 44, 3);
    expect(g.quality).toBe('reduced');
    expect(g.emberScale()).toBe(0.5);
    feed(g, 30, 3);
    expect(g.quality).toBe('minimal');
    expect(g.emberScale()).toBe(0.25);
  });

  it('recovers only after sustained good frames (hysteresis)', () => {
    const g = new PerfGovernor();
    feed(g, 30, 3);
    expect(g.quality).toBe('minimal');
    // A short good burst must NOT restore quality…
    feed(g, 60, 1);
    expect(g.quality).toBe('minimal');
    // …but a sustained one climbs back one level at a time.
    feed(g, 60, 5);
    expect(g.quality).toBe('reduced');
    feed(g, 60, 5);
    expect(g.quality).toBe('full');
  });

  it('never flaps between levels on the boundary', () => {
    const g = new PerfGovernor();
    feed(g, 60, 2);
    const seen = new Set<string>();
    for (let i = 0; i < 20; i++) {
      feed(g, 49, 0.5);
      feed(g, 52, 0.5);
      seen.add(g.quality);
    }
    // Boundary noise may cost one level but must not oscillate through all three.
    expect(seen.size).toBeLessThanOrEqual(2);
  });
});
