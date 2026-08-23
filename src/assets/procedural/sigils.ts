import type { Graphics } from 'pixi.js';
import { PALETTE } from '@config/palette';
import { flat, pt, ribbon, xform } from './shapes';
import type { Poly } from './shapes';

/**
 * Low-pay symbols: monochrome sigils carved into a stone medallion.
 * Recessed look: shadow edge top-left, lit edge bottom-right, flat ash face.
 * Distinct by silhouette only — no colour coding.
 */
function medallion(g: Graphics): void {
  g.circle(0, 0, 56).fill({ color: PALETTE.obsidian, alpha: 0.9 });
  g.circle(0, 0, 56).stroke({ width: 2, color: PALETTE.stoneEdge, alpha: 0.9 });
  g.circle(0, 0, 52).stroke({ width: 1, color: PALETTE.black, alpha: 0.6 });
  // Ring notches.
  for (let i = 0; i < 16; i++) {
    const a = (i / 16) * Math.PI * 2;
    g.moveTo(Math.cos(a) * 53, Math.sin(a) * 53).lineTo(Math.cos(a) * 56, Math.sin(a) * 56).stroke({ width: 1.5, color: PALETTE.ashDark, alpha: 0.8 });
  }
}

function carved(g: Graphics, polys: readonly Poly[], face = PALETTE.ash): void {
  for (const p of polys) g.poly(xform(p, 1.8, 1.8)).fill({ color: 0xb8b4c0, alpha: 0.55 });
  for (const p of polys) g.poly(xform(p, -1.8, -1.8)).fill({ color: PALETTE.black, alpha: 0.85 });
  for (const p of polys) g.poly(p).fill({ color: face });
}

/** Flame Sigil — tall, three tongues, tapering. */
export function drawFlameSigil(g: Graphics): void {
  medallion(g);
  const outer = flat([
    pt(0, -46), pt(10, -30), pt(8, -16), pt(20, -30), pt(30, -8), pt(26, 18), pt(14, 36), pt(0, 42), pt(-14, 36), pt(-26, 18), pt(-30, -8), pt(-20, -30),
    pt(-8, -16), pt(-10, -30),
  ]);
  carved(g, [outer]);
  // Inner tongue (recessed deeper).
  const inner = flat([pt(0, -14), pt(8, 0), pt(12, 16), pt(4, 30), pt(0, 34), pt(-4, 30), pt(-12, 16), pt(-8, 0)]);
  g.poly(inner).fill({ color: PALETTE.obsidian2 });
  g.poly(xform(inner, 1, 1)).stroke({ width: 1, color: 0xb8b4c0, alpha: 0.5 });
}

/** Wolf Sigil — head in profile, pointed ears, open snout. */
export function drawWolfSigil(g: Graphics): void {
  medallion(g);
  const head = flat([
    pt(-4, -44), pt(10, -24), pt(24, -40), pt(28, -12), pt(20, 4), pt(8, 8), pt(-16, 14), pt(-40, 14), pt(-46, 10), pt(-30, 6), pt(-40, 0),
    pt(-46, -4), pt(-28, -6), pt(-14, -14), pt(-12, -26),
  ]);
  // Lower jaw.
  const jaw = flat([pt(-6, 12), pt(8, 10), pt(16, 12), pt(10, 24), pt(-4, 30), pt(-22, 28), pt(-36, 22), pt(-30, 16), pt(-14, 16)]);
  // Neck / chest.
  const neck = flat([pt(10, 6), pt(26, 2), pt(34, 30), pt(30, 44), pt(4, 44), pt(-6, 30)]);
  carved(g, [neck, head, jaw]);
  // Eye (recessed).
  g.poly(flat([pt(4, -18), pt(14, -16), pt(8, -11)])).fill({ color: PALETTE.obsidian });
}

/** Kraken Sigil — domed head, six curling tentacles. */
export function drawKrakenSigil(g: Graphics): void {
  medallion(g);
  const polys: Poly[] = [];
  // Tentacles.
  polys.push(ribbon({ p0: pt(-18, 2), c0: pt(-40, 14), c1: pt(-46, 44), p1: pt(-26, 44) }, 12, 3));
  polys.push(ribbon({ p0: pt(-8, 6), c0: pt(-22, 30), c1: pt(-14, 52), p1: pt(2, 46) }, 12, 3));
  polys.push(ribbon({ p0: pt(6, 6), c0: pt(10, 34), c1: pt(26, 50), p1: pt(34, 40) }, 12, 3));
  polys.push(ribbon({ p0: pt(18, 2), c0: pt(40, 10), c1: pt(50, 36), p1: pt(34, 44) }, 12, 3));
  polys.push(ribbon({ p0: pt(-24, -4), c0: pt(-46, -2), c1: pt(-52, 24), p1: pt(-44, 28) }, 9, 2));
  polys.push(ribbon({ p0: pt(24, -4), c0: pt(46, -2), c1: pt(52, 24), p1: pt(44, 28) }, 9, 2));
  // Head dome.
  polys.push(flat([pt(-26, 0), pt(-30, -20), pt(-18, -40), pt(0, -48), pt(18, -40), pt(30, -20), pt(26, 0), pt(10, 8), pt(-10, 8)]));
  carved(g, polys);
  // Eyes.
  g.circle(-11, -16, 5).fill({ color: PALETTE.obsidian });
  g.circle(11, -16, 5).fill({ color: PALETTE.obsidian });
  g.circle(-10, -17, 1.6).fill({ color: 0xb8b4c0, alpha: 0.7 });
  g.circle(12, -17, 1.6).fill({ color: 0xb8b4c0, alpha: 0.7 });
}

/** Rose Sigil — five petals, spiral heart, two leaves. */
export function drawRoseSigil(g: Graphics): void {
  medallion(g);
  const polys: Poly[] = [];
  // Leaves.
  polys.push(flat([pt(-6, 20), pt(-30, 26), pt(-44, 44), pt(-20, 42), pt(-4, 30)]));
  polys.push(flat([pt(6, 20), pt(30, 26), pt(44, 44), pt(20, 42), pt(4, 30)]));
  // Stem.
  polys.push(ribbon({ p0: pt(0, 16), c0: pt(2, 32), p1: pt(0, 48) }, 6, 4));
  // Petals.
  for (let i = 0; i < 5; i++) {
    const a = -Math.PI / 2 + (i * Math.PI * 2) / 5;
    const cx = Math.cos(a) * 18;
    const cy = Math.sin(a) * 18 - 6;
    const px = Math.cos(a);
    const py = Math.sin(a);
    const nx = -py;
    const ny = px;
    polys.push(
      flat([
        pt(cx - px * 10, cy - py * 10),
        pt(cx + nx * 16 - px * 2, cy + ny * 16 - py * 2),
        pt(cx + nx * 12 + px * 14, cy + ny * 12 + py * 14),
        pt(cx + px * 20, cy + py * 20),
        pt(cx - nx * 12 + px * 14, cy - ny * 12 + py * 14),
        pt(cx - nx * 16 - px * 2, cy - ny * 16 - py * 2),
      ]),
    );
  }
  carved(g, polys);
  // Spiral heart (recessed lines).
  g.circle(0, -6, 12).fill({ color: PALETTE.obsidian2 });
  g.moveTo(0, -6);
  for (let t = 0; t < Math.PI * 4; t += 0.2) {
    const r = 1 + t * 0.85;
    g.lineTo(Math.cos(t) * r, -6 + Math.sin(t) * r);
  }
  g.stroke({ width: 1.6, color: PALETTE.ash, alpha: 0.9 });
}
