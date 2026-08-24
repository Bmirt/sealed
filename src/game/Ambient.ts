import { Container, Rectangle, Sprite } from 'pixi.js';
import type { Renderer, Texture, Ticker } from 'pixi.js';
import { Graphics } from 'pixi.js';
import { drawFlybyDragon } from '@/assets/procedural/dragons';
import type { GameScene } from './GameScene';
import type { ParticleSystem } from './Particles';
import { PerfGovernor } from './perf';

/** Views nudge the ambience (ember intensity) through this bus, mirroring the audio bus. */
export const fxBus: { ambient: AmbientLife | null } = { ambient: null };

/**
 * Ambient life — the slot must never sit perfectly still:
 *  - embers drifting up from the bottom of the screen, always
 *  - firelight flicker on the backdrop's lava glow and the reel frame
 *  - a distant dragon crossing the sky every half minute or so
 * All object-pooled / allocation-free per frame; a rolling-FPS governor sheds ambience first.
 */
export class AmbientLife {
  private readonly scene: GameScene;
  private readonly particles: ParticleSystem;
  readonly governor = new PerfGovernor();
  private readonly skyDragon: Sprite;
  private dragonT = -1; // -1 = grounded
  private nextFlight = 12; // seconds until the next pass
  private flightSeed = 2718;
  private time = 0;
  private emberCarry = 0;
  private intensity = 1;

  constructor(scene: GameScene, particles: ParticleSystem, renderer: Renderer) {
    this.scene = scene;
    this.particles = particles;
    this.skyDragon = new Sprite(bakeSilhouette(renderer));
    this.skyDragon.anchor.set(0.5);
    this.skyDragon.visible = false;
    this.skyDragon.tint = 0x14090c;
    this.skyDragon.alpha = 0.85;
    scene.backdrop.addChild(this.skyDragon);
    scene.app.ticker.add(this.tick);
  }

  /** Turn the heat up during anticipation / features. */
  setIntensity(v: number): void {
    this.intensity = v;
  }

  private rand(): number {
    let s = this.flightSeed;
    s ^= s << 13;
    s >>>= 0;
    s ^= s >>> 17;
    s ^= s << 5;
    s >>>= 0;
    this.flightSeed = s;
    return s / 4294967296;
  }

  private readonly tick = (ticker: Ticker): void => {
    const dt = Math.min(0.05, ticker.deltaMS / 1000);
    this.time += dt;
    const quality = this.governor.update(ticker.deltaMS);

    // --- embers (the particle layer lives in the design-space overlay) ---
    // Budget: ~26 spawns/s at full quality, scaled by intensity and the governor.
    this.emberCarry += dt * 26 * this.intensity * this.governor.emberScale();
    if (this.emberCarry >= 1) {
      const n = Math.floor(this.emberCarry);
      this.emberCarry -= n;
      const d = this.scene.layout.orientation === 'landscape' ? { w: 1600, h: 900 } : { w: 900, h: 1600 };
      this.particles.drift(0, d.h + 16, d.w, 34, n);
    }

    // --- firelight flicker on the lava glow ---
    if (quality !== 'minimal') {
      const bg = this.scene.background;
      const f = 0.86 + 0.1 * Math.sin(this.time * 2.1) + 0.05 * Math.sin(this.time * 7.7 + 1.3) + 0.03 * Math.sin(this.time * 13.9);
      bg.lavaGlow.alpha = f;
    }

    // --- distant dragon pass ---
    if (quality === 'full') {
      if (this.dragonT < 0) {
        this.nextFlight -= dt;
        if (this.nextFlight <= 0) {
          this.dragonT = 0;
          this.skyDragon.visible = true;
          this.skyDragon.scale.set(0.16 + this.rand() * 0.1);
          this.flightY = 90 + this.rand() * 160;
          this.flightDir = this.rand() > 0.4 ? 1 : -1;
          this.flightSpeed = 0.028 + this.rand() * 0.02;
        }
      } else {
        this.dragonT += dt * this.flightSpeed;
        const bg = this.scene.background;
        const x = this.flightDir > 0 ? this.dragonT * (bg.width + 400) - 200 : bg.width + 200 - this.dragonT * (bg.width + 400);
        this.skyDragon.scale.x = Math.abs(this.skyDragon.scale.y) * this.flightDir;
        // Track the backdrop's transform so the sprite sits in sky-space.
        const s = this.scene.backdropScale;
        this.skyDragon.position.set(bg.root.x + x * s, bg.root.y + (this.flightY + Math.sin(this.dragonT * 14) * 16) * s);
        if (this.dragonT >= 1) {
          this.dragonT = -1;
          this.skyDragon.visible = false;
          this.nextFlight = 18 + this.rand() * 26;
        }
      }
    } else if (this.dragonT >= 0) {
      this.dragonT = -1;
      this.skyDragon.visible = false;
      this.nextFlight = 10;
    }
  };

  private flightY = 140;
  private flightDir = 1;
  private flightSpeed = 0.03;

  destroy(): void {
    this.scene.app.ticker.remove(this.tick);
    this.skyDragon.destroy();
  }
}

function bakeSilhouette(renderer: Renderer): Texture {
  const g = new Graphics();
  drawFlybyDragon(g);
  g.position.set(115, 80);
  const wrap = new Container();
  wrap.addChild(g);
  const tex = renderer.generateTexture({ target: wrap, frame: new Rectangle(0, 0, 230, 160), resolution: 1 });
  wrap.destroy({ children: true });
  return tex;
}
