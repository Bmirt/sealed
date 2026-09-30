import { Container, Graphics, Rectangle } from 'pixi.js';
import type { Renderer, Texture } from 'pixi.js';
import { PALETTE, rgba } from '@config/palette';
import { pt, ribbon } from './shapes';
import type { Poly } from './shapes';
import { OUTLINE, vGrad } from './style';

/**
 * The Elder Dragon: the animated dragon of the buy-bonus cinematic (and the distant sky dragon).
 *
 * Art direction (see art/elder-dragon.md): side view facing right, the house emblem look scaled
 * up to a whole creature - bold warm-black outline, obsidian-to-garnet scales, bone-gold belly
 * plates and horns, ember glow in the seams, molten-gold rim light. Parts are painted once with
 * Graphics and baked to textures; the rig (game/DragonRig.ts) bends the body along a spine,
 * flaps per-frame-drawn wings, opens the jaw and breathes fire (game/FlameBreath.ts).
 *
 * Every part is painted around its pivot at local (0, 0), so the baked sprite's anchor is the joint.
 */

export const BODY_LENGTH = 1024; // body strip texture length (tail tip → neck end)
export const BODY_HEIGHT = 220; // strip height = rope thickness
const CY = 120; // centre line of the strip (dorsal side up, belly down)
const BODY_MAX = 128; // thickest cross-section (chest)

/** Body thickness along the strip, u = 0 tail tip … 1 neck end. */
export function bodyWidth(u: number): number {
  const s = (a: number, b: number, x: number): number => {
    const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
    return t * t * (3 - 2 * t);
  };
  return 10 + (BODY_MAX - 10) * s(0.05, 0.58, u) - 58 * s(0.74, 1, u);
}

const SCALE_DARK = 0x2a0e14;
const SCALE_MID = 0x6a1622;
const SCALE_LIGHT = 0x9e2c36;
const BELLY_HI = 0xd9a45a;
const BELLY_LO = 0x7a4a1c;
const BONE_HI = 0xf1e6cc;
const BONE_LO = 0x8c7658;

const bodyGrad = (y0: number, y1: number) =>
  vGrad([[0, SCALE_DARK], [0.4, SCALE_MID], [0.66, SCALE_LIGHT], [0.72, BELLY_HI], [1, BELLY_LO]], y0, y1);
const boneGrad = (y0: number, y1: number) => vGrad([[0, BONE_HI], [1, BONE_LO]], y0, y1);
const headGrad = (y0: number, y1: number) => vGrad([[0, SCALE_DARK], [0.5, SCALE_MID], [0.85, SCALE_LIGHT], [1, 0xa8522c]], y0, y1);

function outline(g: Graphics, poly: Poly, width = 5): void {
  g.poly(poly).stroke({ width, color: OUTLINE, join: 'round', cap: 'round' });
}

// ------------------------------------------------------------------ body strip (for the rope)

