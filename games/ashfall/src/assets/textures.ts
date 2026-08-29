import { Assets, Container, Graphics, Rectangle, Sprite } from 'pixi.js';
import type { Renderer , Texture } from 'pixi.js';
import type { SymbolId } from '@math/types';
import { SYMBOL_VISUALS } from './manifest';
import type { VisualAsset } from './manifest';

export const SYMBOL_IDS: readonly SymbolId[] = ['H1', 'H2', 'H3', 'M1', 'M2', 'L1', 'L2', 'L3', 'L4', 'W', 'S'];

/**
 * Bakes every visual in the manifest into a GPU texture once at boot.
 * Reels render plain Sprites from these — no live Graphics, no filters in the spin loop.
 */
export class TextureBank {
  private readonly symbols = new Map<SymbolId, Texture>();
  private readonly blurred = new Map<SymbolId, Texture>();
  private readonly renderer: Renderer;
  readonly resolution: number;

  constructor(renderer: Renderer, resolution: number) {
    this.renderer = renderer;
    this.resolution = Math.max(1, Math.min(3, resolution));
  }

  async load(): Promise<void> {
    for (const id of SYMBOL_IDS) {
      const asset = SYMBOL_VISUALS[id];
      const sharp = await this.bake(asset);
      this.symbols.set(id, sharp);
      this.blurred.set(id, this.bakeBlur(asset, sharp));
    }
  }

  symbol(id: SymbolId): Texture {
    const t = this.symbols.get(id);
    if (!t) throw new Error(`texture for ${id} not loaded`);
    return t;
  }

  /** Motion-blur variant used while the reel spins (vertically smeared). */
  symbolBlur(id: SymbolId): Texture {
    const t = this.blurred.get(id);
    if (!t) throw new Error(`blur texture for ${id} not loaded`);
    return t;
  }

  private async bake(asset: VisualAsset): Promise<Texture> {
    if (asset.kind === 'texture') {
      return Assets.load<Texture>(asset.url);
    }
    const g = new Graphics();
    asset.paint(g);
    g.position.set(asset.width / 2, asset.height / 2);
    const wrap = new Container();
    wrap.addChild(g);
    const tex = this.renderer.generateTexture({
      target: wrap,
      frame: new Rectangle(0, 0, asset.width, asset.height),
      resolution: this.resolution,
    });
    wrap.destroy({ children: true });
    return tex;
  }

  /**
   * Cheap pre-baked motion blur: a stack of translucent, vertically offset copies of the symbol.
   * Costs nothing at runtime compared to a BlurFilter per reel per frame.
   */
  private bakeBlur(asset: VisualAsset, source: Texture): Texture {
    const wrap = new Container();
    const copies = 7;
    const spread = asset.height * 0.55;
    for (let i = 0; i < copies; i++) {
      const sprite = new Sprite(source);
      sprite.anchor.set(0.5);
      sprite.alpha = 0.5 / copies + (i === Math.floor(copies / 2) ? 0.1 : 0);
      sprite.position.set(asset.width / 2, asset.height / 2 + (i / (copies - 1) - 0.5) * spread);
      sprite.scale.set(1, 1.15);
      wrap.addChild(sprite);
    }
    const tex = this.renderer.generateTexture({
      target: wrap,
      frame: new Rectangle(0, 0, asset.width, asset.height),
      resolution: this.resolution,
    });
    wrap.destroy({ children: true });
    return tex;
  }

  /** PNG data URL of a symbol (for the DOM paytable). Cached. */
  symbolDataUrl(id: SymbolId): string {
    const hit = this.dataUrls.get(id);
    if (hit) return hit;
    const canvas = this.renderer.extract.canvas(this.symbol(id));
    const url = canvas.toDataURL?.('image/png') ?? '';
    this.dataUrls.set(id, url);
    return url;
  }

  private readonly dataUrls = new Map<SymbolId, string>();

  destroy(): void {
    for (const t of this.symbols.values()) t.destroy(true);
    for (const t of this.blurred.values()) t.destroy(true);
    this.symbols.clear();
    this.blurred.clear();
  }
}
