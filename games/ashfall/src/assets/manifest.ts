/**
 * Asset manifest - the ONLY place the game looks up art and sound.
 *
 * Every entry is either `procedural` (drawn with Pixi Graphics / synthesised with Web Audio at boot)
 * or a file reference. To drop in real art later, change the entry to `{ kind: 'texture', url }`
 * (or `{ kind: 'file', url }` for audio) - nothing in src/game or src/state needs to change.
 */
import type { Graphics } from 'pixi.js';
import type { SymbolId } from '@math/types';
import { drawAshDragon, drawEmeraldDragon, drawGoldDragon } from './procedural/dragons';
import { drawBlade, drawCrown } from './procedural/items';
import { SYMBOL_H, SYMBOL_W } from './procedural/metrics';
import { drawFlameSigil, drawKrakenSigil, drawRoseSigil, drawWolfSigil } from './procedural/sigils';
import { drawDragonEgg, drawMoltenThrone } from './procedural/special';

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

/**
 * Symbols are floating emblems (bold outline, layered shading, baked drop shadow) - no tile
 * backing; the reel well draws the cell slots. `scale` fits each emblem's art box to the cell.
 */
function symbol(art: (g: Graphics) => void, scale = 1): ProceduralVisual {
  return {
    kind: 'procedural',
    width: SYMBOL_W,
    height: SYMBOL_H,
    paint: (g) => {
      art(g);
      if (scale !== 1) g.scale.set(scale);
    },
  };
}

export const SYMBOL_VISUALS: Readonly<Record<SymbolId, VisualAsset>> = {
  H1: symbol(drawGoldDragon),
  H2: symbol(drawAshDragon),
  H3: symbol(drawEmeraldDragon),
  M1: symbol(drawCrown),
  M2: symbol(drawBlade),
  L1: symbol(drawFlameSigil, 0.92),
  L2: symbol(drawWolfSigil, 0.92),
  L3: symbol(drawKrakenSigil, 0.92),
  L4: symbol(drawRoseSigil, 0.92),
  W: symbol(drawMoltenThrone),
  S: symbol(drawDragonEgg),
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
