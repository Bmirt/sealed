import { Container, Graphics, MeshRope, Point, Sprite } from 'pixi.js';
import { PALETTE, rgba } from '@config/palette';
import { EYE, JAW_HINGE, MOUTH_TIP, bodyWidth } from '@/assets/procedural/elderDragon';
import type { ElderDragonKit } from '@/assets/procedural/elderDragon';
import { OUTLINE } from '@/assets/procedural/style';

const SEGMENTS = 26;
/** Rig-space length of the spine, tail tip → neck end (the body strip is stretched along it). */
const SPINE = 600;
const BONE = 0xe6d8b8;

export interface DragonPose {
  /** Seconds (drives the body wave; must be deterministic for skippable cinematics). */
  readonly time: number;
  /** Wingbeat phase, 0..1 (0 = top of the upstroke). */
  readonly flap: number;
  /** Extra head pitch in radians (+ = nose down). */
  readonly headPitch: number;
  /** Jaw opening, 0..1. */
  readonly jaw: number;
  /** Throat/chest fire glow (the inhale telegraph), 0..1. */
  readonly throat: number;
}

type V = { x: number; y: number };

/**
 * The Elder Dragon rig. Side view, facing +x, origin near the shoulders.
 *
 *  - body: a MeshRope carrying the baked scale strip along a 26-point spine; a travelling wave runs
 *    down the body with every wingbeat, the neck rises into the head and the tail trails
 *  - wings: far and near wing redrawn every frame from a small bone model (arm, wrist, four finger
 *    bones, scalloped membrane). The flap is a vertical squash through edge-on, the fingers spread
 *    on the downstroke and fold on the upstroke
 *  - head: skull + jaw on a hinge + glowing throat behind; eye glow; follows the neck, plus pitch
 *  - legs: tucked fore- and hind-legs riding their spine points
 */
export class DragonRig extends Container {
  private readonly points: Point[] = [];
  private readonly body: MeshRope;
  private readonly farWing = new Graphics();
  private readonly nearWing = new Graphics();
  private readonly head = new Container();
  private readonly jaw: Sprite;
  private readonly mouth: Sprite;
  private readonly eyeGlow: Sprite;
  private readonly mouthGlow: Sprite;
  private readonly throatGlow: Sprite;
  private readonly foreleg: Sprite;
  private readonly hindleg: Sprite;
  private readonly farForeleg: Sprite;
  private readonly farHindleg: Sprite;
  private readonly mouthPoint = new Point();

  constructor(kit: ElderDragonKit) {
    super();
    for (let i = 0; i < SEGMENTS; i++) this.points.push(new Point(0, 0));
    this.body = new MeshRope({ texture: kit.body, points: this.points });

    const sprite = (part: { texture: ElderDragonKit['glow']; anchor: [number, number] }): Sprite => {
      const s = new Sprite(part.texture);
      s.anchor.set(part.anchor[0], part.anchor[1]);
      return s;
    };
    const glow = (color: number, size: number): Sprite => {
      const s = new Sprite(kit.glow);
      s.anchor.set(0.5);
      s.tint = color;
      s.blendMode = 'add';
      s.scale.set(size);
      return s;
    };

    this.foreleg = sprite(kit.foreleg);
    this.hindleg = sprite(kit.hindleg);
    this.farForeleg = sprite(kit.foreleg);
    this.farHindleg = sprite(kit.hindleg);
    for (const s of [this.farForeleg, this.farHindleg]) s.tint = 0x6a5a60;

    this.mouth = sprite(kit.mouth);
    this.mouth.position.set(JAW_HINGE.x, JAW_HINGE.y);
    this.jaw = sprite(kit.jaw);
    this.jaw.position.set(JAW_HINGE.x, JAW_HINGE.y);
    const skull = sprite(kit.skull);
    this.eyeGlow = glow(PALETTE.gold, 0.32);
    this.eyeGlow.position.set(EYE.x, EYE.y);
    this.mouthGlow = glow(PALETTE.ember, 1.3);
    this.mouthGlow.position.set(MOUTH_TIP.x - 20, MOUTH_TIP.y + 6);
    this.head.addChild(this.mouth, this.jaw, skull, this.eyeGlow, this.mouthGlow);

    this.throatGlow = glow(PALETTE.ember, 2.4);

    this.addChild(this.farWing, this.farHindleg, this.farForeleg, this.body, this.throatGlow, this.hindleg, this.foreleg, this.nearWing, this.head);
    this.pose({ time: 0, flap: 0, headPitch: 0, jaw: 0, throat: 0 });
  }

  private spine(i: number): Point {
    const p = this.points[i];
    if (!p) throw new Error(`spine point ${i} out of range`);
    return p;
  }

