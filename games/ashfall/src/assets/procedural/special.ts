import type { Graphics } from 'pixi.js';
import { PALETTE, rgba } from '@config/palette';
import { flat, jitter, pt, xform } from './shapes';
import { OUTLINE, dropShadow, part, vGrad } from './style';

/** The Molten Throne - wild. Obsidian spires veined with lava, a burning seat. */
export function drawMoltenThrone(g: Graphics): void {
  dropShadow(g, 0, 60, 54, 9, 0.55);
  // Fire aura.
  g.ellipse(0, 26, 60, 40).fill({ color: rgba(PALETTE.lava, 0.16) });
  g.ellipse(0, 34, 42, 24).fill({ color: rgba(PALETTE.ember, 0.2) });

  // Flames licking the base.
  const rnd = jitter(99);
  for (let i = 0; i < 6; i++) {
    const x = -42 + i * 17 + (rnd() - 0.5) * 6;
    const h = 20 + rnd() * 22;
    const flame = flat([pt(x - 8, 52), pt(x - 10, 40), pt(x - 2, 52 - h), pt(x + 4, 40 - h * 0.4), pt(x + 9, 42), pt(x + 7, 52)]);
    g.poly([...flame]).fill(vGrad([[0, PALETTE.goldHi], [0.5, PALETTE.ember], [1, PALETTE.emberDeep]], 52 - h, 52));
    g.poly([...xform(flame, 1, 6, 0.55)]).fill({ color: 0xfff1c2, alpha: 0.9 });
  }

  const glass = vGrad([[0, 0x3c3546], [0.45, 0x241f2c], [1, 0x100c14]], -70, 40);
  // Throne back: five spires.
  part(
    g,
    flat([
      pt(-42, 30), pt(-46, -18), pt(-36, -32), pt(-30, -58), pt(-22, -36), pt(-12, -50), pt(0, -72),
      pt(12, -50), pt(22, -36), pt(30, -58), pt(36, -32), pt(46, -18), pt(42, 30),
    ]),
    glass,
  );
  // Lava veins.
  const veins: readonly [number, number, number, number, number, number][] = [
    [-28, 22, -22, -12, -27, -34],
    [0, 26, 4, -14, 0, -48],
    [28, 22, 22, -12, 27, -34],
    [-14, 4, -8, -22, -14, -40],
    [14, 4, 8, -22, 14, -40],
  ];
  for (const [x0, y0, cx, cy, x1, y1] of veins) {
    g.moveTo(x0, y0).quadraticCurveTo(cx, cy, x1, y1).stroke({ width: 3.4, color: PALETTE.emberDeep });
    g.moveTo(x0, y0).quadraticCurveTo(cx, cy, x1, y1).stroke({ width: 1.4, color: PALETTE.goldHi });
  }
  // Spire tip embers.
  for (const [x, y] of [[-30, -58], [0, -72], [30, -58]] as const) {
    g.circle(x, y, 3.4).fill({ color: PALETTE.ember });
    g.circle(x - 0.8, y - 0.8, 1.4).fill({ color: 0xfff1c2 });
  }
  // Glass sheen.
  g.moveTo(-36, 18).quadraticCurveTo(-40, -10, -32, -28).stroke({ width: 2.2, color: 0x6a6178, alpha: 0.8 });

  // Molten seat.
  part(g, flat([pt(-46, 20), pt(46, 20), pt(42, 38), pt(-42, 38)]), vGrad([[0, 0xfff1c2], [0.4, PALETTE.ember], [1, PALETTE.emberDeep]], 20, 38), 4);
  // Dripping lava.
  for (const [x, len] of [[-24, 10], [2, 15], [28, 8]] as const) {
    g.roundRect(x - 2.4, 36, 4.8, len, 2.4).fill({ color: PALETTE.ember });
    g.circle(x, 37 + len, 3).fill({ color: PALETTE.goldHi });
  }
  // Arms.
  for (const s of [-1, 1]) {
    part(g, flat([pt(s * 40, 8), pt(s * 56, 3), pt(s * 58, 40), pt(s * 44, 42)]), glass, 4);
    g.circle(s * 49, 6, 4.6).fill({ color: PALETTE.ember });
    g.circle(s * 49, 6, 4.6).stroke({ width: 2.5, color: OUTLINE });
    g.circle(s * 48, 4.8, 1.8).fill({ color: 0xfff1c2 });
  }
  // Clawed feet.
  part(g, flat([pt(-44, 40), pt(-30, 40), pt(-32, 54), pt(-46, 52)]), glass, 3.5);
  part(g, flat([pt(30, 40), pt(44, 40), pt(46, 52), pt(32, 54)]), glass, 3.5);
}

