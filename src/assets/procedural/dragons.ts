import type { Graphics } from 'pixi.js';
import { FillGradient } from 'pixi.js';
import { PALETTE } from '@config/palette';
import { cubic, flat, pt, ribbon, xform } from './shapes';
import type { Poly, Pt } from './shapes';

/** Draw a list of polygons as one silhouette with a rim light (top-left) and a vertical gradient body. */
function silhouette(g: Graphics, polys: readonly Poly[], top: number, bottom: number, rim: number, yMin: number, yMax: number): void {
  // Rim light: same shapes offset up-left.
  for (const p of polys) g.poly(xform(p, -2.2, -2.2)).fill({ color: rim, alpha: 0.95 });
  // Shadow: offset down-right, darker.
  for (const p of polys) g.poly(xform(p, 1.6, 1.8)).fill({ color: PALETTE.black, alpha: 0.55 });
  const grad = new FillGradient({
    type: 'linear',
    start: { x: 0, y: yMin },
    end: { x: 0, y: yMax },
    colorStops: [
      { offset: 0, color: top },
      { offset: 1, color: bottom },
    ],
    textureSpace: 'global',
  });
  for (const p of polys) g.poly(p).fill(grad);
}

function spikesAlong(p0: Pt, c0: Pt, c1: Pt, p1: Pt, ts: readonly number[], len: number, side = -1): Poly[] {
  const out: Poly[] = [];
  for (const t of ts) {
    const a = cubic(p0, c0, c1, p1, t);
    const b = cubic(p0, c0, c1, p1, Math.min(1, t + 0.02));
    let dx = b.x - a.x;
    let dy = b.y - a.y;
    const l = Math.hypot(dx, dy) || 1;
    dx /= l;
    dy /= l;
    const nx = -dy * side;
    const ny = dx * side;
    out.push(flat([pt(a.x - dx * 4, a.y - dy * 4), pt(a.x + nx * len - dx * 1, a.y + ny * len - dy * 1), pt(a.x + dx * 4, a.y + dy * 4)]));
  }
  return out;
}

/**
 * Bat wing: shoulder → wrist (leading edge), then fingers radiating from the wrist with a
 * scalloped membrane between the finger tips, closing back at the trailing root on the body.
 */
function batWing(shoulder: Pt, wrist: Pt, tips: readonly Pt[], trailing: Pt, scallop: number): Poly {
  const pts: Pt[] = [shoulder, wrist];
  for (let i = 0; i < tips.length; i++) {
    const tip = tips[i];
    if (!tip) continue;
    pts.push(tip);
    const next = tips[i + 1] ?? trailing;
    const mx = (tip.x + next.x) / 2;
    const my = (tip.y + next.y) / 2;
    const dx = wrist.x - mx;
    const dy = wrist.y - my;
    const l = Math.hypot(dx, dy) || 1;
    pts.push(pt(mx + (dx / l) * scallop, my + (dy / l) * scallop));
  }
  pts.push(trailing);
  return flat(pts);
}

/** Gold Dragon — House Vaelor. Displayed: wings spread wide, head turned left, tail curling right. */
export function drawGoldDragon(g: Graphics): void {
  const polys: Poly[] = [];
  // Wings (behind body) — bat wings, wrists up and out, fingers sweeping down.
  polys.push(batWing(pt(-8, -10), pt(-46, -40), [pt(-80, -46), pt(-78, -14), pt(-60, 14)], pt(-6, 20), 14));
  polys.push(batWing(pt(8, -10), pt(46, -40), [pt(80, -46), pt(78, -14), pt(60, 14)], pt(6, 20), 14));
  // Body.
  polys.push(ribbon({ p0: pt(0, -16), c0: pt(3, 10), p1: pt(2, 34) }, 28, 20));
  // Neck rising up-left.
  polys.push(ribbon({ p0: pt(0, -12), c0: pt(-8, -40), p1: pt(-22, -50) }, 18, 12));
  // Head (facing left), open jaw.
  polys.push(
    flat([
      pt(-12, -60), pt(-24, -66), pt(-38, -63), pt(-52, -57), pt(-62, -52), pt(-60, -48), pt(-48, -47),
      pt(-56, -40), pt(-46, -39), pt(-36, -36), pt(-26, -38), pt(-14, -46),
    ]),
  );
  // Horns sweeping back.
  polys.push(ribbon({ p0: pt(-20, -62), c0: pt(-10, -72), p1: pt(4, -76) }, 7, 2));
  polys.push(ribbon({ p0: pt(-30, -64), c0: pt(-26, -74), p1: pt(-16, -80) }, 5, 1.5));
  // Tail + spade.
  polys.push(ribbon({ p0: pt(2, 30), c0: pt(6, 58), c1: pt(46, 62), p1: pt(60, 42) }, 14, 4));
  polys.push(flat([pt(54, 48), pt(68, 32), pt(72, 50)]));
  // Legs.
  polys.push(ribbon({ p0: pt(-6, 30), c0: pt(-14, 42), p1: pt(-16, 54) }, 11, 7));
  polys.push(flat([pt(-24, 56), pt(-8, 56), pt(-12, 50), pt(-22, 50)]));
  polys.push(ribbon({ p0: pt(8, 30), c0: pt(16, 42), p1: pt(18, 54) }, 11, 7));
  polys.push(flat([pt(10, 56), pt(26, 56), pt(24, 50), pt(12, 50)]));

  silhouette(g, polys, PALETTE.goldHi, PALETTE.goldDeep, 0xfff1c2, -80, 60);
  // Wing bones (darker lines from the wrist to the finger tips), belly plates, eye.
  for (const s of [-1, 1]) {
    for (const tip of [pt(80, -46), pt(78, -14), pt(60, 14)]) {
      g.moveTo(s * 46, -40).lineTo(s * tip.x, tip.y).stroke({ width: 1.6, color: PALETTE.goldDeep, alpha: 0.55 });
    }
  }
  g.moveTo(-4, -2).quadraticCurveTo(12, 14, 4, 30).stroke({ width: 2, color: PALETTE.goldDeep, alpha: 0.7 });
  g.circle(-40, -54, 2.4).fill({ color: PALETTE.ember });
  g.circle(-40, -54, 1).fill({ color: PALETTE.white });
}

