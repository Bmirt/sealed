import type { Graphics } from 'pixi.js';
import { FillGradient } from 'pixi.js';
import { PALETTE } from '@config/palette';
import { TILE_H, TILE_RADIUS, TILE_W } from './metrics';
import { jitter } from './shapes';

export type TileRim = 'gold' | 'dimgold' | 'ash' | 'lava' | 'garnet' | 'emerald';

const RIM: Record<TileRim, { outer: number; inner: number; glow: number }> = {
  gold: { outer: PALETTE.gold, inner: PALETTE.goldDeep, glow: PALETTE.gold },
  dimgold: { outer: PALETTE.goldDeep, inner: 0x6e4a10, glow: PALETTE.goldDeep },
  ash: { outer: PALETTE.ashDark, inner: PALETTE.stoneEdge, glow: PALETTE.ashDark },
  lava: { outer: PALETTE.ember, inner: PALETTE.emberDeep, glow: PALETTE.lava },
  garnet: { outer: PALETTE.garnet, inner: 0x5a1119, glow: PALETTE.garnet },
  emerald: { outer: PALETTE.emerald, inner: PALETTE.emeraldDeep, glow: PALETTE.emerald },
};

/**
 * The carved stone tile every symbol sits on. Drawn centred on (0,0).
 * Bevelled edge (light top-left, dark bottom-right), inner recessed panel, faint cracks, tier rim.
 */
export function drawTile(g: Graphics, rim: TileRim, seed = 1): Graphics {
  const w = TILE_W;
  const h = TILE_H;
  const x = -w / 2;
  const y = -h / 2;
  const r = TILE_RADIUS;

  // Outer glow for rim colour (subtle).
  g.roundRect(x - 3, y - 3, w + 6, h + 6, r + 3).fill({ color: RIM[rim].glow, alpha: 0.18 });

  // Base stone with vertical gradient.
  const base = new FillGradient({
    type: 'linear',
    start: { x: 0, y: 0 },
    end: { x: 0, y: 1 },
    colorStops: [
      { offset: 0, color: PALETTE.stoneLight },
      { offset: 0.55, color: PALETTE.stone },
      { offset: 1, color: PALETTE.obsidian2 },
    ],
    textureSpace: 'local',
  });
  g.roundRect(x, y, w, h, r).fill(base);

  // Bevel: light top-left edge, dark bottom-right edge.
  g.roundRect(x + 1.5, y + 1.5, w - 3, h - 3, r - 1).stroke({ width: 3, color: PALETTE.stoneEdge, alpha: 0.9 });
  g.moveTo(x + r, y + 2).lineTo(x + w - r, y + 2).stroke({ width: 2, color: 0x4a4654, alpha: 0.8 });
  g.moveTo(x + 2, y + r).lineTo(x + 2, y + h - r).stroke({ width: 2, color: 0x4a4654, alpha: 0.6 });
  g.moveTo(x + r, y + h - 2).lineTo(x + w - r, y + h - 2).stroke({ width: 2, color: PALETTE.black, alpha: 0.6 });
  g.moveTo(x + w - 2, y + r).lineTo(x + w - 2, y + h - r).stroke({ width: 2, color: PALETTE.black, alpha: 0.5 });

  // Inner recessed panel.
  const inset = 12;
  g.roundRect(x + inset, y + inset, w - inset * 2, h - inset * 2, r - 6).fill({ color: PALETTE.obsidian2, alpha: 0.75 });
  g.roundRect(x + inset, y + inset, w - inset * 2, h - inset * 2, r - 6).stroke({ width: 1.5, color: PALETTE.black, alpha: 0.8 });
  g.roundRect(x + inset + 1, y + inset + 1, w - inset * 2 - 2, h - inset * 2 - 2, r - 7).stroke({ width: 1, color: PALETTE.stoneEdge, alpha: 0.5 });

  // Rim inlay.
  g.roundRect(x + inset - 4, y + inset - 4, w - inset * 2 + 8, h - inset * 2 + 8, r - 4).stroke({ width: 2, color: RIM[rim].outer, alpha: 0.9 });
  g.roundRect(x + inset - 6, y + inset - 6, w - inset * 2 + 12, h - inset * 2 + 12, r - 3).stroke({ width: 1, color: RIM[rim].inner, alpha: 0.7 });

  // Corner rivets.
  for (const [cx, cy] of [
    [x + 9, y + 9],
    [x + w - 9, y + 9],
    [x + 9, y + h - 9],
    [x + w - 9, y + h - 9],
  ] as const) {
    g.circle(cx, cy, 2.6).fill({ color: RIM[rim].inner, alpha: 0.9 });
    g.circle(cx - 0.7, cy - 0.7, 1.1).fill({ color: RIM[rim].outer, alpha: 0.9 });
  }

  // Faint cracks on the outer stone ring.
  const rnd = jitter(seed * 7919 + 13);
  for (let i = 0; i < 3; i++) {
    const side = Math.floor(rnd() * 4);
    let sx = x + 4 + rnd() * (w - 8);
    let sy = y + 4 + rnd() * 6;
    if (side === 1) {
      sx = x + w - 4 - rnd() * 6;
      sy = y + 4 + rnd() * (h - 8);
    } else if (side === 2) {
      sy = y + h - 4 - rnd() * 6;
    } else if (side === 3) {
      sx = x + 4 + rnd() * 6;
      sy = y + 4 + rnd() * (h - 8);
    }
    g.moveTo(sx, sy);
    for (let k = 0; k < 3; k++) {
      sx += (rnd() - 0.5) * 10;
      sy += (rnd() - 0.5) * 10;
      g.lineTo(sx, sy);
    }
    g.stroke({ width: 1, color: PALETTE.black, alpha: 0.5 });
  }
  return g;
}

/** Inner panel bounds (for painters that want to fit content). */
export const PANEL = { x: -TILE_W / 2 + 12, y: -TILE_H / 2 + 12, w: TILE_W - 24, h: TILE_H - 24 } as const;