/** Dragon Egg - scatter. Obsidian-scaled egg on a gold claw stand, light leaking out. */
export function drawDragonEgg(g: Graphics): void {
  dropShadow(g, 0, 62, 44, 8, 0.55);
  // Inner-light aura.
  g.ellipse(0, 2, 52, 60).fill({ color: rgba(PALETTE.garnet, 0.2) });
  g.ellipse(0, 2, 36, 44).fill({ color: rgba(PALETTE.ember, 0.14) });

  // Egg silhouette.
  const egg: number[] = [];
  for (let i = 0; i <= 44; i++) {
    const a = (i / 44) * Math.PI * 2;
    egg.push(Math.sin(a) * 38 * (1 - 0.14 * Math.cos(a)), -Math.cos(a) * 50);
  }
  g.poly(egg).fill(vGrad([[0, 0x5c4258], [0.45, 0x2c1e2c], [1, 0x140d16]], -52, 52));
  g.poly(egg).stroke({ width: 4.5, color: OUTLINE });
  // Rim light up the left shoulder.
  g.moveTo(-26, -30).quadraticCurveTo(-16, -44, 0, -49).stroke({ width: 2.6, color: 0xd8a8c8, alpha: 0.85 });

  // Scale rows (arcs, clipped to the egg by hand-fitting widths).
  const rnd = jitter(7);
  for (let row = 0; row < 6; row++) {
    const y = -34 + row * 14;
    const halfW = 34 * Math.sqrt(Math.max(0.08, 1 - (y / 50) ** 2));
    for (let x = -halfW + (row % 2 ? 7 : 0); x < halfW - 4; x += 14) {
      g.moveTo(x - 5, y).quadraticCurveTo(x, y + 8, x + 5, y).stroke({ width: 2, color: OUTLINE, alpha: 0.6 });
      if (rnd() > 0.72) g.moveTo(x - 4, y + 1).quadraticCurveTo(x, y + 6, x + 4, y + 1).stroke({ width: 1.2, color: PALETTE.garnet, alpha: 0.7 });
    }
  }

  // Cracks leaking light.
  const cracks: readonly (readonly number[])[] = [
    [-8, -26, -2, -12, -10, 2, -4, 16],
    [12, -8, 6, 4, 14, 16, 8, 30],
  ];
  for (const c of cracks) {
    for (const [w, col, al] of [[4.6, PALETTE.ember, 1], [1.8, 0xfff1c2, 1]] as const) {
      g.moveTo(c[0] ?? 0, c[1] ?? 0);
      for (let i = 2; i < c.length; i += 2) g.lineTo(c[i] ?? 0, c[i + 1] ?? 0);
      g.stroke({ width: w, color: col, alpha: al });
    }
  }
  // Glow bloom at the widest crack.
  g.circle(-6, -6, 9).fill({ color: rgba(0xffd9a8, 0.25) });

  // Gold claw stand: three talons gripping the base.
  const gold = vGrad([[0, 0xffe9a8], [0.5, PALETTE.gold], [1, 0x8f5c0e]], 34, 62);
  part(g, flat([pt(-36, 60), pt(-40, 42), pt(-28, 34), pt(-22, 48), pt(-26, 60)]), gold, 3.5);
  part(g, flat([pt(36, 60), pt(40, 42), pt(28, 34), pt(22, 48), pt(26, 60)]), gold, 3.5);
  part(g, flat([pt(-6, 62), pt(-10, 46), pt(0, 38), pt(10, 46), pt(6, 62)]), gold, 3.5);
  part(g, flat([pt(-34, 56), pt(34, 56), pt(28, 66), pt(-28, 66)]), gold, 4);
  g.moveTo(-26, 59).lineTo(26, 59).stroke({ width: 1.8, color: 0xfff1c2, alpha: 0.9 });

  // Specular.
  g.ellipse(-13, -28, 5, 10).fill({ color: 0xffffff, alpha: 0.14 });
}