/** Ash Dragon — House Cindrath. Serpentine, coiled in an S, smouldering. */
export function drawAshDragon(g: Graphics): void {
  const p0 = pt(-64, 40);
  const c0 = pt(-70, -50);
  const c1 = pt(44, 64);
  const p1 = pt(50, -30);
  const polys: Poly[] = [];
  polys.push(ribbon({ p0, c0, c1, p1 }, 4, 22, 28, (t) => Math.sqrt(t)));
  // Dorsal spines.
  polys.push(...spikesAlong(p0, c0, c1, p1, [0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8], 11, -1));
  // Folded wing nubs mid-body.
  polys.push(flat([pt(-6, 2), pt(10, -40), pt(22, -10), pt(18, 10)]));
  polys.push(flat([pt(-18, 10), pt(-14, -28), pt(0, -6)]));
  // Head (facing right), heavy brow, open maw.
  polys.push(
    flat([
      pt(36, -46), pt(50, -54), pt(64, -50), pt(76, -43), pt(82, -35), pt(72, -31), pt(60, -32),
      pt(76, -22), pt(62, -19), pt(50, -20), pt(40, -26), pt(34, -36),
    ]),
  );
  polys.push(ribbon({ p0: pt(44, -52), c0: pt(34, -62), p1: pt(22, -70) }, 7, 2));
  polys.push(ribbon({ p0: pt(54, -54), c0: pt(52, -66), p1: pt(44, -76) }, 5, 1.5));
  // Tail spade.
  polys.push(flat([pt(-62, 44), pt(-74, 36), pt(-72, 52)]));

  silhouette(g, polys, 0xa7a3ad, 0x4d4955, 0xd8d4de, -72, 60);
  // Ember cracks along the body.
  const cracks: [number, number][] = [
    [0.35, 0.41],
    [0.5, 0.55],
    [0.62, 0.68],
  ];
  for (const [a, b] of cracks) {
    const s = cubic(p0, c0, c1, p1, a);
    const e = cubic(p0, c0, c1, p1, b);
    g.moveTo(s.x, s.y).lineTo((s.x + e.x) / 2 + 3, (s.y + e.y) / 2 - 2).lineTo(e.x, e.y).stroke({ width: 2, color: PALETTE.ember, alpha: 0.9 });
  }
  g.circle(58, -44, 2.6).fill({ color: PALETTE.ember });
  g.circle(58, -44, 1).fill({ color: PALETTE.white });
  // Smoke wisps from the maw.
  g.moveTo(80, -28).quadraticCurveTo(90, -38, 84, -50).stroke({ width: 1.5, color: PALETTE.ash, alpha: 0.5 });
}

/**
 * Flyby dragon — side view, mid-flap, streaming right. Used by the buy-bonus cinematic,
 * baked large and tinted per tier. Box ≈ 220×140 centred on (0,0).
 */
