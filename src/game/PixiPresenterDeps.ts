import type { WayWin } from '@math/types';
import { SYMBOL_W } from '@/assets/procedural/metrics';
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

  landPuff(reel: number): void {
    const layout = this.scene.layout;
    this.particles.burst({
      x: layout.reelsX + (reel + 0.5) * SYMBOL_W * layout.reelsScale,
      y: layout.reelsY + (REELS_H - 6) * layout.reelsScale,
      count: 6,
      speed: 120,
      spread: Math.PI * 0.8,
      gravity: 140,
      life: [0.25, 0.5],
      scale: [0.3, 0.6],
    });
  }

  resetOverlay(): void {
    this.overlay.reset();
  }
}
