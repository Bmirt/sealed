import type { Graphics } from 'pixi.js';
import { PALETTE, rgba } from '@config/palette';
import { flat, pt, ribbon, xform } from './shapes';
import type { Poly } from './shapes';
import { OUTLINE, dropShadow, part, vGrad } from './style';

/**
 * Low-pay symbols: sigils carved into stone plates. Distinct by SILHOUETTE twice over —
 * the sigil itself and the plate it is cut into (shard / shield / medallion / diamond).
 * A faint colour wash tints each stone, but shape stays the primary read.
 */

function plate(g: Graphics, shape: Poly, wash: number): void {
  dropShadow(g, 0, 58, 48, 9, 0.45);
  part(g, shape, vGrad([[0, 0x4e4a58], [0.4, 0x35323e], [1, 0x1c1a22]], -60, 60));
  // Bevel: lit top-left run, shaded bottom-right run.
  g.poly([...xform(shape, 0, 0, 0.93)]).stroke({ width: 2.2, color: 0x6e6a7c, alpha: 0.65 });
  // Recessed field.
  g.poly([...xform(shape, 0, 1, 0.82)]).fill({ color: 0x16141b });
  g.poly([...xform(shape, 0, 1, 0.82)]).fill({ color: rgba(wash, 0.1) });
  g.poly([...xform(shape, 0, 1, 0.82)]).stroke({ width: 1.6, color: 0x000000, alpha: 0.7 });
}

/** Recessed carving: dark edge up-left, lit edge down-right, ash face with a wash. */
function carve(g: Graphics, polys: readonly Poly[], wash: number): void {
  for (const p of polys) g.poly([...xform(p, 1.8, 1.8)]).fill({ color: 0xc4c0cc, alpha: 0.5 });
  for (const p of polys) g.poly([...xform(p, -1.8, -1.8)]).fill({ color: 0x000000, alpha: 0.85 });
  for (const p of polys) {
    g.poly([...p]).fill({ color: PALETTE.ash });
    g.poly([...p]).fill({ color: rgba(wash, 0.28) });
  }
}

const SHARD: Poly = flat([pt(0, -62), pt(38, -34), pt(30, 52), pt(0, 62), pt(-30, 52), pt(-38, -34)]);
const SHIELD: Poly = flat([pt(-42, -52), pt(42, -52), pt(44, 6), pt(24, 44), pt(0, 60), pt(-24, 44), pt(-44, 6)]);
const DIAMOND: Poly = flat([pt(0, -62), pt(44, -10), pt(34, 34), pt(0, 62), pt(-34, 34), pt(-44, -10)]);

function medallion(g: Graphics, wash: number): void {
  dropShadow(g, 0, 58, 48, 9, 0.45);
  g.circle(0, 0, 56).fill(vGrad([[0, 0x4e4a58], [0.4, 0x35323e], [1, 0x1c1a22]], -56, 56));
  g.circle(0, 0, 56).stroke({ width: 4.5, color: OUTLINE });
  g.circle(0, 0, 51).stroke({ width: 2.2, color: 0x6e6a7c, alpha: 0.65 });
  g.circle(0, 1, 45).fill({ color: 0x16141b });
  g.circle(0, 1, 45).fill({ color: rgba(wash, 0.1) });
  g.circle(0, 1, 45).stroke({ width: 1.6, color: 0x000000, alpha: 0.7 });
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * Math.PI * 2 + Math.PI / 12;
    g.moveTo(Math.cos(a) * 47, Math.sin(a) * 47).lineTo(Math.cos(a) * 52, Math.sin(a) * 52).stroke({ width: 2, color: 0x6e6a7c, alpha: 0.5 });
  }
}

/** Flame Sigil — a fire tongue carved into a pointed shard. */
export function drawFlameSigil(g: Graphics): void {
  plate(g, SHARD, PALETTE.ember);
  const outer = flat([
    pt(0, -36), pt(8, -22), pt(5, -11), pt(15, -23), pt(22, -4), pt(19, 16), pt(10, 29), pt(0, 34), pt(-10, 29), pt(-19, 16), pt(-22, -4),
    pt(-15, -23), pt(-5, -11), pt(-8, -22),
  ]);
  carve(g, [outer], PALETTE.ember);
  const inner = flat([pt(0, -8), pt(6, 3), pt(9, 15), pt(3, 25), pt(0, 28), pt(-3, 25), pt(-9, 15), pt(-6, 3)]);
  g.poly([...inner]).fill({ color: 0x16141b });
  g.poly([...inner]).fill({ color: rgba(PALETTE.ember, 0.6) });
  g.poly([...xform(inner, 0, 3, 0.5)]).fill({ color: rgba(0xffd9a8, 0.5) });
}

