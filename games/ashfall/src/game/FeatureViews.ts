import { gsap } from 'gsap';
import { BitmapText, Container, FillGradient, Graphics, Point, RenderTexture, Sprite } from 'pixi.js';
import type { Renderer } from 'pixi.js';
import { PALETTE, rgba } from '@config/palette';
import { bakeElderDragon } from '@/assets/procedural/elderDragon';
import { FIXED_TIMING } from '@config/speeds';
import { audioBus } from '@/audio/bus';
import { formatCents } from '@/state/money';
import type { FeatureDeps, CinematicDeps } from './AnimatedPresenter';
import type { GameScene } from './GameScene';
import { DESIGN, REELS_H, REELS_W } from './layout';
import { DragonRig } from './DragonRig';
import { FlameBreath } from './FlameBreath';
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
 * Buy-bonus entry cinematic: the veil drops, the Elder Dragon flies in on beating wings, rears
 * back with its throat glowing, breathes a stream of fire that rakes across the reels, and climbs
 * away as the reels ignite. The dragon's pose is a pure function of progress p ∈ [0,1] (time =
 * p × duration), so skipping lands exactly on the end state; the fire is simulated from the change
 * in p and cleared on a skip.
 */
export class CinematicView implements CinematicDeps {
  private readonly scene: GameScene;
  private readonly particles: ParticleSystem;
  private readonly root: Container;
  private readonly veil: Graphics;
  private readonly dragon: DragonRig;
  private readonly flames: FlameBreath;
  private readonly reelGlow: Sprite;
  private readonly flash: Graphics;
  private readonly duration = FIXED_TIMING.feature.cinematicTime;
  private seed = 1;
  private lastP = 0;
  private lastSpark = -1;
  private igniteCued = false;
  private breathCued = false;
  private readonly tmp = new Point();

  constructor(scene: GameScene, particles: ParticleSystem, renderer: Renderer) {
    this.scene = scene;
    this.particles = particles;
    this.root = new Container();
    this.root.visible = false;

    this.veil = new Graphics();
    this.veil.rect(-4000, -4000, 12000, 12000).fill({ color: PALETTE.black });

    const kit = bakeElderDragon(renderer);
    this.dragon = new DragonRig(kit);
    this.flames = new FlameBreath(kit, () => this.rand());
    this.reelGlow = new Sprite(kit.glow);
    this.reelGlow.anchor.set(0.5);
    this.reelGlow.blendMode = 'add';
    this.reelGlow.tint = PALETTE.ember;

    this.flash = new Graphics();
    this.flash.rect(-4000, -4000, 12000, 12000).fill({ color: PALETTE.ember });
    this.flash.alpha = 0;

    this.root.addChild(this.veil, this.dragon, this.reelGlow, this.flames.view, this.flash);
    scene.overlay.addChild(this.root);
    this.prewarm(renderer);
  }

  /** Draw every piece once off screen so the first bonus buy doesn't stall on GPU uploads. */
  private prewarm(renderer: Renderer): void {
    this.root.visible = true;
    this.dragon.position.set(400, 300);
    this.dragon.pose({ time: 0.3, flap: 0.3, headPitch: 0.2, jaw: 1, throat: 1 });
    this.flames.emit(500, 300, 0.4, 0.1);
    this.flames.update(0.05);
    const target = RenderTexture.create({ width: 64, height: 64 });
    renderer.render({ container: this.root, target });
    target.destroy(true);
    this.flames.clear();
    this.root.visible = false;
  }

  private rand(): number {
    // xorshift: a fixed stream per cinematic keeps the fire identical run to run.
    let x = this.seed;
    x ^= x << 13;
    x ^= x >>> 17;
    x ^= x << 5;
    this.seed = x >>> 0;
    return this.seed / 4294967296;
  }

  begin(tier: 'free' | 'super'): void {
    this.root.visible = true;
    this.veil.alpha = 0;
    this.flash.alpha = 0;
    this.reelGlow.alpha = 0;
    this.dragon.tint = tier === 'super' ? 0xc9c2d4 : 0xffffff; // the Elder wakes ashen for the super tier
    this.dragon.visible = false;
    this.flames.clear();
    this.seed = tier === 'super' ? 0x51f7 : 0x2a17;
    this.lastP = 0;
    this.lastSpark = -1;
    this.igniteCued = false;
    this.breathCued = false;
    audioBus.engine?.duck(true);
    audioBus.engine?.play('roar', { rate: tier === 'super' ? 0.85 : 1 });
    this.update(0);
  }

