import type { Graphics } from 'pixi.js';
import { PALETTE } from '@config/palette';
import { flat, pt, star } from './shapes';
import { OUTLINE, dropShadow, part, vGrad } from './style';

/** Obsidian Crown - black-glass arches on a jewelled gold band. Floating emblem, bold outline. */
export function drawCrown(g: Graphics): void {
  dropShadow(g, 0, 54, 52, 9, 0.5);

  const glass = vGrad([[0, 0x3c3546], [0.5, 0x241f2c], [1, 0x120e16]], -56, 26);
  const gold = vGrad([[0, 0xffe9a8], [0.45, PALETTE.gold], [1, 0x8f5c0e]], 18, 50);

  // Rear arches (darker, behind) with gold edge trim so the prongs read as a crown.
  part(g, flat([pt(-38, 22), pt(-46, -26), pt(-22, -44), pt(-16, 22)]), vGrad([[0, 0x3a3346], [1, 0x141018]], -44, 22), 3.5);
  part(g, flat([pt(38, 22), pt(46, -26), pt(22, -44), pt(16, 22)]), vGrad([[0, 0x3a3346], [1, 0x141018]], -44, 22), 3.5);
  g.moveTo(-44, -24).lineTo(-22, -41).stroke({ width: 2.4, color: PALETTE.gold, alpha: 0.95 });
  g.moveTo(44, -24).lineTo(22, -41).stroke({ width: 2.4, color: PALETTE.gold, alpha: 0.95 });
  // Centre arch, tall, gold-edged.
  part(g, flat([pt(-18, 22), pt(-14, -34), pt(0, -56), pt(14, -34), pt(18, 22)]), glass);
  g.moveTo(-13, -32).lineTo(0, -53).lineTo(13, -32).stroke({ width: 2.6, color: PALETTE.gold, alpha: 0.95 });
  // Glass sheen lines.
  g.moveTo(-6, 14).quadraticCurveTo(-9, -18, -2, -44).stroke({ width: 2.4, color: 0x7a7188, alpha: 0.9 });
  g.moveTo(-34, 14).lineTo(-40, -22).stroke({ width: 2, color: 0x6a6178, alpha: 0.75 });
  g.moveTo(34, 14).lineTo(40, -22).stroke({ width: 2, color: 0x6a6178, alpha: 0.6 });
  // Orb + spike tips.
  part(g, star(0, -60, 4, 8, 3.4, Math.PI / 4), vGrad([[0, 0xfff1c2], [1, PALETTE.goldDeep]], -68, -52), 2.5);
  g.circle(-44, -30, 4.5).fill({ color: PALETTE.gold });
  g.circle(-44, -30, 4.5).stroke({ width: 2.5, color: OUTLINE });
  g.circle(44, -30, 4.5).fill({ color: PALETTE.gold });
  g.circle(44, -30, 4.5).stroke({ width: 2.5, color: OUTLINE });

  // Band with bevel, rivets and gems.
  part(g, flat([pt(-56, 18), pt(56, 18), pt(52, 46), pt(-52, 46)]), gold);
  g.moveTo(-52, 23).lineTo(52, 23).stroke({ width: 2.2, color: 0xfff1c2, alpha: 0.9 });
  g.moveTo(-51, 42).lineTo(51, 42).stroke({ width: 2, color: 0x6e4a10, alpha: 0.8 });
  // Centre garnet in a gold mount.
  g.circle(0, 32, 8.6).fill({ color: 0xfff1c2 });
  g.circle(0, 32, 8.6).stroke({ width: 2.5, color: OUTLINE });
  g.poly(star(0, 32, 4, 6.6, 4, Math.PI / 4)).fill({ color: PALETTE.garnet });
  g.circle(-2, 29.5, 1.8).fill({ color: 0xffb3bd });
  // Side gems.
  for (const x of [-30, 30]) {
    g.poly(star(x, 32, 4, 5.4, 3.2, Math.PI / 4)).fill({ color: PALETTE.emberDeep });
    g.poly(star(x, 32, 4, 5.4, 3.2, Math.PI / 4)).stroke({ width: 2, color: OUTLINE });
    g.circle(x - 1.4, 30, 1.2).fill({ color: 0xffd9a8 });
  }
}

/** Ancestral Blade - a rune-lit greatsword, winged guard, wrapped grip. */
export function drawBlade(g: Graphics): void {
  dropShadow(g, 0, 62, 34, 8, 0.5);

  const steel = vGrad([[0, 0xe8e6f0], [0.35, 0x9a97a8], [1, 0x4a4756]], -66, 16);
  const gold = vGrad([[0, 0xffe9a8], [0.45, PALETTE.gold], [1, 0x8f5c0e]], 12, 34);

  // Blade with a raised centre ridge.
  part(g, flat([pt(0, -70), pt(11, -56), pt(11, 14), pt(-11, 14), pt(-11, -56)]), steel);
  g.moveTo(-9, -52).lineTo(-9, 12).stroke({ width: 2.2, color: 0xf4f2fa, alpha: 0.95 });
  g.moveTo(9, -52).lineTo(9, 12).stroke({ width: 2, color: 0x2e2b38, alpha: 0.8 });
  g.moveTo(0, -66).lineTo(0, 12).stroke({ width: 2, color: 0x6e6a7c, alpha: 0.7 });
  // Glowing rune channel.
  g.roundRect(-3.2, -50, 6.4, 58, 3).fill({ color: 0x1c1520 });
  g.roundRect(-1.8, -48, 3.6, 54, 1.8).fill({ color: PALETTE.ember });
  g.roundRect(-0.8, -46, 1.6, 50, 0.8).fill({ color: 0xffd9a8 });
  // Rune notches crossing the channel.
  for (const y of [-40, -26, -12, 2]) {
    g.moveTo(-4.5, y).lineTo(4.5, y - 3).stroke({ width: 2, color: 0x1c1520 });
  }

  // Winged crossguard.
  const wing = (sx: number): void => {
    part(
      g,
      flat([pt(sx * 8, 16), pt(sx * 34, 10), pt(sx * 50, 16), pt(sx * 44, 25), pt(sx * 50, 32), pt(sx * 30, 30), pt(sx * 8, 26)]),
      gold,
      3.5,
    );
    g.moveTo(sx * 14, 19).lineTo(sx * 40, 16).stroke({ width: 1.8, color: 0xfff1c2, alpha: 0.9 });
  };
  wing(-1);
  wing(1);
  part(g, flat([pt(-9, 14), pt(9, 14), pt(7, 30), pt(-7, 30)]), gold, 3.5);

  // Wrapped grip.
  part(g, flat([pt(-5.5, 30), pt(5.5, 30), pt(5, 58), pt(-5, 58)]), vGrad([[0, 0x54301c], [1, 0x241109]], 30, 58), 3.5);
  for (let y = 34; y < 56; y += 6) {
    g.moveTo(-5, y).lineTo(5, y + 3).stroke({ width: 2, color: 0x180b06, alpha: 0.9 });
    g.moveTo(-5, y - 1).lineTo(5, y + 2).stroke({ width: 1, color: 0x8a5a34, alpha: 0.6 });
  }
  // Pommel with dragon-eye gem.
  g.circle(0, 65, 9).fill(gold);
  g.circle(0, 65, 9).stroke({ width: 3, color: OUTLINE });
  g.circle(0, 65, 4.4).fill({ color: PALETTE.garnet });
  g.poly([-1.1, 60.5, 1.1, 60.5, 0.6, 69.5, -0.6, 69.5]).fill({ color: 0x2a060c });
  g.circle(-1.6, 62.8, 1.2).fill({ color: 0xffb3bd });
}
