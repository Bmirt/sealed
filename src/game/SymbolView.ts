import { Container, Sprite } from 'pixi.js';
import type { SymbolId } from '@math/types';
import type { TextureBank } from '@/assets/textures';
import { SYMBOL_H, SYMBOL_W } from '@/assets/procedural/metrics';

/**
 * One symbol cell. A plain sprite with two textures (sharp / motion-blur) and a dim state.
 * Pooled by ReelView; never allocated during a spin.
 */
export class SymbolView extends Container {
  private readonly sprite: Sprite;
  private readonly bank: TextureBank;
  private id: SymbolId = 'L1';
  private blurred = false;

  constructor(bank: TextureBank) {
    super();
    this.bank = bank;
    this.sprite = new Sprite(bank.symbol('L1'));
    this.sprite.anchor.set(0.5);
    this.sprite.position.set(SYMBOL_W / 2, SYMBOL_H / 2);
    this.addChild(this.sprite);
  }

  get symbolId(): SymbolId {
    return this.id;
  }

  setSymbol(id: SymbolId, blur = false): void {
    if (id === this.id && blur === this.blurred) return;
    this.id = id;
    this.blurred = blur;
    this.sprite.texture = blur ? this.bank.symbolBlur(id) : this.bank.symbol(id);
  }

  setBlur(blur: boolean): void {
    this.setSymbol(this.id, blur);
  }

  /** Dim non-winning symbols during a win presentation. */
  setDim(dim: boolean): void {
    this.sprite.tint = dim ? 0x6a6672 : 0xffffff;
  }

  /** Scale pulse around the cell centre (used by win presentation). */
  setPulse(scale: number): void {
    this.sprite.scale.set(scale);
  }
}