export function drawFlybyDragon(g: Graphics): void {
  const polys: Poly[] = [];
  // Far wing (down-stroke, behind the body).
  polys.push(batWing(pt(-10, 2), pt(-2, 52), [pt(40, 66), pt(56, 44), pt(52, 22)], pt(24, 6), 10));
  // Body: long horizontal taper, head right, tail streaming left.
  polys.push(ribbon({ p0: pt(-96, 26), c0: pt(-40, 2), c1: pt(20, 14), p1: pt(66, -2) }, 5, 26, 24, (t) => t * t * 0.2 + t * 0.8));
  // Tail spade.
  polys.push(flat([pt(-94, 32), pt(-108, 20), pt(-104, 40)]));
  // Head (facing right), open jaw.
  polys.push(
    flat([
      pt(58, -14), pt(72, -20), pt(86, -16), pt(98, -9), pt(102, -2), pt(92, 1), pt(80, 0),
      pt(94, 9), pt(80, 12), pt(68, 10), pt(58, 4),
    ]),
  );
  polys.push(ribbon({ p0: pt(64, -18), c0: pt(56, -30), p1: pt(44, -38) }, 6, 2));
  // Near wing (up-stroke, big).
  polys.push(batWing(pt(4, -6), pt(28, -66), [pt(84, -76), pt(96, -46), pt(84, -18)], pt(46, -2), 12));
  // Legs tucked.
  polys.push(flat([pt(6, 18), pt(22, 24), pt(14, 34), pt(0, 30)]));
  polys.push(flat([pt(-14, 20), pt(0, 26), pt(-8, 34), pt(-22, 30)]));

  silhouette(g, polys, PALETTE.goldHi, PALETTE.goldDeep, 0xfff1c2, -78, 66);
  for (const tip of [pt(84, -76), pt(96, -46), pt(84, -18)]) {
    g.moveTo(28, -66).lineTo(tip.x, tip.y).stroke({ width: 1.6, color: PALETTE.goldDeep, alpha: 0.55 });
  }
  g.circle(78, -12, 2.6).fill({ color: PALETTE.ember });
  g.circle(78, -12, 1.1).fill({ color: PALETTE.white });
}

/** Emerald Dragon — House Myrrowen. In profile, stalking left, wing folded back, tail curled. */
export function drawEmeraldDragon(g: Graphics): void {
  const polys: Poly[] = [];
  // Wing folded back (behind): wrist up, fingers sweeping back over the tail.
  polys.push(batWing(pt(-6, 4), pt(14, -56), [pt(52, -64), pt(64, -38), pt(58, -8)], pt(30, 12), 12));
  // Body.
  polys.push(ribbon({ p0: pt(-24, 18), c0: pt(4, 24), p1: pt(32, 18) }, 30, 24));
  // Neck.
  polys.push(ribbon({ p0: pt(-20, 10), c0: pt(-36, -6), p1: pt(-44, -32) }, 18, 11));
  // Head facing left.
  polys.push(
    flat([
      pt(-36, -44), pt(-46, -50), pt(-58, -46), pt(-70, -40), pt(-74, -34), pt(-64, -31), pt(-54, -31),
      pt(-64, -23), pt(-52, -23), pt(-42, -25), pt(-36, -30),
    ]),
  );
  // Crest horns.
  polys.push(ribbon({ p0: pt(-42, -48), c0: pt(-32, -58), p1: pt(-18, -62) }, 6, 2));
  polys.push(ribbon({ p0: pt(-48, -50), c0: pt(-44, -60), p1: pt(-36, -68) }, 5, 1.5));
  // Tail curling right & up.
  polys.push(ribbon({ p0: pt(30, 22), c0: pt(72, 36), c1: pt(76, -4), p1: pt(52, -8) }, 12, 3));
  polys.push(flat([pt(50, -4), pt(44, -16), pt(58, -14)]));
  // Legs.
  polys.push(ribbon({ p0: pt(-14, 26), c0: pt(-22, 40), p1: pt(-20, 54) }, 11, 7));
  polys.push(flat([pt(-28, 56), pt(-12, 56), pt(-14, 50), pt(-26, 50)]));
  polys.push(ribbon({ p0: pt(22, 26), c0: pt(28, 40), p1: pt(26, 54) }, 11, 7));
  polys.push(flat([pt(18, 56), pt(34, 56), pt(32, 50), pt(20, 50)]));
  polys.push(ribbon({ p0: pt(2, 28), c0: pt(0, 40), p1: pt(4, 54) }, 9, 6));

  silhouette(g, polys, PALETTE.emeraldHi, PALETTE.emeraldDeep, 0xd6ffe9, -68, 60);
  // Wing bones, gold accent on the leading edge, eye.
  for (const tip of [pt(52, -64), pt(64, -38), pt(58, -8)]) {
    g.moveTo(14, -56).lineTo(tip.x, tip.y).stroke({ width: 1.6, color: PALETTE.emeraldDeep, alpha: 0.7 });
  }
  g.moveTo(-6, 4).lineTo(14, -56).stroke({ width: 1.5, color: PALETTE.gold, alpha: 0.6 });
  g.circle(-54, -40, 2.4).fill({ color: PALETTE.gold });
  g.circle(-54, -40, 1).fill({ color: PALETTE.white });
}
