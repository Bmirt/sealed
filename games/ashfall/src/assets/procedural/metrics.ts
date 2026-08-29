/** Symbol cell metrics in design-space pixels. Everything in the reels derives from these. */
export const SYMBOL_W = 190;
export const SYMBOL_H = 170;
export const TILE_INSET = 6;
export const TILE_RADIUS = 16;
export const TILE_W = SYMBOL_W - TILE_INSET * 2;
export const TILE_H = SYMBOL_H - TILE_INSET * 2;
/** Centre of the symbol cell (painters draw around 0,0 and are offset by this). */
export const SYMBOL_CX = SYMBOL_W / 2;
export const SYMBOL_CY = SYMBOL_H / 2;