/** Wolf Sigil — a howling head carved into a shield. */
export function drawWolfSigil(g: Graphics): void {
  plate(g, SHIELD, 0x7a90c8);
  const head = flat([
    pt(-2, -40), pt(10, -22), pt(22, -36), pt(25, -10), pt(18, 4), pt(7, 8), pt(-14, 13), pt(-36, 13), pt(-42, 9), pt(-27, 5), pt(-36, 0),
    pt(-42, -4), pt(-25, -6), pt(-12, -13), pt(-10, -24),
  ]);
  const jaw = flat([pt(-5, 11), pt(7, 9), pt(14, 11), pt(9, 21), pt(-4, 27), pt(-20, 25), pt(-32, 20), pt(-27, 15), pt(-12, 15)]);
  const neck = flat([pt(9, 5), pt(23, 1), pt(30, 27), pt(27, 39), pt(4, 39), pt(-5, 27)]);
  carve(g, [neck, head, jaw], 0x7a90c8);
  g.poly([4, -16, 13, -14, 8, -10]).fill({ color: 0x16141b });
}

/** Kraken Sigil — the deep one carved into a round medallion. */
export function drawKrakenSigil(g: Graphics): void {
  medallion(g, 0x3fae9e);
  const polys: Poly[] = [];
  polys.push(ribbon({ p0: pt(-16, 2), c0: pt(-36, 12), c1: pt(-41, 39), p1: pt(-23, 39) }, 11, 3));
  polys.push(ribbon({ p0: pt(-7, 5), c0: pt(-20, 27), c1: pt(-12, 46), p1: pt(2, 41) }, 11, 3));
  polys.push(ribbon({ p0: pt(5, 5), c0: pt(9, 30), c1: pt(23, 44), p1: pt(30, 35) }, 11, 3));
  polys.push(ribbon({ p0: pt(16, 2), c0: pt(36, 9), c1: pt(45, 32), p1: pt(30, 39) }, 11, 3));
  polys.push(ribbon({ p0: pt(-21, -4), c0: pt(-41, -2), c1: pt(-46, 21), p1: pt(-39, 25) }, 8, 2));
  polys.push(ribbon({ p0: pt(21, -4), c0: pt(41, -2), c1: pt(46, 21), p1: pt(39, 25) }, 8, 2));
  polys.push(flat([pt(-23, 0), pt(-27, -18), pt(-16, -36), pt(0, -43), pt(16, -36), pt(27, -18), pt(23, 0), pt(9, 7), pt(-9, 7)]));
  carve(g, polys, 0x3fae9e);
  g.circle(-10, -15, 4.5).fill({ color: 0x16141b });
  g.circle(10, -15, 4.5).fill({ color: 0x16141b });
  g.circle(-9, -16, 1.4).fill({ color: 0xc4f0e8, alpha: 0.8 });
  g.circle(11, -16, 1.4).fill({ color: 0xc4f0e8, alpha: 0.8 });
}

/** Rose Sigil — the ash rose carved into a diamond plate. */
export function drawRoseSigil(g: Graphics): void {
  plate(g, DIAMOND, 0xc86a86);
  const polys: Poly[] = [];
  polys.push(flat([pt(-5, 18), pt(-26, 23), pt(-38, 39), pt(-17, 37), pt(-3, 27)]));
  polys.push(flat([pt(5, 18), pt(26, 23), pt(38, 39), pt(17, 37), pt(3, 27)]));
  polys.push(ribbon({ p0: pt(0, 14), c0: pt(2, 28), p1: pt(0, 42) }, 5, 3.5));
  for (let i = 0; i < 5; i++) {
    const a = -Math.PI / 2 + (i * Math.PI * 2) / 5;
    const cx = Math.cos(a) * 16;
    const cy = Math.sin(a) * 16 - 6;
    const px = Math.cos(a);
    const py = Math.sin(a);
    const nx = -py;
    const ny = px;
    polys.push(
      flat([
        pt(cx - px * 9, cy - py * 9),
        pt(cx + nx * 14 - px * 2, cy + ny * 14 - py * 2),
        pt(cx + nx * 10 + px * 12, cy + ny * 10 + py * 12),
        pt(cx + px * 17, cy + py * 17),
        pt(cx - nx * 10 + px * 12, cy - ny * 10 + py * 12),
        pt(cx - nx * 14 - px * 2, cy - ny * 14 - py * 2),
      ]),
    );
  }
  carve(g, polys, 0xc86a86);
  g.circle(0, -6, 10).fill({ color: 0x16141b });
  g.circle(0, -6, 10).fill({ color: rgba(0xc86a86, 0.25) });
  g.moveTo(0, -6);
  for (let t = 0; t < Math.PI * 3.6; t += 0.22) {
    const r = 1 + t * 0.8;
    g.lineTo(Math.cos(t) * r, -6 + Math.sin(t) * r);
  }
  g.stroke({ width: 1.6, color: PALETTE.ash, alpha: 0.9 });
}