export function drawBodyStrip(g: Graphics): void {
  const L = BODY_LENGTH;
  const top: number[] = [];
  const bottom: number[] = [];
  const u0 = 0.045;
  for (let i = 0; i <= 80; i++) {
    const u = u0 + (1 - u0) * (i / 80);
    const w = bodyWidth(u);
    top.push(u * L, CY - w / 2);
    bottom.push(u * L, CY + w / 2);
  }
  const hull: Poly = [...top];
  for (let i = bottom.length - 2; i >= 0; i -= 2) hull.push(bottom[i] ?? 0, bottom[i + 1] ?? 0);

  // Tail spade (arrowhead) at the tip.
  const spade: Poly = [0, CY, 0.03 * L, CY - 26, 0.075 * L, CY - 7, 0.065 * L, CY, 0.075 * L, CY + 7, 0.03 * L, CY + 22];
  g.poly(spade).fill(boneGrad(CY - 26, CY + 22));
  outline(g, spade, 4.5);

  // Dorsal spikes (behind the hull outline so they grow out of the back).
  for (let x = 0.1 * L; x < 0.97 * L; x += 30) {
    const u = x / L;
    const w = bodyWidth(u);
    const h = 8 + 26 * (w / BODY_MAX);
    const half = 5 + 9 * (w / BODY_MAX);
    const baseY = CY - w / 2 + 4;
    const spike: Poly = [x - half, baseY, x + half, baseY, x - half * 0.9, baseY - h];
    g.poly(spike).fill(boneGrad(baseY - h, baseY));
    outline(g, spike, 3.5);
  }

  g.poly(hull).fill(bodyGrad(CY - BODY_MAX / 2, CY + BODY_MAX / 2));

  // Scale rows: small overlapping arcs over the flank.
  for (let row = 0; row < 4; row++) {
    for (let x = 0.08 * L + (row % 2) * 9; x < 0.99 * L; x += 18) {
      const u = x / L;
      const w = bodyWidth(u);
      const y = CY - w / 2 + 10 + row * (w * 0.14);
      if (y > CY + w * 0.14) continue;
      const r = 4 + 5 * (w / BODY_MAX);
      g.moveTo(x - r, y).quadraticCurveTo(x, y + r * 1.1, x + r, y).stroke({ width: 1.6, color: rgba(SCALE_LIGHT, 0.7) });
    }
  }
  // Belly plates: segmented bands across the belly.
  for (let x = 0.09 * L; x < 0.985 * L; x += 15) {
    const w = bodyWidth(x / L);
    const y0 = CY + w * 0.2;
    const y1 = CY + w / 2 - 2;
    g.moveTo(x, y0).quadraticCurveTo(x + 3, (y0 + y1) / 2, x - 1, y1).stroke({ width: 2, color: rgba(0x4a2a0e, 0.65) });
  }
  // Belly line, ember seam along the flank, gold rim along the back.
  const seam: number[] = [];
  const belly: number[] = [];
  const rim: number[] = [];
  for (let i = 4; i <= 80; i++) {
    const u = u0 + (1 - u0) * (i / 80);
    const w = bodyWidth(u);
    belly.push(u * L, CY + w * 0.2);
    seam.push(u * L, CY + w * 0.05);
    rim.push(u * L, CY - w / 2 + 3.5);
  }
  g.poly(belly, false).stroke({ width: 2.5, color: rgba(0x3a1a0a, 0.7) });
  g.poly(seam, false).stroke({ width: 2, color: rgba(PALETTE.ember, 0.35) });
  g.poly(rim, false).stroke({ width: 3, color: rgba(PALETTE.goldHi, 0.55) });
  outline(g, hull, 5);
}

// ------------------------------------------------------------------ head (pivot = neck joint)

/** Snout tip / mouth corner in skull space, used to aim and emit the fire. */
export const MOUTH_TIP = pt(192, 4);
export const JAW_HINGE = pt(38, 10);
export const EYE = pt(112, -24);

export function drawSkull(g: Graphics): void {
  // Far horn and crest first (behind the skull).
  const farHorn = ribbon({ p0: pt(52, -44), c0: pt(20, -92), c1: pt(-30, -112), p1: pt(-64, -104) }, 18, 2);
  g.poly(farHorn).fill({ color: 0x6f5e46 });
  outline(g, farHorn, 4);

  const skull: Poly = [
    -12, -40, 26, -54, 70, -52, 100, -44, 116, -36, 160, -28, 186, -20, 202, -10, 200, 0,
    170, 4, 120, 6, 70, 8, 40, 12, 10, 26, -8, 36,
  ];
  g.poly(skull).fill(headGrad(-54, 30));

  // Cheek frills: bone fins sweeping back from the jaw line.
  for (const [x, y, len] of [[34, 6, 58], [16, 16, 46], [2, 26, 34]] as const) {
    const fin: Poly = [x, y - 6, x + 10, y + 2, x - len, y + 20];
    g.poly(fin).fill(boneGrad(y - 6, y + 20));
    outline(g, fin, 3.5);
  }
  // Upper teeth.
  for (let x = 128; x <= 190; x += 12) {
    const tooth: Poly = [x - 4, 3, x + 4, 3, x, 17];
    g.poly(tooth).fill({ color: BONE_HI });
    outline(g, tooth, 2.5);
  }
  // Scale plates over the snout and a heavy brow ridge.
  for (let i = 0; i < 5; i++) {
    const x = 128 + i * 14;
    g.moveTo(x - 6, -28 + i * 2).quadraticCurveTo(x, -21 + i * 2, x + 6, -27 + i * 2).stroke({ width: 1.6, color: rgba(SCALE_LIGHT, 0.8) });
  }
  // Eye: burning gold with a slit pupil under the brow.
  g.ellipse(EYE.x, EYE.y, 14, 7.5).fill({ color: PALETTE.goldHi });
  g.ellipse(EYE.x + 2, EYE.y, 3, 6.5).fill({ color: 0x1a0606 });
  g.moveTo(EYE.x - 22, EYE.y - 8).quadraticCurveTo(EYE.x, EYE.y - 18, EYE.x + 22, EYE.y - 12).stroke({ width: 7, color: OUTLINE, cap: 'round' });
  // Nostril with an ember inside.
  g.ellipse(182, -15, 6, 3.5).fill({ color: 0x140606 });
  g.ellipse(183, -15, 2.5, 1.5).fill({ color: PALETTE.ember });
  // Rim light along the top of the head.
  g.moveTo(-8, -36).lineTo(26, -50).lineTo(70, -48).lineTo(100, -41).lineTo(160, -25).lineTo(196, -12).stroke({ width: 3, color: rgba(PALETTE.goldHi, 0.55), join: 'round' });
  outline(g, skull, 5);

  // Near horn and crest spikes (in front).
  const horn = ribbon({ p0: pt(66, -46), c0: pt(36, -104), c1: pt(-18, -130), p1: pt(-58, -124) }, 22, 2);
  g.poly(horn).fill(boneGrad(-130, -40));
  outline(g, horn, 4.5);
  for (let i = 0; i < 4; i++) {
    const t = 0.25 + i * 0.2;
    const x = 66 + (-58 - 66) * t;
    const y = -46 + (-124 + 46) * t - 10 * Math.sin(Math.PI * t);
    g.moveTo(x - 6, y + 4).lineTo(x + 6, y + 6).stroke({ width: 1.5, color: rgba(0x5a4a34, 0.8) });
  }
  for (const [x, y] of [[-4, -38], [12, -48], [-20, -24]] as const) {
    const spike: Poly = [x - 7, y + 4, x + 7, y + 2, x - 14, y - 22];
    g.poly(spike).fill(boneGrad(y - 22, y + 4));
    outline(g, spike, 3.5);
  }
}