  update(p: number): void {
    const d = DESIGN[this.scene.layout.orientation];
    const dp = p - this.lastP;
    this.lastP = p;
    // Veil: in by 0.15, out after 0.9.
    this.veil.alpha = p < 0.15 ? (p / 0.15) * 0.8 : p > 0.9 ? 0.8 * (1 - (p - 0.9) / 0.1) : 0.8;

    const T = p * this.duration;
    const active = p >= 0.04 && p <= 0.9;
    this.dragon.visible = active;

    // Reels in root space: the fire aims at them whatever the orientation.
    const rb = this.scene.reels.getBounds();
    this.tmp.set(rb.x, rb.y);
    const r0 = this.root.toLocal(this.tmp);
    this.tmp.set(rb.x + rb.width, rb.y + rb.height);
    const r1 = this.root.toLocal(this.tmp);
    const reels = { x: r0.x, y: r0.y, w: r1.x - r0.x, h: r1.y - r0.y };

    // Phases: fly in → inhale (0.28-0.38) → fire (0.38-0.66) → climb away.
    const inhale = band(p, 0.27, 0.38);
    const firing = p >= 0.38 && p <= 0.66;
    const fireT = clamp01((p - 0.38) / 0.28);
    const closing = band(p, 0.66, 0.71);

    if (active) {
      const portrait = this.scene.layout.orientation === 'portrait';
      const scale = (portrait ? 0.6 : 0.84) * (1 + 0.08 * Math.sin(clamp01((p - 0.04) / 0.86) * Math.PI));
      // Path: fast entry, slow glide over the reels while breathing fire, fast climb out.
      let x: number;
      let y: number;
      if (p < 0.3) {
        const t = easeOut(clamp01((p - 0.04) / 0.26));
        x = lerp(-0.34 * d.w, 0.16 * d.w, t);
        y = lerp(0.46 * d.h, 0.36 * d.h, t);
      } else if (p < 0.66) {
        const t = (p - 0.3) / 0.36;
        x = lerp(0.16 * d.w, 0.32 * d.w, t);
        y = lerp(0.36 * d.h, 0.33 * d.h, t);
      } else {
        const t = easeIn(clamp01((p - 0.66) / 0.24));
        x = lerp(0.32 * d.w, 1.36 * d.w, t);
        y = lerp(0.33 * d.h, -0.1 * d.h, t);
      }
      const flap = (T * 1.75 + Math.max(0, p - 0.66) * this.duration * 0.9) % 1;
      y += Math.sin(flap * Math.PI * 2 - 0.6) * 6 * scale;
      this.dragon.position.set(x, y);
      this.dragon.scale.set(scale);
      this.dragon.rotation = p < 0.3 ? -0.06 : p < 0.66 ? 0.02 : -0.2 * clamp01((p - 0.66) / 0.1);

      // Head: rear back on the inhale; while firing, aim the mouth at a point sweeping the reels.
      const jaw = firing ? 0.85 + 0.15 * Math.sin(T * 30) : inhale * 0.18 + (1 - closing) * (p > 0.66 && p < 0.71 ? 0.85 : 0);
      let pitch = -0.38 * inhale;
      const aim = { x: reels.x + reels.w * (0.32 + 0.56 * fireT), y: reels.y + reels.h * (0.55 + 0.18 * Math.sin(fireT * Math.PI)) };
      const pose = { time: T, flap, headPitch: pitch, jaw, throat: Math.max(inhale, firing ? 1 - fireT * 0.6 : 0) };
      this.dragon.pose(pose);
      if (firing) {
        for (let i = 0; i < 2; i++) {
          const m = this.dragon.mouthInParent();
          const want = Math.atan2(aim.y - m.y, aim.x - m.x);
          pitch = clamp(pitch + wrap(want - m.angle), -0.5, 1.1);
          this.dragon.pose({ ...pose, headPitch: pitch });
        }
      }

      // Fire, simulated from the progress step; a skip (big jump) just clears it.
      const dt = dp > 0 && dp * this.duration < 0.1 ? dp * this.duration : 0;
      if (dp * this.duration >= 0.1 || dp < 0) this.flames.clear();
      if (firing && dt > 0) {
        if (!this.breathCued) {
          this.breathCued = true;
          audioBus.engine?.play('fireBreath');
        }
        const m = this.dragon.mouthInParent();
        this.flames.emit(m.x, m.y, m.angle, dt, 260, 1250 * scale);
        const step = Math.floor(fireT * 26);
        if (step !== this.lastSpark) {
          this.lastSpark = step;
          this.particles.burst({ x: aim.x, y: aim.y, count: 6, speed: 260, spread: Math.PI * 0.9, gravity: 320, life: [0.35, 0.8], scale: [0.4, 0.9], kind: 'spark' });
        }
        this.reelGlow.position.set(aim.x, aim.y);
      } else if (dt > 0 && p > 0.66 && p < 0.78 && this.rand() < dt * 14) {
        const m = this.dragon.mouthInParent();
        this.flames.wisp(m.x - 20 * scale, m.y - 26 * scale);
      }
      this.flames.update(dt);
    } else {
      this.flames.update(dp > 0 && dp * this.duration < 0.1 ? dp * this.duration : 0);
    }
    this.reelGlow.alpha = firing ? 0.5 : Math.max(0, this.reelGlow.alpha - 0.04);
    this.reelGlow.scale.set(4 + 0.8 * Math.sin(T * 18));

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
    this.reelGlow.alpha = 0;
    this.dragon.visible = false;
    this.flames.clear();
    audioBus.engine?.duck(false);
  }
}

const clamp = (v: number, a: number, b: number): number => Math.min(b, Math.max(a, v));
const clamp01 = (v: number): number => clamp(v, 0, 1);
const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;
const easeOut = (t: number): number => 1 - (1 - t) * (1 - t) * (1 - t);
const easeIn = (t: number): number => t * t * t;
const wrap = (a: number): number => Math.atan2(Math.sin(a), Math.cos(a));
/** 0 → 1 → 0 bump across [a, b]. */
const band = (p: number, a: number, b: number): number => (p < a || p > b ? 0 : Math.sin(((p - a) / (b - a)) * Math.PI));
