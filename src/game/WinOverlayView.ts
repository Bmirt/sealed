import { gsap } from 'gsap';
import { BitmapFont, BitmapText, Container, FillGradient, Graphics } from 'pixi.js';
import { PALETTE, rgba } from '@config/palette';
import { DISPLAY_FONT } from '@config/typography';
import type { Cell, WayWin } from '@math/types';
import { SYMBOL_COPY } from '@/assets/manifest';
import { SYMBOL_H, SYMBOL_W } from '@/assets/procedural/metrics';
import { formatCents } from '@/state/money';
import type { CounterLike, PulseTarget, TierSurface, WinShowSurface } from './anim/winShow';
import type { GameScene } from './GameScene';
import { DESIGN, REELS, REELS_H, REELS_W, ROWS } from './layout';
import type { ParticleSystem } from './Particles';

const FONT_NAME = 'AshfallGold';
let fontInstalled = false;

function ensureFont(): void {
  if (fontInstalled) return;
  BitmapFont.install({
    name: FONT_NAME,
    style: {
      fontFamily: DISPLAY_FONT,
      fontSize: 64,
      fontWeight: '700',
      letterSpacing: 2,
      fill: {
        fill: new FillGradient({
          type: 'linear',
          start: { x: 0, y: 0 },
          end: { x: 0, y: 1 },
          colorStops: [
            { offset: 0, color: 0xfff1c2 },
            { offset: 0.45, color: PALETTE.goldHi },
            { offset: 1, color: PALETTE.goldDeep },
          ],
          textureSpace: 'local',
        }),
      },
      stroke: { color: PALETTE.black, width: 5 },
    },
    chars: [['a', 'z'], ['A', 'Z'], ['0', '9'], '€.,×—+ '],
    resolution: 2,
  });
  fontInstalled = true;
}

class TextCounter implements CounterLike {
  readonly view: BitmapText;
  private readonly prefix: string;

  constructor(size: number, prefix = '') {
    ensureFont();
    this.prefix = prefix;
    this.view = new BitmapText({ text: '', style: { fontFamily: FONT_NAME, fontSize: size } });
    this.view.anchor.set(0.5);
    this.view.visible = false;
  }

  set(cents: number): void {
    this.view.text = `${this.prefix}${formatCents(cents)}`;
  }

  show(): void {
    this.view.visible = true;
  }

  hide(): void {
    this.view.visible = false;
  }
}

/**
 * Everything that appears OVER the reels during wins: cell flares, dimming, the line-win counter,
 * the per-win cycle (trace + label) and the full-screen tier overlay.
 * Implements the Pixi-free surfaces the timeline builders speak to.
 */
export class WinOverlayView implements WinShowSurface {
  private readonly scene: GameScene;
  private readonly particles: ParticleSystem;
  private readonly flareLayer: Container;
  private readonly flares: Graphics[] = [];
  private readonly trace: Graphics;
  private winningSet = new Set<string>();
  private cells: Cell[] = [];
  readonly counter: TextCounter;
  private readonly cycleLabel: BitmapText;

  // Tier overlay.
  private readonly tierRoot: Container;
  private readonly veil: Graphics;
  private readonly tierLabel: BitmapText;
  readonly tierCounter: TextCounter;

  constructor(scene: GameScene, particles: ParticleSystem) {
    this.scene = scene;
    this.particles = particles;

    this.flareLayer = new Container();
    this.trace = new Graphics();
    scene.reels.window.addChild(this.trace);
    scene.reels.addChild(this.flareLayer);
    for (let i = 0; i < REELS * ROWS; i++) {
      const f = new Graphics();
      f.roundRect(6, 6, SYMBOL_W - 12, SYMBOL_H - 12, 14).stroke({ width: 5, color: PALETTE.goldHi, alpha: 0.95 });
      f.roundRect(2, 2, SYMBOL_W - 4, SYMBOL_H - 4, 16).stroke({ width: 2, color: PALETTE.ember, alpha: 0.7 });
      f.visible = false;
      this.flares.push(f);
      this.flareLayer.addChild(f);
    }

    this.counter = new TextCounter(46, 'WIN ');
    this.counter.view.position.set(REELS_W / 2, REELS_H + 78);
    scene.reels.addChild(this.counter.view);

    this.cycleLabel = new BitmapText({ text: '', style: { fontFamily: FONT_NAME, fontSize: 24 } });
    this.cycleLabel.anchor.set(0.5);
    this.cycleLabel.visible = false;
    this.cycleLabel.position.set(REELS_W / 2, REELS_H + 38);
    scene.reels.addChild(this.cycleLabel);

    // Tier overlay lives in the screen-space overlay container.
    this.tierRoot = new Container();
    this.tierRoot.visible = false;
    this.veil = new Graphics();
    this.veil.rect(-4000, -4000, 12000, 12000).fill({ color: rgba(PALETTE.black, 0.78) });
    this.tierRoot.addChild(this.veil);
    this.tierLabel = new BitmapText({ text: '', style: { fontFamily: FONT_NAME, fontSize: 110 } });
    this.tierLabel.anchor.set(0.5);
    this.tierRoot.addChild(this.tierLabel);
    this.tierCounter = new TextCounter(84);
    this.tierRoot.addChild(this.tierCounter.view);
    scene.overlay.addChild(this.tierRoot);
  }

  /** Called before each win show with the cells of every WayWin. */
  prepare(wins: readonly WayWin[]): void {
    this.cells = [];
    this.winningSet.clear();
    for (const w of wins) {
      for (const [r, row] of w.positions) {
        const key = `${r}:${row}`;
        if (!this.winningSet.has(key)) {
          this.winningSet.add(key);
          this.cells.push([r, row]);
        }
      }
    }
  }

