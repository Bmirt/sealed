/**
 * Asset manifest — the ONLY place the game looks up art and sound.
 *
 * Every entry is either `procedural` (drawn with Pixi Graphics / synthesised with Web Audio at boot)
 * or a file reference. To drop in real art later, change the entry to `{ kind: 'texture', url }`
 * (or `{ kind: 'file', url }` for audio) — nothing in src/game or src/state needs to change.
 */
import type { Graphics } from 'pixi.js';
import type { SymbolId } from '@math/types';
import { drawAshDragon, drawEmeraldDragon, drawGoldDragon } from './procedural/dragons';
import { drawBlade, drawCrown } from './procedural/items';
import { SYMBOL_H, SYMBOL_W } from './procedural/metrics';
import { drawFlameSigil, drawKrakenSigil, drawRoseSigil, drawWolfSigil } from './procedural/sigils';
import { drawDragonEgg, drawMoltenThrone } from './procedural/special';
import { drawTile } from './procedural/tile';
import type { TileRim } from './procedural/tile';

export interface ProceduralVisual {
  readonly kind: 'procedural';
  readonly width: number;
  readonly height: number;
  /** Draw centred on (0,0). */
  readonly paint: (g: Graphics) => void;
}

export interface TextureVisual {
  readonly kind: 'texture';
  readonly url: string;
  readonly width: number;
  readonly height: number;
}

export type VisualAsset = ProceduralVisual | TextureVisual;

function symbol(rim: TileRim, seed: number, art: (g: Graphics) => void): ProceduralVisual {
  return {
    kind: 'procedural',
    width: SYMBOL_W,
    height: SYMBOL_H,
    paint: (g) => {
      drawTile(g, rim, seed);
      art(g);
    },
  };
}

export const SYMBOL_VISUALS: Readonly<Record<SymbolId, VisualAsset>> = {
  H1: symbol('gold', 1, drawGoldDragon),
  H2: symbol('gold', 2, drawAshDragon),
  H3: symbol('emerald', 3, drawEmeraldDragon),
  M1: symbol('dimgold', 4, drawCrown),
  M2: symbol('dimgold', 5, drawBlade),
  L1: symbol('ash', 6, drawFlameSigil),
  L2: symbol('ash', 7, drawWolfSigil),
  L3: symbol('ash', 8, drawKrakenSigil),
  L4: symbol('ash', 9, drawRoseSigil),
  W: symbol('lava', 10, drawMoltenThrone),
  S: symbol('garnet', 11, drawDragonEgg),
};

/** Display copy for the paytable / info screens. */
export const SYMBOL_COPY: Readonly<Record<SymbolId, { readonly title: string; readonly blurb: string }>> = {
  H1: { title: 'Gold Dragon', blurb: 'Sigil of House Vaelor. The eldest wyrm of the keep.' },
  H2: { title: 'Ash Dragon', blurb: 'Sigil of House Cindrath. It breathes smoke before fire.' },
  H3: { title: 'Emerald Dragon', blurb: 'Sigil of House Myrrowen. Hunts beneath the night sky.' },
  M1: { title: 'Obsidian Crown', blurb: 'Cut from volcanic glass for a dynasty that never cooled.' },
  M2: { title: 'Ancestral Blade', blurb: 'Forged in the first eruption. Still warm.' },
  L1: { title: 'Flame Sigil', blurb: 'Carved stone. The mark of the forge-wardens.' },
  L2: { title: 'Wolf Sigil', blurb: 'Carved stone. The mark of the night-watch.' },
  L3: { title: 'Kraken Sigil', blurb: 'Carved stone. The mark of the black-water fleet.' },
  L4: { title: 'Rose Sigil', blurb: 'Carved stone. The mark of the ash-gardeners.' },
  W: { title: 'The Molten Throne', blurb: 'WILD. Substitutes for every symbol except the Dragon Egg. Burns a fire trail when it lands.' },
  S: { title: 'Dragon Egg', blurb: 'SCATTER. 3, 4 or 5 anywhere award 10, 15 or 20 Dragonfire Free Spins.' },
};

/* Audio entries are added in stage 5 (synth recipes → Howler). */
