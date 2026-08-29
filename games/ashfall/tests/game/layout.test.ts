import { describe, expect, it } from 'vitest';
import { DESIGN, REELS_H, REELS_W, computeLayout } from '@/game/layout';

describe('layout', () => {
  it.each([
    [1920, 1080, 'landscape'],
    [1600, 900, 'landscape'],
    [1024, 768, 'landscape'],
    [844, 390, 'landscape'],
    [390, 844, 'portrait'],
    [360, 640, 'portrait'],
    [768, 1024, 'portrait'],
  ] as const)('%i×%i → %s, reels inside the design box', (w, h, orientation) => {
    const l = computeLayout(w, h);
    expect(l.orientation).toBe(orientation);
    const d = DESIGN[orientation];
    // World fits the viewport.
    expect(d.w * l.scale).toBeLessThanOrEqual(w + 0.01);
    expect(d.h * l.scale).toBeLessThanOrEqual(h + 0.01);
    // Reels block within the design box.
    expect(l.reelsX).toBeGreaterThanOrEqual(0);
    expect(l.reelsX + REELS_W * l.reelsScale).toBeLessThanOrEqual(d.w);
    expect(l.reelsY).toBeGreaterThanOrEqual(0);
    expect(l.reelsY + REELS_H * l.reelsScale).toBeLessThanOrEqual(d.h);
    // Reels never overlap the HUD band.
    const reelsBottomPx = l.offsetY + (l.reelsY + REELS_H * l.reelsScale) * l.scale;
    expect(reelsBottomPx).toBeLessThanOrEqual(h - l.hudHeight + 0.01);
  });

  it('is centred (letterboxed)', () => {
    const l = computeLayout(2000, 900);
    expect(l.offsetX).toBeCloseTo((2000 - 1600 * l.scale) / 2);
    expect(l.offsetY).toBeCloseTo(0);
  });
});
