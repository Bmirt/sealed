import { Container, Graphics } from 'pixi.js';
import type { SymbolId } from '@math/types';
import type { TextureBank } from '@/assets/textures';
import { SYMBOL_H, SYMBOL_W } from '@/assets/procedural/metrics';
import { ROWS } from './layout';
import { rowY, stripIndexAt } from './reelMath';
import { SymbolView } from './SymbolView';

const BUFFER_ABOVE = 1;
const BUFFER_BELOW = 1;
const VIEWS = ROWS + BUFFER_ABOVE + BUFFER_BELOW;

/**
 * One reel. Shows a window of its strip at a continuous position `pos` (in symbol units).
 * Symbol with strip index j is drawn at y = (j − pos) · SYMBOL_H, so decreasing `pos` moves the
 * symbols DOWN (the spin direction). At rest, pos === the maths stop index and the visible window
 * is strip[stop], strip[stop+1], strip[stop+2] - exactly what the maths evaluated.
 */
export class ReelView extends Container {
  readonly reelIndex: number;
  private readonly views: SymbolView[] = [];
  private strip: readonly SymbolId[];
  private pos = 0;
  private blur = false;
  private readonly content: Container;

  constructor(bank: TextureBank, reelIndex: number, strip: readonly SymbolId[]) {
    super();
    this.reelIndex = reelIndex;
    this.strip = strip;
    this.content = new Container();
    this.addChild(this.content);
    for (let k = 0; k < VIEWS; k++) {
      const v = new SymbolView(bank);
      this.views.push(v);
      this.content.addChild(v);
    }
    const mask = new Graphics().rect(0, 0, SYMBOL_W, SYMBOL_H * ROWS).fill({ color: 0xffffff });
    this.addChild(mask);
    this.content.mask = mask;
    this.render();
  }

  get position_(): number {
    return this.pos;
  }

  get stripLength(): number {
    return this.strip.length;
  }

  setStrip(strip: readonly SymbolId[]): void {
    this.strip = strip;
    this.render();
  }

  /** Jump to a stop index (static display). */
  setStop(stop: number): void {
    this.pos = stop;
    this.blur = false;
    this.render();
  }

  /** Continuous position, used by the spin tween (stage 3). */
  setPos(pos: number, blur: boolean): void {
    this.pos = pos;
    this.blur = blur;
    this.render();
  }

  /** The symbol view currently showing a visible row (0..2) - for win highlighting. */
  viewAtRow(row: number): SymbolView {
    const v = this.views[row + BUFFER_ABOVE];
    if (!v) throw new Error(`row ${row} out of range`);
    return v;
  }

  setDimAll(dim: boolean): void {
    for (const v of this.views) {
      v.setDim(dim);
      v.setPulse(1);
    }
  }

  private render(): void {
    const len = this.strip.length;
    if (len === 0) return;
    for (let k = 0; k < VIEWS; k++) {
      const rowK = k - BUFFER_ABOVE;
      const v = this.views[k];
      const id = this.strip[stripIndexAt(this.pos, rowK, len)];
      if (!v || !id) continue;
      v.setSymbol(id, this.blur);
      v.y = rowY(this.pos, rowK) * SYMBOL_H;
    }
  }
}
