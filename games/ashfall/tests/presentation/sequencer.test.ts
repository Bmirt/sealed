import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { InstantPresentation, TimelinePresentation } from '@/presentation/Presentation';
import { Sequencer } from '@/presentation/Sequencer';
import { flushMicrotasks, installManualClock } from '../helpers/gsapClock';
import type { ManualClock } from '../helpers/gsapClock';

let clock: ManualClock;

beforeEach(() => {
  clock = installManualClock();
});
afterEach(() => {
  clock.uninstall();
});

function tween(label: string, target: { v: number }, to: number, duration: number, effects?: { onDone?: () => void }): TimelinePresentation {
  return new TimelinePresentation(label, (tl) => {
    tl.to(target, { v: to, duration, ease: 'none' });
    tl.add(() => {
      target.v = to;
      effects?.onDone?.();
    });
  });
}

describe('TimelinePresentation', () => {
  it('plays to completion in real (manual) time', async () => {
    const obj = { v: 0 };
    const p = tween('t', obj, 100, 1);
    let resolved = false;
    void p.play().then(() => {
      resolved = true;
    });
    clock.tick(0.5);
    expect(obj.v).toBeGreaterThan(20);
    expect(obj.v).toBeLessThan(80);
    expect(resolved).toBe(false);
    clock.tick(0.6);
    await flushMicrotasks();
    expect(obj.v).toBe(100);
    expect(resolved).toBe(true);
    expect(p.done).toBe(true);
  });

  it('skip mid-flight lands on the exact end state and resolves', async () => {
    const obj = { v: 0 };
    let doneEffects = 0;
    const p = tween('t', obj, 100, 1, { onDone: () => doneEffects++ });
    void p.play();
    clock.tick(0.3);
    p.skip();
    await flushMicrotasks();
    expect(obj.v).toBe(100);
    expect(doneEffects).toBe(1);
    expect(p.done).toBe(true);
  });

  it('skip before play() pre-skips: play resolves instantly with all side effects', async () => {
    const obj = { v: 0 };
    let doneEffects = 0;
    const p = tween('t', obj, 100, 1, { onDone: () => doneEffects++ });
    p.skip();
    await p.play();
    expect(obj.v).toBe(100);
    expect(doneEffects).toBe(1);
  });

  it('double skip / skip after completion is a no-op (no double side effects)', async () => {
    const obj = { v: 0 };
    let doneEffects = 0;
    const p = tween('t', obj, 100, 0.5, { onDone: () => doneEffects++ });
    void p.play();
    clock.tick(1);
    await flushMicrotasks();
    expect(doneEffects).toBe(1);
    p.skip();
    p.skip();
    expect(doneEffects).toBe(1);
    expect(obj.v).toBe(100);
  });

  it('timeline .call side effects fire exactly once when skipped mid-way', async () => {
    const calls: string[] = [];
    const p = new TimelinePresentation('t', (tl) => {
      tl.add(() => calls.push('a'));
      tl.to({}, { duration: 0.5 });
      tl.add(() => calls.push('b'));
      tl.to({}, { duration: 0.5 });
      tl.add(() => calls.push('c'));
    });
    void p.play();
    clock.tick(0.6); // past 'b'
    p.skip();
    await flushMicrotasks();
    expect(calls).toEqual(['a', 'b', 'c']);
  });
});

describe('Sequencer', () => {
  it('runs presentations strictly in order', async () => {
    const order: string[] = [];
    const seq = new Sequencer();
    const a = { v: 0 };
    const b = { v: 0 };
    seq.enqueue(
      tween('a', a, 1, 0.4, { onDone: () => order.push('a') }),
      tween('b', b, 1, 0.4, { onDone: () => order.push('b') }),
      new InstantPresentation('c', () => order.push('c')),
    );
    const done = seq.run();
    clock.tick(0.41);
    await flushMicrotasks();
    expect(order).toEqual(['a']);
    expect(seq.currentLabel).toBe('b');
    clock.tick(0.41);
    await flushMicrotasks();
    await done;
    expect(order).toEqual(['a', 'b', 'c']);
  });

  it('skipCurrent only affects the playing presentation', async () => {
    const order: string[] = [];
    const seq = new Sequencer();
    const a = { v: 0 };
    const b = { v: 0 };
    seq.enqueue(tween('a', a, 1, 1, { onDone: () => order.push('a') }), tween('b', b, 1, 1, { onDone: () => order.push('b') }));
    const done = seq.run();
    clock.tick(0.1);
    seq.skipCurrent();
    await flushMicrotasks();
    expect(a.v).toBe(1);
    expect(order).toEqual(['a']);
    expect(b.v).toBeLessThan(1); // b plays normally
    clock.tick(1.05);
    await flushMicrotasks();
    await done;
    expect(order).toEqual(['a', 'b']);
  });

  it('abortToEndState finishes current AND queued with every side effect exactly once', async () => {
    const order: string[] = [];
    const seq = new Sequencer();
    const a = { v: 0 };
    const b = { v: 0 };
    const c = { v: 0 };
    seq.enqueue(
      tween('a', a, 1, 1, { onDone: () => order.push('a') }),
      tween('b', b, 5, 1, { onDone: () => order.push('b') }),
      tween('c', c, 7, 1, { onDone: () => order.push('c') }),
    );
    const done = seq.run();
    clock.tick(0.2);
    seq.abortToEndState();
    await done;
    expect(order).toEqual(['a', 'b', 'c']);
    expect(a.v).toBe(1);
    expect(b.v).toBe(5);
    expect(c.v).toBe(7);
  });

  it('presentations enqueued while running are played (and a later abort covers them)', async () => {
    const order: string[] = [];
    const seq = new Sequencer();
    const a = { v: 0 };
    seq.enqueue(tween('a', a, 1, 0.5, { onDone: () => order.push('a') }));
    const done = seq.run();
    clock.tick(0.1);
    const b = { v: 0 };
    seq.enqueue(tween('b', b, 1, 0.5, { onDone: () => order.push('b') }));
    clock.tick(0.45);
    await flushMicrotasks();
    seq.abortToEndState();
    await done;
    expect(order).toEqual(['a', 'b']);
    expect(b.v).toBe(1);
  });

  it('run() resolves immediately for an empty queue and can be reused', async () => {
    const seq = new Sequencer();
    await seq.run();
    const a = { v: 0 };
    seq.enqueue(tween('a', a, 1, 0.2));
    const done = seq.run();
    clock.tick(0.25);
    await flushMicrotasks();
    await done;
    expect(a.v).toBe(1);
  });
});