/** Lower jaw, pivot at the hinge; opens by rotating +z (downward). */
export function drawJaw(g: Graphics): void {
  for (let x = 88; x <= 146; x += 12) {
    const tooth: Poly = [x - 4, -2, x + 4, -2, x, -15];
    g.poly(tooth).fill({ color: BONE_HI });
    outline(g, tooth, 2.5);
  }
  const jaw: Poly = [-6, -6, 150, -4, 158, 6, 128, 18, 70, 24, 20, 20, -8, 8];
  g.poly(jaw).fill(headGrad(-10, 26));
  for (const [x, len] of [[118, 22], [92, 26]] as const) {
    const spike: Poly = [x - 6, 18, x + 6, 20, x - len, 36];
    g.poly(spike).fill(boneGrad(18, 36));
    outline(g, spike, 3);
  }
  outline(g, jaw, 4.5);
}

/** The throat and tongue seen when the jaw opens: dark red, lit from inside. */
export function drawMouth(g: Graphics): void {
  const cavity: Poly = [-4, -14, 150, -14, 150, 30, 60, 44, -4, 20];
  g.poly(cavity).fill(vGrad([[0, 0x3a0808], [0.6, 0x7a140c], [1, 0xc93a0b]], -14, 44));
  g.moveTo(10, 14).quadraticCurveTo(80, 30, 136, 12).stroke({ width: 9, color: 0xb2332a, cap: 'round' });
}

// ------------------------------------------------------------------ legs (pivot = hip / shoulder)

export function drawForeleg(g: Graphics): void {
  const upper = ribbon({ p0: pt(0, 0), c0: pt(-6, 20), c1: pt(-16, 34), p1: pt(-20, 50) }, 30, 20);
  const lower = ribbon({ p0: pt(-20, 50), c0: pt(-6, 60), c1: pt(10, 66), p1: pt(26, 70) }, 18, 12);
  g.poly(upper).fill(bodyGrad(-10, 60));
  outline(g, upper, 4.5);
  g.poly(lower).fill(bodyGrad(40, 80));
  outline(g, lower, 4);
  for (const [dx, dy] of [[0, 0], [4, 7], [-2, 10]] as const) {
    const claw: Poly = [22 + dx, 66 + dy, 30 + dx, 64 + dy, 40 + dx, 78 + dy];
    g.poly(claw).fill({ color: BONE_HI });
    outline(g, claw, 2.5);
  }
}

