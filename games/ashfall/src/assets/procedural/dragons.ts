import type { FillGradient, Graphics } from 'pixi.js';
import { PALETTE } from '@config/palette';
import { cubic, flat, pt, ribbon } from './shapes';
import type { Poly, Pt } from './shapes';
import { OUTLINE, dropShadow, part, vGrad } from './style';

/**
 * The three house dragons - head emblems in profile, facing left.
 * One parameterised painter so all three share the same craft level; each house differs in
 * silhouette (horns / broken horn + smoke / crest fins), snout and palette. Bold outline,
 * layered gradients, rim light, baked shadow - no stone tile, the emblem floats.
 */

interface HouseStyle {
  readonly body: readonly (readonly [number, number])[]; // gradient stops
  readonly bodyDark: number;
  readonly hornLight: number;
  readonly hornDark: number;
  readonly rim: number;
  readonly eye: number;
}

const GOLD: HouseStyle = {
  body: [
    [0, 0xffe9a8],
    [0.45, 0xf2b134],
    [1, 0x8f5c0e],
  ],
  bodyDark: 0x9c6410,
  hornLight: 0xb08a54,
  hornDark: 0x5c421e,
  rim: 0xfff6d8,
  eye: PALETTE.ember,
};

const ASH: HouseStyle = {
  body: [
    [0, 0xd8d3e0],
    [0.45, 0x8a8690],
    [1, 0x3e3a48],
  ],
  bodyDark: 0x4a4652,
  hornLight: 0xcfc8da,
  hornDark: 0x5c5566,
  rim: 0xefeaf6,
  eye: PALETTE.ember,
};

const EMERALD: HouseStyle = {
  body: [
    [0, 0x9df2c6],
    [0.45, 0x2ec27e],
    [1, 0x0b4b31],
  ],
  bodyDark: 0x11603f,
  hornLight: 0x7af0b9,
  hornDark: 0x0e5c3c,
  rim: 0xdfffee,
  eye: PALETTE.gold,
};

// ---- shared anatomy (profile facing left, origin at emblem centre) ----

const NECK: Poly = flat([pt(18, -38), pt(62, -46), pt(70, 6), pt(60, 48), pt(16, 42)]);

const SKULL: Poly = flat([
  pt(48, -18), pt(40, -36), pt(26, -46), pt(6, -52), pt(-8, -46), pt(-20, -42), pt(-36, -39),
  pt(-56, -33), pt(-66, -25), pt(-62, -14), pt(-50, -10), pt(-36, -8), pt(-16, -3),
  pt(4, -1), pt(24, -3), pt(40, -8),
]);

const JAW: Poly = flat([
  pt(20, 3), pt(-2, 6), pt(-24, 11), pt(-46, 19), pt(-54, 28), pt(-40, 33), pt(-20, 33),
  pt(0, 30), pt(16, 22),
]);

const MOUTH: Poly = flat([pt(-52, -8), pt(-18, -2), pt(10, 2), pt(-16, 12), pt(-44, 17)]);

const TEETH_UP: readonly Poly[] = [
  flat([pt(-54, -10), pt(-48, -10), pt(-52, 1)]),
  flat([pt(-44, -8), pt(-37, -8), pt(-41, 4)]),
  flat([pt(-33, -6), pt(-26, -6), pt(-30, 6)]),
  flat([pt(-22, -4), pt(-15, -4), pt(-19, 7)]),
];

const TEETH_DOWN: readonly Poly[] = [
  flat([pt(-49, 20), pt(-42, 22), pt(-48, 11)]),
  flat([pt(-37, 24), pt(-30, 25), pt(-35, 14)]),
];

function grad(style: HouseStyle): FillGradient {
  return vGrad(style.body, -52, 48);
}

function drawHeadBase(g: Graphics, s: HouseStyle): void {
  dropShadow(g, 0, 58, 56, 10, 0.55);
  // Neck slab behind, darker.
  part(g, NECK, vGrad([[0, s.body[1]?.[1] ?? 0xffffff], [1, s.bodyDark]], -46, 48));
  // Neck scale arcs.
  for (let row = 0; row < 3; row++) {
    for (let i = 0; i < 3; i++) {
      const x = 30 + i * 13 + (row % 2) * 6;
      const y = -18 + row * 20;
      g.moveTo(x - 6, y).quadraticCurveTo(x, y + 7, x + 6, y).stroke({ width: 2, color: OUTLINE, alpha: 0.55 });
    }
  }
  // Open mouth cavity behind the jaws.
  g.poly([...MOUTH]).fill({ color: 0x4a0d18 });
  // Teeth.
  for (const t of TEETH_UP) part(g, t, 0xfff4e0, 2);
  for (const t of TEETH_DOWN) part(g, t, 0xfff4e0, 2);
  // Lower jaw, then skull over everything.
  part(g, JAW, grad(s));
  part(g, SKULL, grad(s));
  // Brow ridge + cheek line work.
  g.moveTo(-8, -46).quadraticCurveTo(-16, -40, -24, -38).stroke({ width: 2.5, color: OUTLINE, alpha: 0.7 });
  g.moveTo(24, -6).quadraticCurveTo(14, -18, 18, -32).stroke({ width: 2, color: OUTLINE, alpha: 0.45 });
  // Rim light along the skull top.
  g.moveTo(38, -34).quadraticCurveTo(20, -46, 4, -48).quadraticCurveTo(-24, -42, -54, -30).stroke({ width: 2.6, color: s.rim, alpha: 0.9 });
  // Nostril.
  g.moveTo(-56, -24).quadraticCurveTo(-50, -26, -48, -21).stroke({ width: 2.5, color: OUTLINE, alpha: 0.9 });
  // Eye: almond, iris, slit pupil, spark.
  const eye = flat([pt(-24, -33), pt(-10, -37), pt(-2, -32), pt(-11, -27)]);
  g.poly([...eye]).fill({ color: 0x1c0d10 });
  g.circle(-13, -32, 4.6).fill({ color: s.eye });
  g.poly([-14.5, -37, -12, -37, -12.5, -27, -14.8, -27]).fill({ color: 0x1c0d10 });
  g.circle(-15.5, -34.5, 1.4).fill({ color: 0xffffff, alpha: 0.95 });
  g.poly([...eye]).stroke({ width: 2, color: OUTLINE });
}

