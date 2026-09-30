import { Container, FillGradient, Graphics } from 'pixi.js';
import { PALETTE, rgba } from '@config/palette';
import { jitter } from './shapes';

export type BackgroundVariant = 'base' | 'free';

export interface BackgroundLayers {
  readonly root: Container;
  readonly width: number;
  readonly height: number;
  /** Lava glow at the bottom - animated (flicker) from stage 5. */
  readonly lavaGlow: Graphics;
  /** Distant keep silhouette - a dragon passes behind it later. */
  readonly keep: Graphics;
  readonly sky: Graphics;
  /** Volcano mouth centre (for ember emitters). */
  readonly volcanoMouth: { readonly x: number; readonly y: number };
}

/**
 * Volcanic keep backdrop, composed for a given box (landscape 1600×900 or portrait 900×1600).
 * Base: ember-lit smoke sky, lava horizon. Free: cold indigo night sky with stars and a moon,
 * the keep backlit, lava still glowing below.
 */
export function buildBackground(variant: BackgroundVariant, W: number, H: number): BackgroundLayers {
  const root = new Container();
  const isFree = variant === 'free';
  const portrait = H > W;
  const horizon = portrait ? H * 0.46 : H * 0.58;

  // Sky.
  const sky = new Graphics();
  sky.rect(0, 0, W, H).fill(
    new FillGradient({
      type: 'linear',
      start: { x: 0, y: 0 },
      end: { x: 0, y: H },
      colorStops: isFree
        ? [
            { offset: 0, color: 0x0a0e1e },
            { offset: 0.45, color: 0x1b2348 },
            { offset: 0.75, color: 0x3a2a4a },
            { offset: 1, color: 0x5a2418 },
          ]
        : [
            { offset: 0, color: 0x120c12 },
            { offset: 0.45, color: 0x2a1418 },
            { offset: 0.75, color: 0x5a2014 },
            { offset: 1, color: 0x8a2e10 },
          ],
      textureSpace: 'global',
    }),
  );
  root.addChild(sky);

  const rnd = jitter(isFree ? 31 : 17);

  if (isFree) {
    const stars = new Graphics();
    for (let i = 0; i < 180; i++) {
      const x = rnd() * W;
      const y = rnd() * horizon;
      stars.circle(x, y, 0.6 + rnd() * 1.6).fill({ color: PALETTE.starlight, alpha: 0.35 + rnd() * 0.6 });
    }
    const mx = portrait ? W * 0.72 : W * 0.74;
    const my = portrait ? H * 0.12 : H * 0.17;
    stars.circle(mx, my, 120).fill({ color: PALETTE.starlight, alpha: 0.05 });
    stars.circle(mx, my, 80).fill({ color: PALETTE.starlight, alpha: 0.08 });
    stars.circle(mx, my, 54).fill({ color: 0xe8ecff, alpha: 0.95 });
    root.addChild(stars);
  } else {
    const smoke = new Graphics();
    for (let i = 0; i < 6; i++) {
      const y = H * 0.08 + i * H * 0.12 + rnd() * 40;
      smoke.ellipse(rnd() * W, y, W * 0.3 + rnd() * W * 0.25, 40 + rnd() * 30).fill({ color: 0x2a1d22, alpha: 0.18 });
    }
    root.addChild(smoke);
  }

  // Far mountains.
  const mountains = new Graphics();
  const ridge: number[] = [0, H];
  let x = 0;
  while (x < W) {
    ridge.push(x, horizon - 40 + Math.sin(x / 140) * 40 + rnd() * 60);
    x += 60 + rnd() * 80;
  }
  ridge.push(W, horizon, W, H);
  mountains.poly(ridge).fill({ color: isFree ? 0x0f1328 : 0x1c1016 });
  root.addChild(mountains);

  // The keep: towers on a crag. Authored in a 600-wide local box, then placed per orientation.
  const keep = new Graphics();
  const keepColor = isFree ? 0x070912 : 0x0c0709;
  const tower = (cx: number, base: number, w: number, h: number): void => {
    keep.rect(cx - w / 2, base - h, w, h).fill({ color: keepColor });
    for (let i = -w / 2; i < w / 2; i += 14) keep.rect(cx + i, base - h - 10, 8, 10).fill({ color: keepColor });
    for (let y = base - h + 24; y < base - 20; y += 34) {
      keep.rect(cx - 2, y, 4, 10).fill({ color: isFree ? 0x3b4a7a : PALETTE.ember, alpha: isFree ? 0.6 : 0.75 });
    }
  };
  keep.poly([0, 400, 60, 260, 170, 220, 320, 200, 460, 230, 560, 300, 600, 400]).fill({ color: keepColor });
  tower(170, 240, 70, 190);
  tower(260, 220, 56, 260);
  tower(340, 210, 90, 210);
  tower(430, 240, 60, 170);
  keep.rect(180, 170, 240, 80).fill({ color: keepColor });
  for (let i = 180; i < 420; i += 16) keep.rect(i, 160, 9, 10).fill({ color: keepColor });
  keep.poly([310, 0, 290, 220, 330, 220]).fill({ color: keepColor });
  keep.circle(310, 0, 4).fill({ color: isFree ? PALETTE.starlight : PALETTE.ember, alpha: 0.9 });
  keep.rect(0, 400, 600, 2000).fill({ color: keepColor }); // crag continues to the bottom
  if (portrait) {
    keep.scale.set(0.62);
    keep.position.set(-60, horizon - 400 * 0.62 + 60);
  } else {
    keep.scale.set(0.72);
    keep.position.set(-40, horizon - 400 * 0.72 + 90);
  }
  root.addChild(keep);

  // Volcano on the right with a glowing mouth.
  const vx = portrait ? W * 0.86 : W * 0.79;
  const vy = portrait ? horizon - 140 : horizon - 120;
  const volcano = new Graphics();
  volcano.poly([vx - 260, H, vx - 80, vy + 20, vx, vy, vx + 80, vy + 30, vx + 340, vy + 220, vx + 340, H]).fill({ color: isFree ? 0x0b0d1a : 0x140b0d });
  volcano.ellipse(vx, vy + 4, 60, 10).fill({ color: PALETTE.lava, alpha: 0.9 });
  volcano.ellipse(vx, vy + 4, 100, 26).fill({ color: PALETTE.ember, alpha: 0.25 });
  volcano.moveTo(vx - 10, vy + 10).quadraticCurveTo(vx - 30, vy + 120, vx - 80, vy + 240).stroke({ width: 4, color: PALETTE.lava, alpha: 0.7 });
  volcano.moveTo(vx + 20, vy + 12).quadraticCurveTo(vx + 70, vy + 120, vx + 140, vy + 240).stroke({ width: 3, color: PALETTE.ember, alpha: 0.6 });
  root.addChild(volcano);

  // Ember haze.
  const haze = new Graphics();
  haze.circle(vx, vy + 20, 220).fill({ color: PALETTE.ember, alpha: isFree ? 0.08 : 0.14 });
  haze.circle(vx, vy + 20, 120).fill({ color: PALETTE.lava, alpha: isFree ? 0.08 : 0.12 });
  haze.circle(W * 0.12, horizon, 200).fill({ color: isFree ? PALETTE.starlight : PALETTE.ember, alpha: 0.06 });
  root.addChild(haze);

  // Lava glow at the bottom (animated later).
  const lavaGlow = new Graphics();
  const glowH = portrait ? H * 0.25 : 320;
  lavaGlow.rect(0, H - glowH, W, glowH).fill(
    new FillGradient({
      type: 'linear',
      start: { x: 0, y: H - glowH },
      end: { x: 0, y: H },
      colorStops: [
        { offset: 0, color: rgba(PALETTE.lava, 0) },
        { offset: 0.6, color: rgba(PALETTE.ember, 0.28) },
        { offset: 1, color: rgba(PALETTE.goldHi, 0.55) },
      ],
      textureSpace: 'global',
    }),
  );
  root.addChild(lavaGlow);

  // Vignette.
  const vignette = new Graphics();
  vignette.rect(0, 0, W, H).fill(
    new FillGradient({
      type: 'radial',
      center: { x: 0.5, y: 0.45 },
      innerRadius: 0.35,
      outerCenter: { x: 0.5, y: 0.45 },
      outerRadius: 0.95,
      colorStops: [
        { offset: 0, color: rgba(PALETTE.black, 0) },
        { offset: 1, color: rgba(PALETTE.black, 0.5) },
      ],
      textureSpace: 'local',
    }),
  );
  root.addChild(vignette);

  return { root, width: W, height: H, lavaGlow, keep, sky, volcanoMouth: { x: vx, y: vy } };
}
