import { gsap } from 'gsap';
import { BitmapText, Container, FillGradient, Graphics, Rectangle, Sprite } from 'pixi.js';
import type { Renderer, Texture } from 'pixi.js';
import { PALETTE, rgba } from '@config/palette';
import { drawFlybyDragon } from '@/assets/procedural/dragons';
import { audioBus } from '@/audio/bus';
import { formatCents } from '@/state/money';
import type { FeatureDeps, CinematicDeps } from './AnimatedPresenter';
import type { GameScene } from './GameScene';
import { DESIGN, REELS_H, REELS_W } from './layout';
import type { ParticleSystem } from './Particles';

const FONT = 'AshfallGold';

/**
 * The Dragonfire HUD: sits exactly where the title plaque lives (the plaque hides while the
 * feature runs). Meter ×M with step pips · accumulated total · spins left.
 */
export class FeatureHudView implements FeatureDeps {
  private readonly scene: GameScene;
  private readonly root: Container;
  private readonly meterText: BitmapText;
  private readonly pips: Graphics;
  private readonly totalText: BitmapText;
  private readonly spinsText: BitmapText;
  private readonly banner: Container;
  private readonly bannerTitle: BitmapText;
  private readonly bannerSub: BitmapText;
  private bannerPop: gsap.core.Tween | null = null;
  private meter = 1;
  private perStep = 3;
  private toward = 0;

  constructor(scene: GameScene) {
    this.scene = scene;
    this.root = new Container();
    this.root.visible = false;

    const barW = REELS_W;
    const barH = 66;
    const y = -26 - barH + 4; // over the plaque position
    const bar = new Graphics();
    bar.roundRect(-6, y - 4, barW + 12, barH + 8, 12).fill({ color: rgba(PALETTE.black, 0.55) });
    bar.poly([0, y + 10, 14, y, barW - 14, y, barW, y + 10, barW, y + barH - 10, barW - 14, y + barH, 14, y + barH, 0, y + barH - 10]).fill(
      new FillGradient({
        type: 'linear',
        start: { x: 0, y: 0 },
        end: { x: 0, y: 1 },
        colorStops: [
          { offset: 0, color: 0x2c2430 },
          { offset: 1, color: 0x160f14 },
        ],
        textureSpace: 'local',
      }),
    );
    bar.poly([0, y + 10, 14, y, barW - 14, y, barW, y + 10, barW, y + barH - 10, barW - 14, y + barH, 14, y + barH, 0, y + barH - 10]).stroke({ width: 2, color: PALETTE.ember, alpha: 0.9 });
    this.root.addChild(bar);

    const label = new BitmapText({ text: 'DRAGONFIRE', style: { fontFamily: FONT, fontSize: 18 } });
    label.anchor.set(0, 0.5);
    label.position.set(26, y + barH / 2 - 16);
    label.alpha = 0.8;
    this.root.addChild(label);

    this.meterText = new BitmapText({ text: '×1', style: { fontFamily: FONT, fontSize: 34 } });
    this.meterText.anchor.set(0, 0.5);
    this.meterText.position.set(26, y + barH / 2 + 12);
    this.root.addChild(this.meterText);

    this.pips = new Graphics();
    this.root.addChild(this.pips);

    this.totalText = new BitmapText({ text: '', style: { fontFamily: FONT, fontSize: 32 } });
    this.totalText.anchor.set(0.5);
    this.totalText.position.set(barW / 2, y + barH / 2);
    this.root.addChild(this.totalText);

    this.spinsText = new BitmapText({ text: '', style: { fontFamily: FONT, fontSize: 26 } });
    this.spinsText.anchor.set(1, 0.5);
    this.spinsText.position.set(barW - 26, y + barH / 2);
    this.root.addChild(this.spinsText);

    // Banner across the reels centre.
    this.banner = new Container();
    this.banner.visible = false;
    const band = new Graphics();
    band.rect(-80, REELS_H / 2 - 96, REELS_W + 160, 192).fill(
      new FillGradient({
        type: 'linear',
        start: { x: 0, y: 0 },
        end: { x: 0, y: 1 },
        colorStops: [
          { offset: 0, color: rgba(PALETTE.black, 0) },
          { offset: 0.22, color: rgba(PALETTE.black, 0.92) },
          { offset: 0.78, color: rgba(PALETTE.black, 0.92) },
          { offset: 1, color: rgba(PALETTE.black, 0) },
        ],
        textureSpace: 'local',
      }),
    );
    this.banner.addChild(band);
    const rule = new Graphics();
    rule.moveTo(REELS_W * 0.16, REELS_H / 2 - 58).lineTo(REELS_W * 0.84, REELS_H / 2 - 58).stroke({ width: 2, color: PALETTE.gold, alpha: 0.8 });
    rule.moveTo(REELS_W * 0.16, REELS_H / 2 + 58).lineTo(REELS_W * 0.84, REELS_H / 2 + 58).stroke({ width: 2, color: PALETTE.gold, alpha: 0.8 });
    this.banner.addChild(rule);
    this.bannerTitle = new BitmapText({ text: '', style: { fontFamily: FONT, fontSize: 58 } });
    this.bannerTitle.anchor.set(0.5);
    this.bannerTitle.position.set(REELS_W / 2, REELS_H / 2 - 22);
    this.banner.addChild(this.bannerTitle);
    this.bannerSub = new BitmapText({ text: '', style: { fontFamily: FONT, fontSize: 30 } });
    this.bannerSub.anchor.set(0.5);
    this.bannerSub.position.set(REELS_W / 2, REELS_H / 2 + 28);
    this.banner.addChild(this.bannerSub);

    scene.reels.addChild(this.root);
    scene.reels.addChild(this.banner);
  }

