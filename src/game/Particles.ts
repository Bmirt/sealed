import { Graphics, Particle, ParticleContainer, Rectangle, Texture } from 'pixi.js';
import type { Renderer, Ticker } from 'pixi.js';
import { PALETTE } from '@config/palette';

interface Slot {
  readonly particle: Particle;
  active: boolean;
  vx: number;
  vy: number;
  ax: number;
  ay: number;
  life: number;
  maxLife: number;
  spin: number;
  baseScale: number;
  fadeIn: number;
}

export interface BurstOptions {
  readonly x: number;
  readonly y: number;
  readonly count: number;
  readonly speed: number;
  readonly spread?: number;
  readonly gravity?: number;
  readonly life?: [min: number, max: number];
  readonly scale?: [min: number, max: number];
  readonly kind?: 'spark' | 'ember';
}

/**
 * Fixed-pool particle system on a ParticleContainer. Nothing allocates after construction —
 * bursts and emitters reuse dead slots. One update per ticker frame.
 */
export class ParticleSystem {
  readonly view: ParticleContainer;
  private readonly slots: Slot[] = [];
  private readonly rng: () => number;
  private seed: number;

  constructor(renderer: Renderer, capacity = 320, seed = 12345) {
    this.seed = seed >>> 0 || 1;
    this.rng = () => {
      // xorshift — deterministic, cheap, no allocation.
      let s = this.seed;
      s ^= s << 13;
      s >>>= 0;
      s ^= s >>> 17;
      s ^= s << 5;
      s >>>= 0;
      this.seed = s;
      return s / 4294967296;
    };
    this.view = new ParticleContainer({
      dynamicProperties: { position: true, scale: true, rotation: true, color: true },
    });
    // ParticleContainer requires every particle to share ONE texture source — bake a tiny sheet.
    const { sparkTex, emberTex } = bakeSheet(renderer);
    for (let i = 0; i < capacity; i++) {
      const particle = new Particle({ texture: i % 2 === 0 ? emberTex : sparkTex, x: 0, y: 0, anchorX: 0.5, anchorY: 0.5 });
      particle.alpha = 0;
      particle.scaleX = 0;
      particle.scaleY = 0;
      this.view.addParticle(particle);
      this.slots.push({ particle, active: false, vx: 0, vy: 0, ax: 0, ay: 0, life: 0, maxLife: 1, spin: 0, baseScale: 1, fadeIn: 0 });
    }
  }

  /** Radial burst (win pops, tier celebrations). */
  burst(opts: BurstOptions): void {
    const spread = opts.spread ?? Math.PI * 2;
    const life = opts.life ?? [0.5, 1.1];
    const scale = opts.scale ?? [0.5, 1.1];
    const gravity = opts.gravity ?? 260;
    let spawned = 0;
    for (const slot of this.slots) {
      if (spawned >= opts.count) break;
      if (slot.active) continue;
      const a = -Math.PI / 2 + (this.rng() - 0.5) * spread;
      const speed = opts.speed * (0.4 + this.rng() * 0.9);
      slot.active = true;
      slot.particle.x = opts.x + (this.rng() - 0.5) * 14;
      slot.particle.y = opts.y + (this.rng() - 0.5) * 14;
      slot.vx = Math.cos(a) * speed;
      slot.vy = Math.sin(a) * speed;
      slot.ax = 0;
      slot.ay = gravity;
      slot.maxLife = life[0] + this.rng() * (life[1] - life[0]);
      slot.life = slot.maxLife;
      slot.spin = (this.rng() - 0.5) * 6;
      slot.baseScale = scale[0] + this.rng() * (scale[1] - scale[0]);
      slot.fadeIn = 0.04;
      slot.particle.rotation = this.rng() * Math.PI * 2;
      spawned++;
    }
  }

  /** Continuous drift (ambient embers) — call per frame with a spawn budget. */
  drift(x: number, y: number, w: number, upSpeed: number, count: number): void {
    let spawned = 0;
    for (const slot of this.slots) {
      if (spawned >= count) break;
      if (slot.active) continue;
      slot.active = true;
      slot.particle.x = x + this.rng() * w;
      slot.particle.y = y - this.rng() * y * 0.35; // some start higher for depth
      slot.vx = (this.rng() - 0.5) * 34;
      slot.vy = -upSpeed * (0.8 + this.rng() * 1.4);
      slot.ax = (this.rng() - 0.5) * 24;
      slot.ay = -14;
      slot.maxLife = 5 + this.rng() * 5;
      slot.life = slot.maxLife;
      slot.spin = (this.rng() - 0.5) * 1.5;
      slot.baseScale = 0.25 + this.rng() * 0.55;
      slot.fadeIn = 0.8;
      spawned++;
    }
  }

  /** Advance the simulation. Hook onto the app ticker. */
  update = (ticker: Ticker): void => {
    // ParticleContainer only re-uploads its buffers when flagged — flag every frame.
    this.view.update();
    const dt = Math.min(0.05, ticker.deltaMS / 1000);
    for (const slot of this.slots) {
      if (!slot.active) continue;
      slot.life -= dt;
      const p = slot.particle;
      if (slot.life <= 0) {
        slot.active = false;
        p.alpha = 0;
        p.scaleX = 0;
        p.scaleY = 0;
        continue;
      }
      slot.vx += slot.ax * dt;
      slot.vy += slot.ay * dt;
      p.x += slot.vx * dt;
      p.y += slot.vy * dt;
      p.rotation += slot.spin * dt;
      const t = slot.life / slot.maxLife;
      const fadeIn = Math.min(1, (slot.maxLife - slot.life) / slot.fadeIn);
      p.alpha = Math.min(fadeIn, t * t * 1.4);
      const s = slot.baseScale * (0.6 + 0.4 * t);
      p.scaleX = s;
      p.scaleY = s;
    }
  };

  get activeCount(): number {
    let n = 0;
    for (const s of this.slots) if (s.active) n++;
    return n;
  }
}

function bakeSheet(renderer: Renderer): { sparkTex: Texture; emberTex: Texture } {
  const g = new Graphics();
  // Spark at (8,8) in a 16×16 cell.
  g.poly([8, 1, 10, 6, 15, 8, 10, 10, 8, 15, 6, 10, 1, 8, 6, 6]).fill({ color: PALETTE.goldHi });
  g.circle(8, 8, 2).fill({ color: 0xffffff });
  // Ember at (24,8) in the next cell.
  g.circle(24, 8, 5).fill({ color: PALETTE.ember, alpha: 0.35 });
  g.circle(24, 8, 3).fill({ color: PALETTE.ember });
  g.circle(23.2, 7.2, 1.4).fill({ color: PALETTE.goldHi });
  const sheet = renderer.generateTexture({ target: g, frame: new Rectangle(0, 0, 32, 16), resolution: 2 });
  g.destroy();
  const sparkTex = new Texture({ source: sheet.source, frame: new Rectangle(0, 0, 16, 16) });
  const emberTex = new Texture({ source: sheet.source, frame: new Rectangle(17, 1, 14, 14) });
  return { sparkTex, emberTex };
}
