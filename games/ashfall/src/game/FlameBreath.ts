import { Container, Sprite } from 'pixi.js';
import type { ElderDragonKit } from '@/assets/procedural/elderDragon';

type Puff = { s: Sprite; vx: number; vy: number; age: number; life: number; size: number; alive: boolean };

const FIRE_COLORS: readonly [number, number][] = [
  [0, 0xfff6d6],
  [0.12, 0xffe08a],
  [0.32, 0xffa233],
  [0.55, 0xff5a14],
  [0.8, 0xb8240a],
  [1, 0x5a1206],
];

function lerpColor(a: number, b: number, t: number): number {
  const ar = (a >> 16) & 255, ag = (a >> 8) & 255, ab = a & 255;
  const br = (b >> 16) & 255, bg = (b >> 8) & 255, bb = b & 255;
  return (Math.round(ar + (br - ar) * t) << 16) | (Math.round(ag + (bg - ag) * t) << 8) | Math.round(ab + (bb - ab) * t);
}

function fireColor(t: number): number {
  let prev: readonly [number, number] = [0, 0xfff6d6];
  for (const stop of FIRE_COLORS) {
    if (t <= stop[0] && stop[0] > prev[0]) return lerpColor(prev[1], stop[1], (t - prev[0]) / (stop[0] - prev[0]));
    prev = stop;
  }
  return prev[1];
}

/**
 * Dragon fire: a pooled stream of additive flame puffs (white-hot core → gold → ember → deep red)
 * that slow, swell and rise as they burn, over a layer of dark smoke. Nothing allocates after
 * construction. Randomness comes from the injected generator so a cinematic stays reproducible.
 */
export class FlameBreath {
  readonly view = new Container();
  private readonly smokeLayer = new Container();
  private readonly fireLayer = new Container();
  private readonly fire: Puff[] = [];
  private readonly smoke: Puff[] = [];
  private carry = 0;

  constructor(kit: ElderDragonKit, private readonly rng: () => number, fireCount = 260, smokeCount = 90) {
    this.view.addChild(this.smokeLayer, this.fireLayer);
    const make = (layer: Container, tex: ElderDragonKit['flame'], add: boolean, into: Puff[], n: number): void => {
      for (let i = 0; i < n; i++) {
        const s = new Sprite(tex);
        s.anchor.set(0.5);
        s.visible = false;
        if (add) s.blendMode = 'add';
        layer.addChild(s);
        into.push({ s, vx: 0, vy: 0, age: 0, life: 1, size: 1, alive: false });
      }
    };
    make(this.fireLayer, kit.flame, true, this.fire, fireCount);
    make(this.smokeLayer, kit.smoke, false, this.smoke, smokeCount);
  }

  /** Emit for `dt` seconds from (x, y) along `angle` (radians) at `rate` puffs per second. */
  emit(x: number, y: number, angle: number, dt: number, rate = 240, speed = 1150): void {
    this.carry += rate * dt;
    while (this.carry >= 1) {
      this.carry -= 1;
      const a = angle + (this.rng() - 0.5) * 0.24;
      const v = speed * (0.8 + this.rng() * 0.4);
      this.spawn(this.fire, x + (this.rng() - 0.5) * 8, y + (this.rng() - 0.5) * 8, Math.cos(a) * v, Math.sin(a) * v, 0.42 + this.rng() * 0.3, 0.32 + this.rng() * 0.2);
      if (this.rng() < 0.28) {
        const sa = angle + (this.rng() - 0.5) * 0.4;
        const sv = speed * 0.38;
        this.spawn(this.smoke, x, y, Math.cos(sa) * sv, Math.sin(sa) * sv, 1.1 + this.rng() * 0.6, 0.6 + this.rng() * 0.4);
      }
    }
  }

  /** A few wisps from the nostrils after the breath. */
  wisp(x: number, y: number): void {
    this.spawn(this.smoke, x, y, 30 + this.rng() * 40, -60 - this.rng() * 50, 1.0, 0.35);
  }

  private spawn(pool: Puff[], x: number, y: number, vx: number, vy: number, life: number, size: number): void {
    const p = pool.find((q) => !q.alive);
    if (!p) return;
    p.alive = true;
    p.age = 0;
    p.life = life;
    p.size = size;
    p.vx = vx;
    p.vy = vy;
    p.s.position.set(x, y);
    p.s.rotation = this.rng() * Math.PI * 2;
    p.s.visible = true;
  }

  update(dt: number): void {
    const drag = Math.exp(-2.6 * dt);
    for (const p of this.fire) {
      if (!p.alive) continue;
      p.age += dt;
      const t = p.age / p.life;
      if (t >= 1) {
        p.alive = false;
        p.s.visible = false;
        continue;
      }
      p.vx *= drag;
      p.vy = p.vy * drag - 260 * dt; // hot gas rises
      p.s.x += p.vx * dt;
      p.s.y += p.vy * dt;
      p.s.rotation = Math.atan2(p.vy, p.vx);
      p.s.scale.set(p.size * (0.6 + t * 3.4), p.size * (0.5 + t * 2.6));
      p.s.tint = fireColor(t);
      p.s.alpha = t < 0.7 ? 1 : 1 - (t - 0.7) / 0.3;
    }
    const sdrag = Math.exp(-1.2 * dt);
    for (const p of this.smoke) {
      if (!p.alive) continue;
      p.age += dt;
      const t = p.age / p.life;
      if (t >= 1) {
        p.alive = false;
        p.s.visible = false;
        continue;
      }
      p.vx *= sdrag;
      p.vy = p.vy * sdrag - 70 * dt;
      p.s.x += p.vx * dt;
      p.s.y += p.vy * dt;
      p.s.scale.set(p.size * (0.8 + t * 2.6));
      p.s.tint = 0x2a1812;
      p.s.alpha = 0.5 * Math.sin(Math.PI * Math.min(1, t * 1.3));
    }
  }

  clear(): void {
    this.carry = 0;
    for (const p of [...this.fire, ...this.smoke]) {
      p.alive = false;
      p.s.visible = false;
    }
  }

  get active(): number {
    return this.fire.reduce((n, p) => n + (p.alive ? 1 : 0), 0);
  }
}