  /** Where fire leaves the mouth, and which way, in this rig's parent space. */
  mouthInParent(): { x: number; y: number; angle: number } {
    this.mouthPoint.set(MOUTH_TIP.x + 6, MOUTH_TIP.y + 6);
    const p = this.parent ? this.parent.toLocal(this.mouthPoint, this.head) : this.mouthPoint;
    const sx = Math.sign(this.scale.x) || 1;
    return { x: p.x, y: p.y, angle: sx > 0 ? this.rotation + this.head.rotation : Math.PI - (this.rotation + this.head.rotation) };
  }

  /** Neck-end position in parent space (for aiming before the head is posed). */
  neckInParent(): { x: number; y: number; angle: number } {
    const n = this.spine(SEGMENTS - 1);
    const m = this.spine(SEGMENTS - 2);
    const p = this.parent ? this.parent.toLocal(n, this) : n;
    return { x: p.x, y: p.y, angle: this.rotation + Math.atan2(n.y - m.y, n.x - m.x) };
  }

  pose(o: DragonPose): void {
    // ---- spine: base S-curve + a travelling wave that grows toward the tail
    const beat = Math.sin(o.flap * Math.PI * 2);
    const lift = -10 * Math.sin(o.flap * Math.PI * 2 - 0.6); // the body rises on the downstroke
    for (let i = 0; i < SEGMENTS; i++) {
      const u = i / (SEGMENTS - 1);
      const x = -SPINE * 0.66 + SPINE * u;
      const neck = smooth(0.7, 1, u);
      const amp = 34 * Math.pow(1 - u, 1.6) + 3;
      const wave = Math.sin(u * 7.5 - o.time * 5.5 - o.flap * 2) * amp;
      const tailDroop = 26 * Math.pow(1 - u, 2.2);
      this.spine(i).set(x + neck * 22, lift + tailDroop + wave * (1 - neck) - neck * neck * 64 + beat * 3 * neck);
    }

    // ---- head follows the neck, plus pitch; jaw hinges open
    const n = this.spine(SEGMENTS - 1);
    const m = this.spine(SEGMENTS - 3);
    const neckAngle = Math.atan2(n.y - m.y, n.x - m.x);
    this.head.position.set(n.x - 6, n.y);
    this.head.rotation = neckAngle * 0.5 + 0.12 + o.headPitch;
    this.jaw.rotation = o.jaw * 0.62;
    this.mouth.rotation = o.jaw * 0.3;
    this.mouth.visible = o.jaw > 0.02;
    this.mouthGlow.alpha = o.jaw * 0.9;
    this.eyeGlow.alpha = 0.55 + o.throat * 0.45;

    // ---- throat glow rides the lower neck
    const t = this.spine(SEGMENTS - 5);
    this.throatGlow.position.set(t.x, t.y + 22);
    this.throatGlow.alpha = o.throat * 0.7;
    this.throatGlow.scale.set(1.1 + o.throat * 0.7);

    // ---- legs tucked under the chest and hips
    const at = (u: number): { p: V; a: number; w: number } => {
      const f = u * (SEGMENTS - 1);
      const i = Math.min(SEGMENTS - 2, Math.floor(f));
      const a = this.spine(i);
      const b = this.spine(i + 1);
      const k = f - i;
      return { p: { x: a.x + (b.x - a.x) * k, y: a.y + (b.y - a.y) * k }, a: Math.atan2(b.y - a.y, b.x - a.x), w: bodyWidth(0.045 + 0.955 * u) };
    };
    const chest = at(0.64);
    const hip = at(0.4);
    const sway = Math.sin(o.time * 4 + 1) * 0.06;
    this.foreleg.position.set(chest.p.x + 10, chest.p.y + chest.w * 0.28);
    this.foreleg.rotation = chest.a + sway;
    this.farForeleg.position.set(chest.p.x + 24, chest.p.y + chest.w * 0.22);
    this.farForeleg.rotation = chest.a + sway + 0.25;
    this.hindleg.position.set(hip.p.x, hip.p.y + hip.w * 0.2);
    this.hindleg.rotation = hip.a + sway * 0.7;
    this.farHindleg.position.set(hip.p.x + 16, hip.p.y + hip.w * 0.14);
    this.farHindleg.rotation = hip.a + sway * 0.7 + 0.2;

    // ---- wings
    const shoulder = at(0.62);
    const hipAnchor = at(0.34);
    this.drawWing(this.farWing, o.flap, { x: shoulder.p.x + 26, y: shoulder.p.y - shoulder.w * 0.36 }, { x: hipAnchor.p.x + 20, y: hipAnchor.p.y - hipAnchor.w * 0.3 }, shoulder.a, 0.78, true);
    this.drawWing(this.nearWing, o.flap, { x: shoulder.p.x, y: shoulder.p.y - shoulder.w * 0.22 }, { x: hipAnchor.p.x, y: hipAnchor.p.y - hipAnchor.w * 0.2 }, shoulder.a, 0.9, false);
  }