function horn(g: Graphics, s: HouseStyle, p0: Pt, c0: Pt, c1: Pt, p1: Pt, w0: number): void {
  const shape = ribbon({ p0, c0, c1, p1 }, w0, 2.5, 16);
  part(g, shape, vGrad([[0, s.hornLight], [1, s.hornDark]], p1.y, p0.y + 10), 3.5);
  // Growth ridges.
  for (const t of [0.3, 0.55, 0.78]) {
    const a = cubic(p0, c0, c1, p1, t);
    g.circle(a.x, a.y, 1.2).fill({ color: OUTLINE, alpha: 0.55 });
  }
}

/** Gold Dragon - House Vaelor. Proud crest of two great swept horns. */
export function drawGoldDragon(g: Graphics): void {
  const s = GOLD;
  horn(g, s, pt(26, -42), pt(46, -76), pt(76, -76), pt(86, -46), 15);
  horn(g, s, pt(6, -48), pt(18, -70), pt(38, -76), pt(52, -68), 10);
  drawHeadBase(g, s);
  // Chin spike + jowl plates.
  part(g, flat([pt(-8, 30), pt(2, 44), pt(8, 29)]), vGrad([[0, s.hornLight], [1, s.hornDark]], 28, 44), 3);
  g.moveTo(-30, 24).quadraticCurveTo(-16, 28, -2, 26).stroke({ width: 2, color: OUTLINE, alpha: 0.5 });
}

/** Ash Dragon - House Cindrath. A broken horn, ember-cracked hide, smoke on the breath. */
export function drawAshDragon(g: Graphics): void {
  const s = ASH;
  horn(g, s, pt(24, -42), pt(42, -72), pt(66, -80), pt(80, -70), 14);
  // Broken second horn: a chipped stub.
  part(g, flat([pt(2, -48), pt(8, -64), pt(20, -60), pt(26, -66), pt(30, -52), pt(20, -46)]), vGrad([[0, s.hornLight], [1, s.hornDark]], -66, -44), 3.5);
  drawHeadBase(g, s);
  // Ember cracks across cheek and neck.
  for (const [x0, y0, x1, y1] of [
    [8, -18, 20, -34],
    [30, 8, 44, -6],
    [40, 26, 56, 18],
  ] as const) {
    g.moveTo(x0, y0).lineTo((x0 + x1) / 2 + 3, (y0 + y1) / 2).lineTo(x1, y1).stroke({ width: 2.6, color: PALETTE.emberDeep });
    g.moveTo(x0, y0).lineTo((x0 + x1) / 2 + 3, (y0 + y1) / 2).lineTo(x1, y1).stroke({ width: 1.1, color: PALETTE.goldHi, alpha: 0.95 });
  }
  // Smoke wisps from the nostril.
  g.moveTo(-60, -30).quadraticCurveTo(-70, -42, -62, -52).quadraticCurveTo(-56, -58, -60, -66).stroke({ width: 3, color: PALETTE.ash, alpha: 0.55 });
  g.moveTo(-50, -32).quadraticCurveTo(-56, -42, -50, -50).stroke({ width: 2, color: PALETTE.ash, alpha: 0.4 });
}

/** Emerald Dragon - House Myrrowen. Sleek, crested with fins, gold-eyed night hunter. */
export function drawEmeraldDragon(g: Graphics): void {
  const s = EMERALD;
  // Crest fins over skull → neck (drawn behind).
  const fins: readonly [Pt, Pt, Pt][] = [
    [pt(-2, -48), pt(10, -78), pt(22, -48)],
    [pt(20, -44), pt(38, -74), pt(46, -42)],
    [pt(42, -40), pt(62, -64), pt(66, -34)],
  ];
  for (const [a, b, c] of fins) {
    part(g, flat([a, b, c]), vGrad([[0, 0x7af0b9], [1, 0x0b4b31]], b.y, a.y), 3.5);
    g.moveTo(a.x, a.y).lineTo(b.x, b.y).stroke({ width: 1.6, color: PALETTE.gold, alpha: 0.8 });
  }
  drawHeadBase(g, s);
  // Gold trim along the jaw + cheek fin.
  g.moveTo(-46, 19).quadraticCurveTo(-20, 28, 4, 27).stroke({ width: 2, color: PALETTE.gold, alpha: 0.75 });
  part(g, flat([pt(28, -8), pt(52, -2), pt(30, 10)]), vGrad([[0, 0x2ec27e], [1, 0x0b4b31]], -8, 10), 3);
}