  showHud(on: boolean): void {
    this.root.visible = on;
    this.scene.reels.plaque.visible = !on;
    if (!on) this.hideBanner();
  }

  setMeter(multiplier: number, winsTowardStep: number, winsPerStep: number): void {
    this.meter = multiplier;
    this.toward = winsTowardStep;
    this.perStep = winsPerStep;
    this.meterText.text = `×${multiplier}`;
    this.meterText.scale.set(1);
    this.stepCuePlayed = false;
    this.drawPips();
  }

  pulseMeter(progress: number): void {
    if (!this.stepCuePlayed && progress > 0) {
      this.stepCuePlayed = true;
      audioBus.engine?.play('meterStep', { rate: 1 + this.meter * 0.045 });
    }
    const s = 1 + Math.sin(Math.min(1, progress) * Math.PI) * 0.35;
    this.meterText.scale.set(s);
  }

  private stepCuePlayed = false;

  setSpinsLeft(n: number): void {
    this.spinsText.text = `SPINS LEFT ${n}`;
  }

  setTotal(cents: number): void {
    this.totalText.text = cents > 0 ? `TOTAL ${formatCents(cents)}` : '';
  }

  showBanner(title: string, sub: string): void {
    if (title.startsWith('+')) audioBus.engine?.play('retriggerArp');
    else if (title.includes('COMPLETE') || title.includes('MAX WIN')) audioBus.engine?.play('outroStinger');
    else audioBus.engine?.play('stingerIntro');
    this.bannerTitle.text = title;
    this.bannerSub.text = sub;
    this.banner.visible = true;
    this.bannerPop?.kill();
    this.banner.alpha = 0;
    this.banner.scale.set(0.94);
    this.banner.pivot.set(0, 0);
    this.bannerPop = gsap.to(this.banner, { alpha: 1, duration: 0.22, onUpdate: () => this.banner.scale.set(0.94 + 0.06 * this.banner.alpha) });
  }

  hideBanner(): void {
    this.bannerPop?.kill();
    this.bannerPop = null;
    this.banner.visible = false;
    this.banner.alpha = 1;
    this.banner.scale.set(1);
  }

  private drawPips(): void {
    const y = -26 - 66 + 4 + 33 + 12;
    this.pips.clear();
    const x0 = 26 + 96;
    for (let i = 0; i < this.perStep; i++) {
      const cx = x0 + i * 26;
      const filled = i < this.toward;
      this.pips.circle(cx, y, 8).fill({ color: filled ? PALETTE.ember : PALETTE.obsidian2 });
      this.pips.circle(cx, y, 8).stroke({ width: 2, color: filled ? PALETTE.goldHi : PALETTE.ashDark });
      if (filled) this.pips.circle(cx - 2, y - 2, 2.5).fill({ color: PALETTE.goldHi });
    }
    // Cap marker when the meter is maxed.
    if (this.meter >= 10) {
      this.pips.circle(x0 + this.perStep * 26 + 6, y, 3).fill({ color: PALETTE.goldHi });
    }
  }
}

