import { gsap } from 'gsap';

/**
 * One skippable beat of on-screen time. `skip()` jumps the underlying GSAP timeline to its end,
 * which fires every callback on the way, so the end state is IDENTICAL to letting it play out.
 * This is the invariant the whole skip system rests on — never bypass it with manual cleanup.
 */
export interface Presentation {
  /** Start (idempotent — repeated calls return the same promise). */
  play(): Promise<void>;
  /** Jump to the end state. Safe to call before play() (marks it pre-skipped) or after completion (no-op). */
  skip(): void;
  readonly done: boolean;
  /** For debugging / input decisions. */
  readonly label: string;
}

/**
 * Standard implementation over a timeline factory. The factory receives the timeline to fill.
 * The timeline is created only when play() is called (state is captured late, at play time).
 */
export class TimelinePresentation implements Presentation {
  readonly label: string;
  private timeline: gsap.core.Timeline | null = null;
  private promise: Promise<void> | null = null;
  private finished = false;
  private preSkipped = false;
  private readonly build: (tl: gsap.core.Timeline) => void;

  constructor(label: string, build: (tl: gsap.core.Timeline) => void) {
    this.label = label;
    this.build = build;
  }

  get done(): boolean {
    return this.finished;
  }

  play(): Promise<void> {
    if (this.promise) return this.promise;
    this.promise = new Promise<void>((resolve) => {
      const tl = gsap.timeline({
        paused: true,
        onComplete: () => {
          this.finished = true;
          resolve();
        },
      });
      this.build(tl);
      this.timeline = tl;
      if (this.preSkipped) {
        // Run every callback, land on the end state, resolve synchronously.
        tl.progress(1, false);
      } else {
        tl.play(0);
      }
    });
    return this.promise;
  }

  skip(): void {
    if (this.finished) return;
    if (!this.timeline) {
      this.preSkipped = true;
      return;
    }
    // progress(1) advances through the timeline firing .call()s and onCompletes.
    this.timeline.progress(1, false);
  }

  /** Kill without completing — only for teardown (never during normal flow). */
  destroy(): void {
    this.timeline?.kill();
    this.finished = true;
  }
}

/** A trivial presentation that runs a side effect instantly (queue markers, state flips). */
export class InstantPresentation implements Presentation {
  readonly label: string;
  private finished = false;
  private readonly effect: () => void;

  constructor(label: string, effect: () => void) {
    this.label = label;
    this.effect = effect;
  }

  get done(): boolean {
    return this.finished;
  }

  play(): Promise<void> {
    if (!this.finished) {
      this.effect();
      this.finished = true;
    }
    return Promise.resolve();
  }

  skip(): void {
    if (!this.finished) {
      this.effect();
      this.finished = true;
    }
  }
}
