import { gsap } from 'gsap';
import { Container, FillGradient, Graphics } from 'pixi.js';
import { PALETTE, rgba } from '@config/palette';
import { audioBus } from '@/audio/bus';
import { fxBus } from './Ambient';
import { SYMBOL_H, SYMBOL_W } from '@/assets/procedural/metrics';
import type { GameScene } from './GameScene';
import { REELS, REELS_H, ROWS } from './layout';

/**
 * The scatter-tease dressing: a garnet/ember glow column over the anticipating reel and a pulse
 * on the frame. Driven by the reel-spin hooks; all loops are killed on land (or skip).
 */
export class AnticipationView {
  private readonly columns: Graphics[] = [];
  private readonly layer: Container;
  private readonly scene: GameScene;
  private frameTween: gsap.core.Tween | null = null;
  private columnTweens: (gsap.core.Tween | null)[] = [];

  constructor(scene: GameScene) {
    this.scene = scene;
    this.layer = new Container();
    for (let r = 0; r < REELS; r++) {
      const g = new Graphics();
      const grad = new FillGradient({
        type: 'linear',
        start: { x: 0, y: 0 },
        end: { x: 1, y: 0 },
        colorStops: [
          { offset: 0, color: rgba(PALETTE.garnet, 0.0) },
          { offset: 0.5, color: rgba(PALETTE.ember, 0.34) },
          { offset: 1, color: rgba(PALETTE.garnet, 0.0) },
        ],
        textureSpace: 'local',
      });
      g.rect(0, 0, SYMBOL_W, SYMBOL_H * ROWS).fill(grad);
      g.rect(3, 2, SYMBOL_W - 6, SYMBOL_H * ROWS - 4).stroke({ width: 3, color: PALETTE.ember, alpha: 0.8 });
      g.position.set(r * SYMBOL_W, 0);
      g.visible = false;
      g.alpha = 0;
      this.columns.push(g);
      this.layer.addChild(g);
      this.columnTweens.push(null);
    }
    scene.reels.addChild(this.layer);
  }

  start(reel: number): void {
    const g = this.columns[reel];
    if (!g) return;
    g.visible = true;
    this.columnTweens[reel]?.kill();
    g.alpha = 0.35;
    this.columnTweens[reel] = gsap.to(g, { alpha: 1, duration: 0.42, yoyo: true, repeat: -1, ease: 'sine.inOut' });
    // Frame pulse (shared) + the tension drone (music ducks under it).
    if (!this.frameTween) {
      const frame = this.scene.reels.frame;
      this.frameTween = gsap.to(frame.scale, { x: 1.006, y: 1.006, duration: 0.34, yoyo: true, repeat: -1, ease: 'sine.inOut' });
      audioBus.engine?.duck(true);
      audioBus.engine?.loopStart('anticipationLoop', 0.3);
      fxBus.ambient?.setIntensity(2.6);
    }
  }

  end(reel: number): void {
    const g = this.columns[reel];
    this.columnTweens[reel]?.kill();
    this.columnTweens[reel] = null;
    if (g) {
      g.visible = false;
      g.alpha = 0;
    }
    if (this.columnTweens.every((t) => t === null)) this.stopFramePulse();
  }

  /** Hard reset — also the skip/abort end state. */
  reset(): void {
    for (let r = 0; r < REELS; r++) this.end(r);
    this.stopFramePulse();
  }

  private stopFramePulse(): void {
    if (this.frameTween) {
      audioBus.engine?.loopStop('anticipationLoop', 0.2);
      audioBus.engine?.duck(false);
      fxBus.ambient?.setIntensity(1.2);
    }
    this.frameTween?.kill();
    this.frameTween = null;
    this.scene.reels.frame.scale.set(1);
  }

  /** Height of the glow column (for tests/layout sanity). */
  static get columnHeight(): number {
    return REELS_H;
  }
}
