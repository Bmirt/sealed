import type { Graphics } from 'pixi.js';
import { FillGradient } from 'pixi.js';
import { PALETTE } from '@config/palette';
import { flat, pt, star } from './shapes';

function vGrad(top: number, bottom: number, y0: number, y1: number): FillGradient {
  return new FillGradient({
    type: 'linear',
    start: { x: 0, y: y0 },
    end: { x: 0, y: y1 },
    colorStops: [
      { offset: 0, color: top },
      { offset: 1, color: bottom },
    ],
    textureSpace: 'global',
  });
}

/** Obsidian Crown — black glass crown with gold inlay and a garnet. */
export function drawCrown(g: Graphics): void {
  const body = flat([
    pt(-58, 26), pt(-62, -18), pt(-40, 2), pt(-26, -38), pt(-10, 0), pt(0, -48), pt(10, 0), pt(26, -38), pt(40, 2), pt(62, -18), pt(58, 26),
  ]);
  // Shadow + rim.
  g.poly(body.map((v, i) => v + (i % 2 === 0 ? 2 : 2.5))).fill({ color: PALETTE.black, alpha: 0.6 });
  g.poly(body.map((v, i) => v + (i % 2 === 0 ? -1.5 : -1.5))).fill({ color: PALETTE.gold, alpha: 0.9 });
  g.poly(body).fill(vGrad(0x2c2833, PALETTE.obsidian, -48, 26));
  // Glass sheen.
  g.moveTo(-52, 20).lineTo(-58, -12).stroke({ width: 2, color: 0x5a5566, alpha: 0.7 });
  g.moveTo(-4, 16).lineTo(0, -40).stroke({ width: 2, color: 0x5a5566, alpha: 0.5 });
  // Gold band.
  g.roundRect(-60, 22, 120, 22, 4).fill(vGrad(PALETTE.goldHi, PALETTE.goldDeep, 22, 44));
  g.roundRect(-60, 22, 120, 22, 4).stroke({ width: 1.5, color: 0x5a3a08, alpha: 0.9 });
  g.moveTo(-56, 26).lineTo(56, 26).stroke({ width: 1, color: 0xfff1c2, alpha: 0.8 });
  // Gold points on the spikes.
  for (const [x, y] of [
    [-62, -18],
    [-26, -38],
    [26, -38],
    [62, -18],
  ] as const) {
    g.circle(x, y, 3.2).fill({ color: PALETTE.gold });
    g.circle(x - 0.8, y - 0.8, 1.2).fill({ color: 0xfff1c2 });
  }
  g.circle(0, -48, 4).fill({ color: PALETTE.gold });
  g.circle(-1, -49, 1.5).fill({ color: 0xfff1c2 });
  // Garnet centre jewel.
  g.poly(star(0, 33, 4, 9, 5.5, Math.PI / 4)).fill({ color: PALETTE.garnet });
  g.poly(star(0, 33, 4, 9, 5.5, Math.PI / 4)).stroke({ width: 1, color: 0xfff1c2, alpha: 0.8 });
  g.circle(-2, 30, 1.8).fill({ color: 0xffb3bd, alpha: 0.9 });
  // Side jewels.
  for (const x of [-34, 34]) {
    g.circle(x, 33, 4).fill({ color: PALETTE.emberDeep });
    g.circle(x, 33, 4).stroke({ width: 1, color: 0xfff1c2, alpha: 0.7 });
  }
}

/** Ancestral Blade — a dark two-hander, gold hilt, ember-lit fuller. */
export function drawBlade(g: Graphics): void {
  // Blade (points up).
  const blade = flat([pt(0, -66), pt(9, -54), pt(9, 14), pt(-9, 14), pt(-9, -54)]);
  g.poly(blade.map((v, i) => v + (i % 2 === 0 ? 2 : 2.5))).fill({ color: PALETTE.black, alpha: 0.6 });
  g.poly(blade).fill(vGrad(0x8d8a96, 0x3a3642, -66, 14));
  g.moveTo(-8, -52).lineTo(-8, 12).stroke({ width: 1.5, color: 0xc8c4d0, alpha: 0.9 }); // edge highlight
  g.moveTo(8, -52).lineTo(8, 12).stroke({ width: 1.5, color: PALETTE.black, alpha: 0.6 });
  // Fuller with ember light.
  g.roundRect(-2.5, -48, 5, 56, 2).fill({ color: PALETTE.obsidian });
  g.roundRect(-1.2, -46, 2.4, 52, 1).fill({ color: PALETTE.ember, alpha: 0.95 });
  g.roundRect(-0.5, -44, 1, 48, 0.5).fill({ color: 0xffd9a8, alpha: 0.9 });
  // Crossguard.
  const guard = flat([pt(-40, 14), pt(-44, 24), pt(-34, 28), pt(-6, 22), pt(6, 22), pt(34, 28), pt(44, 24), pt(40, 14), pt(6, 18), pt(-6, 18)]);
  g.poly(guard.map((v, i) => v + (i % 2 === 0 ? 1.5 : 2))).fill({ color: PALETTE.black, alpha: 0.6 });
  g.poly(guard).fill(vGrad(PALETTE.goldHi, PALETTE.goldDeep, 14, 28));
  g.poly(guard).stroke({ width: 1, color: 0x5a3a08, alpha: 0.9 });
  // Grip.
  g.roundRect(-5, 26, 10, 30, 3).fill(vGrad(0x3a1d10, 0x1d0e08, 26, 56));
  for (let y = 30; y < 54; y += 6) g.moveTo(-5, y).lineTo(5, y + 2).stroke({ width: 1, color: PALETTE.goldDeep, alpha: 0.8 });
  // Pommel with dragon-eye gem.
  g.circle(0, 62, 8).fill(vGrad(PALETTE.goldHi, PALETTE.goldDeep, 54, 70));
  g.circle(0, 62, 8).stroke({ width: 1, color: 0x5a3a08, alpha: 0.9 });
  g.circle(0, 62, 3.5).fill({ color: PALETTE.garnet });
  g.circle(-1, 61, 1.2).fill({ color: 0xffb3bd, alpha: 0.9 });
}