  /**
   * One wing from a bone model in "raised" pose (pointing up and back from the shoulder),
   * squashed vertically by the flap so it passes through edge-on and ends below the body.
   */
  private drawWing(g: Graphics, flap: number, s: V, hip: V, bodyAngle: number, size: number, far: boolean): void {
    // Downstroke 0 → 0.42 (fast), upstroke 0.42 → 1 (slow): squash 1 (up) → -0.62 (down) → 1.
    const down = flap < 0.42;
    const k = down ? ease(flap / 0.42) : 1 - ease((flap - 0.42) / 0.58);
    const sy = 1 - k * 1.62;
    const spread = down ? 1 : 0.78 + 0.22 * (1 - k); // fingers fold while the wing comes back up
    const sweep = -0.22 + k * 0.5; // the wing rakes forward on the downstroke

    const cos = Math.cos(bodyAngle + sweep);
    const sin = Math.sin(bodyAngle + sweep);
    const tr = (x: number, y: number, fold = 1): V => {
      const fx = x * size * fold;
      const fy = y * size * sy;
      return { x: s.x + fx * cos - fy * sin, y: s.y + fx * sin + fy * cos };
    };
    const elbow = tr(-46, -104);
    const wrist = tr(-6, -212);
    const tips: [V, V, V, V] = [tr(-64, -300, spread), tr(-152, -266, spread), tr(-226, -186, spread), tr(-262, -86, spread)];
    const knuckle = (tp: V): V => ({ x: wrist.x + (tp.x - wrist.x) * 0.55, y: wrist.y + (tp.y - wrist.y) * 0.55 });

    g.clear();
    // Membrane: leading edge, then scalloped trailing edge between finger tips, back to the flank.
    const membrane: number[] = [s.x, s.y, elbow.x, elbow.y, wrist.x, wrist.y, tips[0].x, tips[0].y];
    const scallop = (a: V, b: V): void => {
      const cx = (a.x + b.x) / 2 + (wrist.x - (a.x + b.x) / 2) * 0.28;
      const cy = (a.y + b.y) / 2 + (wrist.y - (a.y + b.y) / 2) * 0.28;
      for (let i = 1; i <= 6; i++) {
        const t = i / 6;
        const mt = 1 - t;
        membrane.push(mt * mt * a.x + 2 * mt * t * cx + t * t * b.x, mt * mt * a.y + 2 * mt * t * cy + t * t * b.y);
      }
    };
    scallop(tips[0], tips[1]);
    scallop(tips[1], tips[2]);
    scallop(tips[2], tips[3]);
    scallop(tips[3], hip);
    const underside = sy < 0; // past edge-on we see the ember-lit underside
    const fill = far ? (underside ? 0x3c0d14 : 0x2a0a10) : underside ? 0x7a1e24 : 0x4c0f19;
    g.poly(membrane).fill({ color: fill, alpha: 0.96 });
    // Veins: ember-lit branches from each knuckle into the membrane.
    if (!far) {
      const veins: [V, V][] = [[tips[0], tips[1]], [tips[1], tips[2]], [tips[2], tips[3]], [tips[3], hip]];
      for (const [tip, b] of veins) {
        const a = knuckle(tip);
        g.moveTo(a.x, a.y).quadraticCurveTo((a.x + b.x) / 2 + 6, (a.y + b.y) / 2 + 6, (a.x + b.x * 2) / 3, (a.y + b.y * 2) / 3).stroke({ width: 2, color: rgba(PALETTE.ember, underside ? 0.55 : 0.3) });
      }
    }
    g.poly(membrane).stroke({ width: far ? 3.5 : 4.5, color: OUTLINE, join: 'round' });
    // Bones: outline pass then bone pass, so each strut reads as a solid finger.
    const bones: [V, V][] = [[s, elbow], [elbow, wrist], ...tips.map((tp): [V, V] => [wrist, tp])];
    // Bones thin out and darken as the wing turns edge-on or shows its underside, so they never
    // float as bright streaks while the membrane is foreshortened.
    const edge = 0.4 + 0.6 * Math.min(1, Math.abs(sy) * 1.4);
    const boneColor = far ? 0x8e7c64 : underside ? 0xb9a47e : BONE;
    for (const [a, b] of bones) g.moveTo(a.x, a.y).lineTo(b.x, b.y).stroke({ width: (far ? 9 : 11) * edge, color: OUTLINE, cap: 'round' });
    for (const [i, [a, b]] of bones.entries()) g.moveTo(a.x, a.y).lineTo(b.x, b.y).stroke({ width: (i < 2 ? (far ? 5 : 7) : far ? 3.5 : 4.5) * edge, color: boneColor, cap: 'round' });
    // Wrist claw.
    const claw = tr(10, -236);
    g.poly([wrist.x - 5, wrist.y, wrist.x + 5, wrist.y, claw.x, claw.y]).fill({ color: boneColor }).stroke({ width: 2.5, color: OUTLINE, join: 'round' });
  }
}

function smooth(a: number, b: number, x: number): number {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
}

function ease(t: number): number {
  const c = Math.min(1, Math.max(0, t));
  return c * c * (3 - 2 * c);
}
