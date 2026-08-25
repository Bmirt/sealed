import { Container, Sprite } from 'pixi.js';
import type { SymbolId } from '@math/types';
import type { TextureBank } from '@/assets/textures';
import { SYMBOL_H, SYMBOL_W } from '@/assets/procedural/metrics';

/**
 * One symbol cell. A sprite with two textures (sharp / motion-blur), a dim state, and the
 * premium move-set: win POP (scale overshoot + additive flash + wiggle), landing SQUASH,
 * and the gentle cycle pulse. Pooled by ReelView; never allocated during a spin.
 */
export class SymbolView extends Container {
  private readonly sprite: Sprite;
  private readonly flash: Sprite;
  private readonly bank: TextureBank;
  private id: SymbolId = 'L1';
  private blurred = false;
  private pulseScale = 1;
  private popScale = 1;
  private popRot = 0;
  private squashX = 1;
  private squashY = 1;

  constructor(bank: TextureBank) {
    super();
    this.bank = bank;
    this.sprite = new Sprite(bank.symbol('L1'));
    this.sprite.anchor.set(0.5);
    this.sprite.position.set(SYMBOL_W / 2, SYMBOL_H / 2);
    this.addChild(this.sprite);
    this.flash = new Sprite(bank.symbol('L1'));
    this.flash.anchor.set(0.5);
    this.flash.position.set(SYMBOL_W / 2, SYMBOL_H / 2);
    this.flash.blendMode = 'add';
    this.flash.alpha = 0;
    this.flash.visible = false;
    this.addChild(this.flash);
  }

  get symbolId(): SymbolId {
    return this.id;
  }

  setSymbol(id: SymbolId, blur = false): void {
    if (id === this.id && blur === this.blurred) return;
    this.id = id;
    this.blurred = blur;
    this.sprite.texture = blur ? this.bank.symbolBlur(id) : this.bank.symbol(id);
    this.flash.texture = this.bank.symbol(id);
  }

  setBlur(blur: boolean): void {
    this.setSymbol(this.id, blur);
  }

  /** Dim non-winning symbols during a win presentation. */
  setDim(dim: boolean): void {
    this.sprite.tint = dim ? 0x565260 : 0xffffff;
  }

  /** Gentle scale pulse (win-cycle idle loop). */
  setPulse(scale: number): void {
    this.pulseScale = scale;
    this.apply();
  }

  /**
   * Win pop, driven 0→1 (with an overshooting ease): scale swells and settles, an additive
   * flash blooms and fades, a tiny wiggle rides along. v=0 and v≥1 are both the rest state.
   */
  setPop(v: number): void {
    const s = Math.sin(Math.min(1, Math.max(0, v)) * Math.PI);
    this.popScale = 1 + 0.24 * Math.sin(v * Math.PI); // may dip below 1 on back-ease overshoot
    this.popRot = Math.sin(v * Math.PI * 3) * 0.05 * (1 - Math.min(1, v));
    const a = Math.max(0, 0.85 * s * (1 - v * 0.6));
    this.flash.alpha = a;
    this.flash.visible = a > 0.01;
    this.apply();
  }

  /** Landing impact, driven 0→1: vertical squash with a horizontal stretch, then rest. */
  setSquash(v: number): void {
    const s = Math.sin(Math.min(1, Math.max(0, v)) * Math.PI);
    this.squashY = 1 - 0.16 * s;
    this.squashX = 1 + 0.1 * s;
    this.apply();
  }

  private apply(): void {
    const sx = this.pulseScale * this.popScale * this.squashX;
    const sy = this.pulseScale * this.popScale * this.squashY;
    this.sprite.scale.set(sx, sy);
    this.sprite.rotation = this.popRot;
    this.flash.scale.set(sx, sy);
    this.flash.rotation = this.popRot;
  }
}