/**
 * Buy-bonus entry cinematic: veil, dragon pass with ember trail, reel ignite flash.
 * Everything is a pure function of progress p ∈ [0,1], so skipping is exact.
 */
export class CinematicView implements CinematicDeps {
  private readonly scene: GameScene;
  private readonly particles: ParticleSystem;
  private readonly root: Container;
  private readonly veil: Graphics;
  private readonly dragon: Sprite;
  private readonly flash: Graphics;
  private lastEmber = -1;

  constructor(scene: GameScene, particles: ParticleSystem, renderer: Renderer) {
    this.scene = scene;
    this.particles = particles;
    this.root = new Container();
    this.root.visible = false;

    this.veil = new Graphics();
    this.veil.rect(-4000, -4000, 12000, 12000).fill({ color: PALETTE.black });
    this.root.addChild(this.veil);

    this.dragon = new Sprite(bakeFlyby(renderer));
    this.dragon.anchor.set(0.5);
    this.root.addChild(this.dragon);

    this.flash = new Graphics();
    this.flash.rect(-4000, -4000, 12000, 12000).fill({ color: PALETTE.ember });
    this.flash.alpha = 0;
    this.root.addChild(this.flash);

    scene.overlay.addChild(this.root);
  }

  begin(tier: 'free' | 'super'): void {
    this.root.visible = true;
    this.veil.alpha = 0;
    this.flash.alpha = 0;
    this.dragon.tint = tier === 'super' ? 0xb9b2c4 : 0xffffff;
    this.dragon.visible = false;
    this.lastEmber = -1;
    this.igniteCued = false;
    audioBus.engine?.duck(true);
    audioBus.engine?.play('roar', { rate: tier === 'super' ? 0.85 : 1 });
    this.update(0);
  }

  private igniteCued = false;

  update(p: number): void {
    const d = DESIGN[this.scene.layout.orientation];
    // Veil: in by 0.15, out after 0.9.
    this.veil.alpha = p < 0.15 ? (p / 0.15) * 0.8 : p > 0.9 ? 0.8 * (1 - (p - 0.9) / 0.1) : 0.8;
    // Dragon pass between 0.08 and 0.78.
    const fp = (p - 0.08) / 0.7;
    if (fp >= 0 && fp <= 1) {
      this.dragon.visible = true;
      const x = -260 + (d.w + 520) * fp;
      const y = d.h * 0.42 - Math.sin(fp * Math.PI) * d.h * 0.2;
      this.dragon.position.set(x, y);
      const scale = 1.1 + Math.sin(fp * Math.PI) * 1.1;
      this.dragon.scale.set(scale);
      this.dragon.rotation = Math.cos(fp * Math.PI) * -0.12;
      // Ember trail, quantised so skipping doesn't spawn a flood.
      const step = Math.floor(fp * 24);
      if (step !== this.lastEmber && step > 0) {
        this.lastEmber = step;
        this.particles.burst({ x: x - 90 * scale * 0.5, y: y + 20, count: 4, speed: 90, gravity: -30, life: [0.4, 0.9], scale: [0.3, 0.7] });
      }
    } else {
      this.dragon.visible = false;
    }
    // Ignite flash 0.8..1.
    const ip = (p - 0.8) / 0.2;
    if (ip >= 0 && !this.igniteCued) {
      this.igniteCued = true;
      audioBus.engine?.play('igniteHit');
    }
    this.flash.alpha = ip >= 0 && ip <= 1 ? Math.sin(Math.min(1, ip) * Math.PI) * 0.55 : 0;
  }

  end(): void {
    this.root.visible = false;
    this.flash.alpha = 0;
    this.veil.alpha = 0;
    this.dragon.visible = false;
    audioBus.engine?.duck(false);
  }
}

function bakeFlyby(renderer: Renderer): Texture {
  const g = new Graphics();
  drawFlybyDragon(g);
  g.position.set(230, 160);
  const wrap = new Container();
  wrap.addChild(g);
  const tex = renderer.generateTexture({ target: wrap, frame: new Rectangle(0, 0, 460, 320), resolution: 2 });
  wrap.destroy({ children: true });
  return tex;
}
