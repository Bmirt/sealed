/**
 * Rolling-FPS governor for ambient effects. Pure (testable): feed it frame deltas,
 * read the current quality level.
 *
 *  full    → all ambience (embers, flicker, sky dragon)
 *  reduced → half the ember budget, no sky dragon
 *  minimal → quarter budget, no flicker
 */
export type QualityLevel = 'full' | 'reduced' | 'minimal';

export class PerfGovernor {
  private avgMs = 16.7;
  private level: QualityLevel = 'full';
  private holdUntil = 0;
  private elapsed = 0;

  /** Feed one frame's delta (ms). Returns the current level. */
  update(deltaMS: number): QualityLevel {
    this.elapsed += deltaMS;
    // Exponential moving average, ~1 s horizon.
    const alpha = Math.min(1, deltaMS / 1000);
    this.avgMs += (deltaMS - this.avgMs) * alpha;
    const fps = 1000 / this.avgMs;

    // Downgrade immediately; upgrade only after 4 s of good frames (hysteresis).
    if (fps < 38 && this.level !== 'minimal') {
      this.level = 'minimal';
      this.holdUntil = this.elapsed + 4000;
    } else if (fps < 48 && this.level === 'full') {
      this.level = 'reduced';
      this.holdUntil = this.elapsed + 4000;
    } else if (this.elapsed >= this.holdUntil) {
      if (fps > 55 && this.level === 'minimal') {
        this.level = 'reduced';
        this.holdUntil = this.elapsed + 4000;
      } else if (fps > 57 && this.level === 'reduced') {
        this.level = 'full';
        this.holdUntil = this.elapsed + 4000;
      }
    }
    return this.level;
  }

  get quality(): QualityLevel {
    return this.level;
  }

  get fps(): number {
    return 1000 / this.avgMs;
  }

  /** Ember budget multiplier for the current level. */
  emberScale(): number {
    return this.level === 'full' ? 1 : this.level === 'reduced' ? 0.5 : 0.25;
  }
}
