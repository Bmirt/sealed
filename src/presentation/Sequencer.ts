import type { Presentation } from './Presentation';

/**
 * Runs presentations strictly in order. One sequencer per surface (the main game flow uses one).
 *
 *  - skipCurrent(): the playing presentation jumps to its end state; the queue continues.
 *  - abortToEndState(): the playing presentation AND everything queued jump to their end states
 *    synchronously (each is played and immediately skipped so every side effect still happens).
 *    Used when Spin is pressed during a win presentation.
 */
export class Sequencer {
  private queue: Presentation[] = [];
  private current: Presentation | null = null;
  private running: Promise<void> | null = null;
  private aborting = false;

  get currentLabel(): string | null {
    return this.current?.label ?? null;
  }

  get isRunning(): boolean {
    return this.running !== null;
  }

  enqueue(...presentations: Presentation[]): void {
    this.queue.push(...presentations);
  }

  /** Play everything queued (and whatever is enqueued while running). Resolves when drained. */
  run(): Promise<void> {
    this.running ??= this.loop().finally(() => {
      this.running = null;
    });
    return this.running;
  }

  private async loop(): Promise<void> {
    for (;;) {
      const next = this.queue.shift();
      if (!next) break;
      this.current = next;
      if (this.aborting) next.skip();
      const p = next.play();
      if (this.aborting) next.skip();
      await p;
      this.current = null;
    }
    this.aborting = false;
  }

  skipCurrent(): void {
    this.current?.skip();
  }

  /**
   * Everything — current and queued — to its end state, now. Side effects all fire.
   * While the loop drains, newly dequeued items are skipped as they start.
   */
  abortToEndState(): void {
    if (!this.current && this.queue.length === 0) return;
    this.aborting = true;
    this.current?.skip();
    // Pre-skip everything already queued so play() lands instantly.
    for (const p of this.queue) p.skip();
  }

  /** Drop queued items without running them. Only for hard teardown (scene destruction). */
  clear(): void {
    this.queue = [];
  }
}
