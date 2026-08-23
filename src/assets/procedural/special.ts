import type { Graphics } from 'pixi.js';
import { FillGradient } from 'pixi.js';
import { PALETTE } from '@config/palette';
import { flat, jitter, pt, xform } from './shapes';

function vGrad(stops: { offset: number; color: number }[], y0: number, y1: number): FillGradient {
  return new FillGradient({ type: 'linear', start: { x: 0, y: y0 }, end: { x: 0, y: y1 }, colorStops: stops, textureSpace: 'global' });
}

/** The Molten Throne — wild. Obsidian throne veined with lava, fire licking at its base. */
export function drawMoltenThrone(g: Graphics): void {
  // Fire glow behind.
  g.ellipse(0, 30, 62, 34).fill({ color: PALETTE.lava, alpha: 0.22 });
  g.ellipse(0, 36, 40, 20).fill({ color: PALETTE.ember, alpha: 0.25 });

  // Flames at the base.
  const rnd = jitter(99);
  for (let i = 0; i < 7; i++) {
    const x = -48 + i * 16 + (rnd() - 0.5) * 6;
    const h = 18 + rnd() * 22;
    const flame = flat([pt(x - 7, 52), pt(x - 9, 40), pt(x - 2, 52 - h), pt(x + 3, 40 - h * 0.4), pt(x + 8, 42), pt(x + 6, 52)]);
    g.poly(flame).fill({ color: PALETTE.emberDeep, alpha: 0.95 });
    g.poly(xform(flame, 0, 4, 0.6)).fill({ color: PALETTE.goldHi, alpha: 0.9 });
  }

  // Throne back (tall, pointed, with spires).
  const back = flat([
    pt(-40, 30), pt(-44, -20), pt(-36, -34), pt(-30, -58), pt(-22, -40), pt(-12, -52), pt(0, -70), pt(12, -52), pt(22, -40), pt(30, -58),
    pt(36, -34), pt(44, -20), pt(40, 30),
  ]);
  g.poly(xform(back, 2, 2.5)).fill({ color: PALETTE.black, alpha: 0.6 });
  g.poly(back).fill(vGrad([{ offset: 0, color: 0x2c2833 }, { offset: 1, color: PALETTE.obsidian }], -70, 30));
  g.poly(back).stroke({ width: 1.5, color: 0x4a4654, alpha: 0.9 });

  // Lava veins on the back.
  const veins: [number, number, number, number, number, number][] = [
    [-30, 20, -22, -10, -28, -30],
    [0, 24, 4, -10, 0, -40],
    [30, 20, 22, -10, 28, -30],
    [-14, 0, -8, -20, -16, -36],
    [14, 0, 8, -20, 16, -36],
  ];
  for (const [x0, y0, cx, cy, x1, y1] of veins) {
    g.moveTo(x0, y0).quadraticCurveTo(cx, cy, x1, y1).stroke({ width: 3, color: PALETTE.emberDeep, alpha: 0.9 });
    g.moveTo(x0, y0).quadraticCurveTo(cx, cy, x1, y1).stroke({ width: 1.2, color: PALETTE.goldHi, alpha: 0.95 });
  }

  // Seat (molten).
  g.roundRect(-46, 18, 92, 18, 4).fill(vGrad([{ offset: 0, color: PALETTE.goldHi }, { offset: 0.5, color: PALETTE.ember }, { offset: 1, color: PALETTE.emberDeep }], 18, 36));
  g.roundRect(-46, 18, 92, 18, 4).stroke({ width: 1.5, color: PALETTE.black, alpha: 0.7 });
  // Arms.
  for (const s of [-1, 1]) {
    const arm = flat([pt(s * 40, 10), pt(s * 54, 6), pt(s * 56, 38), pt(s * 44, 40)]);
    g.poly(arm).fill({ color: 0x2c2833 });
    g.poly(arm).stroke({ width: 1.5, color: 0x4a4654, alpha: 0.9 });
    g.circle(s * 48, 8, 4).fill({ color: PALETTE.ember });
    g.circle(s * 48, 8, 1.6).fill({ color: PALETTE.goldHi });
  }
  // Legs.
  g.roundRect(-44, 36, 12, 14, 2).fill({ color: PALETTE.obsidian });
  g.roundRect(32, 36, 12, 14, 2).fill({ color: PALETTE.obsidian });
  // Spire tips glow.
  for (const [x, y] of [
    [-30, -58],
    [0, -70],
    [30, -58],
  ] as const) {
    g.circle(x, y, 3).fill({ color: PALETTE.ember, alpha: 0.9 });
    g.circle(x, y, 1.4).fill({ color: PALETTE.goldHi });
  }
}