  // ---- WinShowSurface ----

  get winningCells(): readonly PulseTarget[] {
    return this.cells.map(([r, row]) => this.scene.reels.reels[r]?.viewAtRow(row) ?? NULL_PULSE);
  }

  setDim(on: boolean): void {
    for (let r = 0; r < REELS; r++) {
      const reel = this.scene.reels.reels[r];
      if (!reel) continue;
      for (let row = 0; row < ROWS; row++) {
        reel.viewAtRow(row).setDim(on && !this.winningSet.has(`${r}:${row}`));
      }
    }
    if (!on) {
      for (let r = 0; r < REELS; r++) this.scene.reels.reels[r]?.setDimAll(false);
    }
  }

  setFlares(on: boolean): void {
    this.flares.forEach((f) => (f.visible = false));
    if (!on) return;
    this.cells.forEach(([r, row], i) => {
      const f = this.flares[i];
      if (!f) return;
      f.position.set(r * SYMBOL_W, row * SYMBOL_H);
      f.visible = true;
    });
  }

  // ---- per-win cycle (idle loop) ----

  /** Highlight a single WayWin: its cells + a trace line + label. */
  showCycleWin(win: WayWin, betCents: number, coinsPerBet: number): void {
    this.clearCycle();
    const set = new Set(win.positions.map(([r, row]) => `${r}:${row}`));
    for (let r = 0; r < REELS; r++) {
      const reel = this.scene.reels.reels[r];
      if (!reel) continue;
      for (let row = 0; row < ROWS; row++) reel.viewAtRow(row).setDim(!set.has(`${r}:${row}`));
    }
    win.positions.forEach(([r, row], i) => {
      const f = this.flares[i];
      if (!f) return;
      f.position.set(r * SYMBOL_W, row * SYMBOL_H);
      f.visible = true;
    });
    // Trace: a glowing line through the centroid of the win's cells on each participating reel.
    const centers: [number, number][] = [];
    for (let r = 0; r < win.length; r++) {
      const rows = win.positions.filter(([reel]) => reel === r).map(([, row]) => row);
      if (rows.length === 0) continue;
      const avg = rows.reduce((a, b) => a + b, 0) / rows.length;
      centers.push([r * SYMBOL_W + SYMBOL_W / 2, avg * SYMBOL_H + SYMBOL_H / 2]);
    }
    this.trace.clear();
    if (centers.length >= 2) {
      const [first, ...rest] = centers;
      if (first) {
        this.trace.moveTo(first[0], first[1]);
        for (const [x, y] of rest) this.trace.lineTo(x, y);
        this.trace.stroke({ width: 7, color: PALETTE.ember, alpha: 0.5 });
        this.trace.moveTo(first[0], first[1]);
        for (const [x, y] of rest) this.trace.lineTo(x, y);
        this.trace.stroke({ width: 2.5, color: PALETTE.goldHi, alpha: 0.95 });
      }
    }
    const winCents = (win.win * betCents) / coinsPerBet;
    this.cycleLabel.text = `${SYMBOL_COPY[win.symbol].title.toUpperCase()} ×${win.length} — ${win.ways} WAYS — ${formatCents(winCents)}`;
    this.cycleLabel.visible = true;
  }

  clearCycle(): void {
    this.trace.clear();
    this.cycleLabel.visible = false;
    this.flares.forEach((f) => (f.visible = false));
    for (let r = 0; r < REELS; r++) this.scene.reels.reels[r]?.setDimAll(false);
  }

  /** Full reset between rounds (also the abort end state). */
  reset(): void {
    this.clearCycle();
    this.counter.hide();
    this.tierRoot.visible = false;
    this.tierCounter.hide();
  }

  // ---- TierSurface (adapter — the tier builder gets the tier counter, not the line counter) ----

  tierSurface(): TierSurface {
    return {
      show: (label) => this.showTier(label),
      hide: () => this.hideTier(),
      counter: this.tierCounter,
      shake: (i) => this.shake(i),
      burst: (s) => this.burst(s),
      setRollProgress: (p) => this.setRollProgress(p),
    };
  }

  private showTier(label: string): void {
    const d = DESIGN[this.scene.layout.orientation];
    this.tierLabel.text = label;
    this.tierLabel.position.set(d.w / 2, d.h * 0.36);
    this.tierCounter.view.position.set(d.w / 2, d.h * 0.52);
    this.tierRoot.visible = true;
    this.tierLabel.scale.set(1);
  }

  private hideTier(): void {
    this.tierRoot.visible = false;
  }

  private shake(intensity: number): void {
    const world = this.scene.world;
    const tl = gsap.timeline();
    const amp = 6 * intensity;
    for (let i = 0; i < 6; i++) {
      tl.to(world.pivot, { x: (i % 2 ? -1 : 1) * amp * (1 - i / 6), y: (i % 3 ? 1 : -1) * amp * 0.6 * (1 - i / 6), duration: 0.05 });
    }
    tl.to(world.pivot, { x: 0, y: 0, duration: 0.08 });
  }

  private burst(strength: number): void {
    const d = DESIGN[this.scene.layout.orientation];
    this.particles.burst({
      x: d.w / 2,
      y: d.h * 0.5,
      count: Math.round(40 * strength),
      speed: 420 * Math.sqrt(strength),
      spread: Math.PI * 2,
      gravity: 420,
      life: [0.6, 1.4],
      scale: [0.6, 1.4],
    });
  }

  private setRollProgress(p: number): void {
    this.tierLabel.scale.set(1 + p * 0.12);
    this.tierCounter.view.scale.set(1 + p * 0.25);
  }
}

const NULL_PULSE: PulseTarget = { setPulse: () => undefined };