export function drawHindleg(g: Graphics): void {
  const thigh = ribbon({ p0: pt(0, -6), c0: pt(8, 26), c1: pt(2, 48), p1: pt(-12, 60) }, 52, 26);
  const shin = ribbon({ p0: pt(-12, 60), c0: pt(-30, 70), c1: pt(-44, 76), p1: pt(-54, 84) }, 22, 14);
  const foot = ribbon({ p0: pt(-54, 84), c0: pt(-44, 96), c1: pt(-30, 100), p1: pt(-16, 102) }, 14, 8);
  for (const [poly, y0, y1] of [[thigh, -10, 70], [shin, 56, 90], [foot, 80, 106]] as const) {
    g.poly(poly).fill(bodyGrad(y0, y1));
    outline(g, poly, 4.5);
  }
  for (const [dx, dy] of [[0, 0], [5, 6], [-3, 8]] as const) {
    const claw: Poly = [-18 + dx, 98 + dy, -10 + dx, 97 + dy, -2 + dx, 110 + dy];
    g.poly(claw).fill({ color: BONE_HI });
    outline(g, claw, 2.5);
  }
}

// ------------------------------------------------------------------ light and fire textures

/** Soft radial glow (white; tinted at runtime). */
export function drawGlow(g: Graphics): void {
  // 32 faint concentric discs: a smooth falloff with no visible outer edge.
  for (let i = 32; i >= 1; i--) g.circle(0, 0, 1.6 * i).fill({ color: 0xffffff, alpha: 0.045 });
}

/** A flame puff: bright core inside a soft body, slightly teardrop so a stream reads as flow. */
export function drawFlame(g: Graphics): void {
  for (let i = 10; i >= 1; i--) g.ellipse(-i * 0.8, 0, 3.2 * i, 2.6 * i).fill({ color: 0xffffff, alpha: 0.12 });
  g.ellipse(2, 0, 7, 5).fill({ color: 0xffffff, alpha: 0.8 });
}

/** Smoke puff: soft, lumpy disc (tinted dark at runtime, normal blend). */
export function drawSmoke(g: Graphics): void {
  for (const [x, y, r] of [[0, 0, 26], [-12, -6, 18], [12, 4, 20], [4, -10, 16]] as const) {
    for (let i = 5; i >= 1; i--) g.circle(x, y, (r * i) / 5).fill({ color: 0xffffff, alpha: 0.12 });
  }
}

// ------------------------------------------------------------------ bake

export interface ElderDragonKit {
  readonly body: Texture;
  readonly skull: { texture: Texture; anchor: [number, number] };
  readonly jaw: { texture: Texture; anchor: [number, number] };
  readonly mouth: { texture: Texture; anchor: [number, number] };
  readonly foreleg: { texture: Texture; anchor: [number, number] };
  readonly hindleg: { texture: Texture; anchor: [number, number] };
  readonly glow: Texture;
  readonly flame: Texture;
  readonly smoke: Texture;
}

function bake(renderer: Renderer, paint: (g: Graphics) => void, frame?: Rectangle): { texture: Texture; anchor: [number, number] } {
  const g = new Graphics();
  paint(g);
  const b = frame ?? (() => {
    const lb = g.getLocalBounds();
    return new Rectangle(Math.floor(lb.minX) - 6, Math.floor(lb.minY) - 6, Math.ceil(lb.width) + 12, Math.ceil(lb.height) + 12);
  })();
  g.position.set(-b.x, -b.y);
  const wrap = new Container();
  wrap.addChild(g);
  const texture = renderer.generateTexture({ target: wrap, frame: new Rectangle(0, 0, b.width, b.height), resolution: 2, antialias: true });
  wrap.destroy({ children: true });
  return { texture, anchor: [-b.x / b.width, -b.y / b.height] };
}

const cache = new WeakMap<Renderer, ElderDragonKit>();

/** Paint and bake every part once per renderer (shared by the cinematic and the sky dragon). */
export function bakeElderDragon(renderer: Renderer): ElderDragonKit {
  const hit = cache.get(renderer);
  if (hit) return hit;
  const kit: ElderDragonKit = {
    body: bake(renderer, drawBodyStrip, new Rectangle(0, 0, BODY_LENGTH, BODY_HEIGHT)).texture,
    skull: bake(renderer, drawSkull),
    jaw: bake(renderer, drawJaw),
    mouth: bake(renderer, drawMouth),
    foreleg: bake(renderer, drawForeleg),
    hindleg: bake(renderer, drawHindleg),
    glow: bake(renderer, drawGlow).texture,
    flame: bake(renderer, drawFlame).texture,
    smoke: bake(renderer, drawSmoke).texture,
  };
  cache.set(renderer, kit);
  return kit;
}
