import type { Graphics } from 'pixi.js';
import { FillGradient } from 'pixi.js';
import { rgba } from '@config/palette';

/** The shared emblem look: bold warm-black outline, layered gradients, baked soft shadow. */
export const OUTLINE = 0x160c09;
export const OUTLINE_WIDTH = 4.5;

export function vGrad(stops: readonly (readonly [number, number])[], y0: number, y1: number): FillGradient {
  return new FillGradient({
    type: 'linear',
    start: { x: 0, y: y0 },
    end: { x: 0, y: y1 },
    colorStops: stops.map(([offset, color]) => ({ offset, color })),
    textureSpace: 'global',
  });
}

/** Soft baked drop shadow under an emblem (no filters - three stacked ellipses). */
export function dropShadow(g: Graphics, cx: number, cy: number, rx: number, ry: number, alpha = 0.5): void {
  g.ellipse(cx, cy, rx * 1.25, ry * 1.35).fill({ color: rgba(0x000000, alpha * 0.25) });
  g.ellipse(cx, cy, rx, ry).fill({ color: rgba(0x000000, alpha * 0.45) });
  g.ellipse(cx, cy, rx * 0.65, ry * 0.7).fill({ color: rgba(0x000000, alpha * 0.6) });
}

/** Fill + bold outline in one call - the cartoon-cut look every part shares. */
export function part(g: Graphics, poly: readonly number[], fill: FillGradient | number, width = OUTLINE_WIDTH): void {
  g.poly([...poly]).fill(typeof fill === 'number' ? { color: fill } : fill);
  g.poly([...poly]).stroke({ width, color: OUTLINE, join: 'round', cap: 'round' });
}
