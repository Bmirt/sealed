import { Container, Graphics } from 'pixi.js';
import { PALETTE } from '@config/palette';
import type { GameConfig, SymbolCode, SymbolId } from '@math/types';
import { contextFor } from '@math/context';
import { buildFrame } from '@/assets/procedural/frame';
import { SYMBOL_H, SYMBOL_W } from '@/assets/procedural/metrics';
import type { TextureBank } from '@/assets/textures';
import { REELS, REELS_H, REELS_W, ROWS } from './layout';
import { ReelView } from './ReelView';

export type StripSet = 'base' | 'free';

/**
 * The five reels + frame. Renders exactly what it is told (stops / grids from the maths).
 */
export class ReelsView extends Container {
  readonly reels: ReelView[] = [];
  private readonly config: GameConfig;
  private readonly stripsById: Record<StripSet, readonly (readonly SymbolId[])[]>;
  private currentSet: StripSet = 'base';
  readonly frame: Container;
  readonly window: Container;

  constructor(bank: TextureBank, config: GameConfig) {
    super();
    this.config = config;
    const ctx = contextFor(config);
    const toIds = (strips: readonly (readonly SymbolCode[])[]): (readonly SymbolId[])[] =>
      strips.map((s) =>
        s.map((c) => {
          const id = ctx.codeToId[c];
          if (!id) throw new Error(`unknown symbol code ${c}`);
          return id;
        }),
      );
    this.stripsById = { base: toIds(config.strips.base), free: toIds(config.strips.free) };

    // Dark well behind the symbols.
    const well = new Graphics().roundRect(-2, -2, REELS_W + 4, REELS_H + 4, 4).fill({ color: PALETTE.obsidian, alpha: 0.92 });
    this.addChild(well);
    // Subtle reel separators.
    const seps = new Graphics();
    for (let r = 1; r < REELS; r++) {
      seps.moveTo(r * SYMBOL_W, 4).lineTo(r * SYMBOL_W, REELS_H - 4).stroke({ width: 1, color: PALETTE.stoneEdge, alpha: 0.35 });
    }
    this.addChild(seps);

    this.window = new Container();
    this.addChild(this.window);
    for (let r = 0; r < REELS; r++) {
      const strip = this.stripsById.base[r];
      if (!strip) throw new Error(`missing strip ${r}`);
      const reel = new ReelView(bank, r, strip);
      reel.x = r * SYMBOL_W;
      this.reels.push(reel);
      this.window.addChild(reel);
    }

    this.frame = buildFrame(REELS_W, REELS_H);
    this.addChild(this.frame);
  }

  get stripSet(): StripSet {
    return this.currentSet;
  }

  setStripSet(set: StripSet): void {
    if (set === this.currentSet) return;
    this.currentSet = set;
    this.reels.forEach((reel, r) => {
      const strip = this.stripsById[set][r];
      if (strip) reel.setStrip(strip);
    });
  }

  /** Static display of a maths result: stops on the given strip set. */
  showStops(stops: readonly number[], set: StripSet): void {
    this.setStripSet(set);
    stops.forEach((stop, r) => this.reels[r]?.setStop(stop));
  }

  /** Sanity check used by tests/dev: the visible grid must equal the maths grid. */
  visibleGrid(): SymbolId[][] {
    return this.reels.map((reel) => Array.from({ length: ROWS }, (_, row) => reel.viewAtRow(row).symbolId));
  }

  clearHighlights(): void {
    for (const reel of this.reels) reel.setDimAll(false);
  }

  get symbolSize(): { w: number; h: number } {
    return { w: SYMBOL_W, h: SYMBOL_H };
  }

  get gameConfig(): GameConfig {
    return this.config;
  }
}
