import type { WayWin } from '@math/types';
import { SYMBOL_H, SYMBOL_W } from '@/assets/procedural/metrics';
import { audioBus } from '@/audio/bus';
import type { SpinnableReel } from './anim/reelSpin';
import type { TierSurface, WinShowSurface } from './anim/winShow';
import { AnticipationView } from './AnticipationView';
import { CinematicView, FeatureHudView } from './FeatureViews';
import type { GameScene } from './GameScene';
import { REELS_H } from './layout';
import type { ParticleSystem } from './Particles';
import type { CinematicDeps, FeatureDeps, PresenterDeps } from './AnimatedPresenter';
import { WinOverlayView } from './WinOverlayView';

/** Wires the presenter's Pixi-free deps interface to the real scene. */
export class PixiPresenterDeps implements PresenterDeps {
  private readonly scene: GameScene;
  private readonly particles: ParticleSystem;
  readonly overlay: WinOverlayView;
  private readonly anticipationView: AnticipationView;
  readonly feature: FeatureDeps;
  readonly cinematic: CinematicDeps;

  constructor(scene: GameScene, particles: ParticleSystem) {
    this.scene = scene;
    this.particles = particles;
    this.overlay = new WinOverlayView(scene, particles);
    this.anticipationView = new AnticipationView(scene);
    this.feature = new FeatureHudView(scene);
    this.cinematic = new CinematicView(scene, particles, scene.app.renderer);
  }

  reels(): SpinnableReel[] {
    audioBus.engine?.play('spin');
    return this.scene.reels.reels.map((reel) => ({
      stripLength: reel.stripLength,
      getPos: () => reel.position_,
      setPos: (pos, blur) => reel.setPos(pos, blur),
    }));
  }

  setStripSet(set: 'base' | 'free'): void {
    this.scene.reels.setStripSet(set);
  }

  setBackground(variant: 'base' | 'free'): void {
    this.scene.setBackground(variant);
  }

  showStops(stops: readonly number[], set: 'base' | 'free'): void {
    this.scene.reels.showStops(stops, set);
  }

  get winSurface(): WinShowSurface & { prepare(wins: readonly WayWin[]): void } {
    return this.overlay;
  }

  get tierSurface(): TierSurface {
    return this.overlay.tierSurface();
  }

  get anticipation(): { start(reel: number): void; end(reel: number): void; reset(): void } {
    return {
      start: (r) => this.anticipationView.start(r),
      end: (r) => this.anticipationView.end(r),
      reset: () => this.anticipationView.reset(),
    };
  }

  get cycle(): { show(win: WayWin, betCents: number, coinsPerBet: number): void; clear(): void } {
    return {
      show: (win, cents, cpb) => this.overlay.showCycleWin(win, cents, cpb),
      clear: () => this.overlay.clearCycle(),
    };
  }

  landPuff(reel: number, fx: { readonly scatter: boolean; readonly wildRows: readonly number[] }): void {
    const layout = this.scene.layout;
    const reelX = layout.reelsX + (reel + 0.5) * SYMBOL_W * layout.reelsScale;
    this.particles.burst({
      x: reelX,
      y: layout.reelsY + (REELS_H - 6) * layout.reelsScale,
      count: 6,
      speed: 120,
      spread: Math.PI * 0.8,
      gravity: 140,
      life: [0.25, 0.5],
      scale: [0.3, 0.6],
    });
    audioBus.engine?.play('reelLand', { rate: 0.95 + reel * 0.03 });
    if (fx.scatter) {
      this.scatterSeen = reel === 0 ? 1 : this.scatterSeen + 1;
      audioBus.engine?.play('scatterChime', { rate: 1 + Math.min(3, this.scatterSeen - 1) * 0.14 });
    }
    if (reel === 0) this.scatterSeen = fx.scatter ? 1 : 0;
    // Wild: a fire trail burns down the reel to each throne.
    for (const row of fx.wildRows) {
      audioBus.engine?.play('wildFire');
      const cellY = layout.reelsY + (row + 0.5) * SYMBOL_H * layout.reelsScale;
      const topY = layout.reelsY;
      for (let step = 0; step < 5; step++) {
        const t = step / 4;
        this.particles.burst({
          x: reelX + (Math.sin(step * 2.4) * 18) * layout.reelsScale,
          y: topY + (cellY - topY) * t,
          count: 5,
          speed: 90,
          spread: Math.PI * 1.6,
          gravity: -60,
          life: [0.3, 0.7],
          scale: [0.35, 0.8],
        });
      }
    }
  }

  private scatterSeen = 0;

  resetOverlay(): void {
    this.overlay.reset();
  }
}
