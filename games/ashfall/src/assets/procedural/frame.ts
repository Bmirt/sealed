import { Container, FillGradient, Graphics, Text, TextStyle } from 'pixi.js';
import { PALETTE } from '@config/palette';
import { DISPLAY_FONT } from '@config/typography';
import { flat, pt } from './shapes';

export const FRAME_THICKNESS = 26;

export interface FrameParts {
  readonly root: Container;
  /** Title plaque + text - hidden while the feature HUD takes its place. */
  readonly plaque: Container;
}

/**
 * The stone reel frame: bevelled basalt with a molten-gold inlay, claw ornaments on the corners
 * and a title plaque on top. Drawn around a reel window of `w × h` whose top-left is (0,0).
 */
export function buildFrame(w: number, h: number): FrameParts {
  const root = new Container();
  const t = FRAME_THICKNESS;
  const g = new Graphics();

  // The frame is a ring: every covering shape is cut by the reel window so the reels show through.
  const hole = (): void => {
    g.rect(0, 0, w, h).cut();
  };

  // Outer drop shadow.
  g.roundRect(-t - 10, -t - 6, w + t * 2 + 20, h + t * 2 + 26, 22).fill({ color: PALETTE.black, alpha: 0.55 });
  hole();

  // Stone body.
  const stone = new FillGradient({
    type: 'linear',
    start: { x: 0, y: -t },
    end: { x: 0, y: h + t },
    colorStops: [
      { offset: 0, color: PALETTE.stoneLight },
      { offset: 0.5, color: PALETTE.stone },
      { offset: 1, color: PALETTE.obsidian2 },
    ],
    textureSpace: 'global',
  });
  g.roundRect(-t, -t, w + t * 2, h + t * 2, 18).fill(stone);
  hole();
  g.roundRect(-t + 2, -t + 2, w + t * 2 - 4, h + t * 2 - 4, 16).stroke({ width: 2, color: 0x4a4654, alpha: 0.9 });
  // Inner edge (dark lip where the reels sit).
  g.roundRect(-5, -5, w + 10, h + 10, 6).stroke({ width: 4, color: PALETTE.black, alpha: 0.85 });

  // Gold inlay line.
  g.roundRect(-t / 2, -t / 2, w + t, h + t, 12).stroke({ width: 3, color: PALETTE.gold, alpha: 0.85 });
  g.roundRect(-t / 2 - 3, -t / 2 - 3, w + t + 6, h + t + 6, 14).stroke({ width: 1, color: PALETTE.goldDeep, alpha: 0.6 });

  // Rivets along the inlay.
  const step = 95;
  for (let x = -t / 2 + step / 2; x < w + t / 2; x += step) {
    for (const y of [-t / 2, h + t / 2]) {
      g.circle(x, y, 4).fill({ color: PALETTE.goldDeep });
      g.circle(x - 1, y - 1, 1.6).fill({ color: PALETTE.goldHi });
    }
  }
  for (let y = -t / 2 + step / 2; y < h + t / 2; y += step) {
    for (const x of [-t / 2, w + t / 2]) {
      g.circle(x, y, 4).fill({ color: PALETTE.goldDeep });
      g.circle(x - 1, y - 1, 1.6).fill({ color: PALETTE.goldHi });
    }
  }

  // Corner claws.
  const claw = (cx: number, cy: number, sx: number, sy: number): void => {
    const p = flat([pt(0, 0), pt(26, 4), pt(40, 22), pt(30, 18), pt(22, 30), pt(18, 18), pt(4, 26)]);
    const poly: number[] = [];
    for (let i = 0; i < p.length; i += 2) poly.push(cx + (p[i] ?? 0) * sx, cy + (p[i + 1] ?? 0) * sy);
    g.poly(poly).fill({ color: PALETTE.goldDeep });
    g.poly(poly).stroke({ width: 1.2, color: PALETTE.goldHi, alpha: 0.8 });
  };
  claw(-t - 4, -t - 4, 1, 1);
  claw(w + t + 4, -t - 4, -1, 1);
  claw(-t - 4, h + t + 4, 1, -1);
  claw(w + t + 4, h + t + 4, -1, -1);

  root.addChild(g);

  // Title plaque.
  const plaqueRoot = new Container();
  const plaqueW = 520;
  const plaqueH = 64;
  const px = w / 2 - plaqueW / 2;
  const py = -t - plaqueH + 6;
  const plaque = new Graphics();
  plaque.roundRect(px + 4, py + 6, plaqueW, plaqueH, 10).fill({ color: PALETTE.black, alpha: 0.5 });
  plaque.poly([px, py + 10, px + 14, py, px + plaqueW - 14, py, px + plaqueW, py + 10, px + plaqueW, py + plaqueH - 10, px + plaqueW - 14, py + plaqueH, px + 14, py + plaqueH, px, py + plaqueH - 10]).fill({ color: PALETTE.stone });
  plaque.poly([px, py + 10, px + 14, py, px + plaqueW - 14, py, px + plaqueW, py + 10, px + plaqueW, py + plaqueH - 10, px + plaqueW - 14, py + plaqueH, px + 14, py + plaqueH, px, py + plaqueH - 10]).stroke({ width: 2, color: PALETTE.gold, alpha: 0.9 });
  plaqueRoot.addChild(plaque);

  const title = new Text({
    text: 'ASHFALL DYNASTY',
    style: new TextStyle({
      fontFamily: DISPLAY_FONT,
      fontSize: 34,
      fontWeight: '700',
      letterSpacing: 8,
      fill: { fill: new FillGradient({ type: 'linear', start: { x: 0, y: 0 }, end: { x: 0, y: 1 }, colorStops: [{ offset: 0, color: PALETTE.goldHi }, { offset: 1, color: PALETTE.goldDeep }], textureSpace: 'local' }) },
      stroke: { color: PALETTE.black, width: 3 },
      dropShadow: { color: PALETTE.black, blur: 4, distance: 2, alpha: 0.8 },
    }),
  });
  title.anchor.set(0.5);
  title.position.set(w / 2 + 4, py + plaqueH / 2 + 2);
  plaqueRoot.addChild(title);
  root.addChild(plaqueRoot);

  return { root, plaque: plaqueRoot };
}