/** Dragon Egg — scatter. Scaled obsidian egg, cracks leaking light, on a ring of ember. */
export function drawDragonEgg(g: Graphics): void {
  // Glow.
  g.ellipse(0, 6, 56, 64).fill({ color: PALETTE.garnet, alpha: 0.22 });
  g.ellipse(0, 6, 40, 50).fill({ color: PALETTE.ember, alpha: 0.16 });

  // Egg silhouette (narrow top).
  const egg: number[] = [];
  for (let i = 0; i <= 40; i++) {
    const a = (i / 40) * Math.PI * 2;
    const r = 1 + 0.18 * Math.sin(a) * (Math.sin(a) > 0 ? 1 : 0.4); // wider at the bottom
    egg.push(Math.sin(a) * 40 * (1 - 0.12 * Math.cos(a)), -Math.cos(a) * 54 * r);
  }
  g.poly(xform(egg, 2, 3)).fill({ color: PALETTE.black, alpha: 0.6 });
  g.poly(xform(egg, -1.5, -1.5)).fill({ color: PALETTE.garnet, alpha: 0.9 });
  g.poly(egg).fill(vGrad([{ offset: 0, color: 0x3a2d3a }, { offset: 0.6, color: 0x1d1520 }, { offset: 1, color: PALETTE.obsidian }], -58, 60));

  // Scales (rows of arcs).
  const rnd = jitter(7);
  for (let row = 0; row < 7; row++) {
    const y = -40 + row * 14;
    const halfW = Math.max(8, 36 * Math.sqrt(1 - (y / 56) ** 2));
    for (let x = -halfW + (row % 2 ? 7 : 0); x < halfW; x += 14) {
      g.moveTo(x - 6, y).quadraticCurveTo(x, y + 8, x + 6, y).stroke({ width: 1.2, color: 0x4a3a4e, alpha: 0.9 });
      if (rnd() > 0.7) g.moveTo(x - 5, y + 1).quadraticCurveTo(x, y + 7, x + 5, y + 1).stroke({ width: 1, color: PALETTE.garnet, alpha: 0.6 });
    }
  }

  // Cracks leaking light.
  const cracks: number[][] = [
    [-8, -30, -2, -14, -10, 2, -4, 16],
    [12, -10, 6, 4, 14, 18, 8, 32],
    [-18, 20, -8, 26, -14, 40],
  ];
  for (const c of cracks) {
    g.moveTo(c[0] ?? 0, c[1] ?? 0);
    for (let i = 2; i < c.length; i += 2) g.lineTo(c[i] ?? 0, c[i + 1] ?? 0);
    g.stroke({ width: 3.5, color: PALETTE.ember, alpha: 0.85 });
    g.moveTo(c[0] ?? 0, c[1] ?? 0);
    for (let i = 2; i < c.length; i += 2) g.lineTo(c[i] ?? 0, c[i + 1] ?? 0);
    g.stroke({ width: 1.4, color: 0xfff1c2, alpha: 0.95 });
  }

  // Ember ring / nest.
  g.ellipse(0, 54, 46, 9).fill({ color: PALETTE.obsidian });
  g.ellipse(0, 54, 46, 9).stroke({ width: 2, color: PALETTE.emberDeep, alpha: 0.9 });
  for (let i = 0; i < 9; i++) {
    const a = (i / 9) * Math.PI * 2;
    g.circle(Math.cos(a) * 42, 54 + Math.sin(a) * 7, 1.8).fill({ color: PALETTE.goldHi, alpha: 0.9 });
  }
  // Specular.
  g.ellipse(-14, -30, 5, 10).fill({ color: 0xffffff, alpha: 0.12 });
}
