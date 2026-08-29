import { SYMBOL_H, SYMBOL_W } from '@/assets/procedural/metrics';

export type Orientation = 'landscape' | 'portrait';

export const REELS = 5;
export const ROWS = 3;
export const REELS_W = SYMBOL_W * REELS;
export const REELS_H = SYMBOL_H * ROWS;

/** Design-space boxes per orientation. The world is letterboxed into the viewport. */
export const DESIGN: Record<Orientation, { w: number; h: number }> = {
  landscape: { w: 1600, h: 900 },
  portrait: { w: 900, h: 1600 },
};

export interface Layout {
  readonly orientation: Orientation;
  readonly viewW: number;
  readonly viewH: number;
  /** World (design box) transform. */
  readonly scale: number;
  readonly offsetX: number;
  readonly offsetY: number;
  /** Reels block transform inside the world. */
  readonly reelsX: number;
  readonly reelsY: number;
  readonly reelsScale: number;
  /** Height reserved for the DOM HUD at the bottom, in CSS px. */
  readonly hudHeight: number;
}

export function computeLayout(viewW: number, viewH: number): Layout {
  const orientation: Orientation = viewW >= viewH ? 'landscape' : 'portrait';
  const d = DESIGN[orientation];
  const scale = Math.min(viewW / d.w, viewH / d.h);
  const offsetX = (viewW - d.w * scale) / 2;
  const offsetY = (viewH - d.h * scale) / 2;

  if (orientation === 'landscape') {
    const reelsScale = 1;
    return {
      orientation,
      viewW,
      viewH,
      scale,
      offsetX,
      offsetY,
      reelsScale,
      reelsX: (d.w - REELS_W * reelsScale) / 2,
      reelsY: 160,
      hudHeight: Math.max(84, Math.min(120, viewH * 0.14)),
    };
  }
  const reelsScale = 0.93;
  return {
    orientation,
    viewW,
    viewH,
    scale,
    offsetX,
    offsetY,
    reelsScale,
    reelsX: (d.w - REELS_W * reelsScale) / 2,
    reelsY: 480,
    hudHeight: Math.max(150, Math.min(260, viewH * 0.22)),
  };
}
