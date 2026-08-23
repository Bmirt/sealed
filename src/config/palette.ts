/**
 * "Obsidian & Ember" — the single colour source for Pixi (numbers) and CSS (strings).
 * Keep it small: every colour on screen should come from here.
 */
export const PALETTE = {
  obsidian: 0x0b0a0d,
  obsidian2: 0x141216,
  stone: 0x1d1b22,
  stoneLight: 0x2a2730,
  stoneEdge: 0x3a3642,
  ash: 0x8a8690,
  ashDark: 0x5a5661,
  gold: 0xf2b134,
  goldHi: 0xffd66b,
  goldDeep: 0xb47a18,
  ember: 0xff6a1f,
  emberDeep: 0xc93a0b,
  lava: 0xff3d00,
  garnet: 0x8f1d2c,
  emerald: 0x2ec27e,
  emeraldDeep: 0x156b45,
  emeraldHi: 0x7af0b9,
  indigo: 0x141a33,
  starlight: 0xc9d4ff,
  white: 0xfff4e6,
  black: 0x000000,
} as const;

export type PaletteKey = keyof typeof PALETTE;

export function hex(key: PaletteKey): string {
  return `#${PALETTE[key].toString(16).padStart(6, '0')}`;
}

/** `rgba()` string for a packed colour — gradient colour stops carry alpha this way. */
export function rgba(color: number, alpha: number): string {
  const r = (color >> 16) & 0xff;
  const g = (color >> 8) & 0xff;
  const b = color & 0xff;
  return `rgba(${r},${g},${b},${Math.max(0, Math.min(1, alpha))})`;
}

/** CSS custom properties, injected once at boot so the DOM chrome shares the palette. */
export function paletteCssVars(): string {
  return (Object.keys(PALETTE) as PaletteKey[]).map((k) => `--c-${k}: ${hex(k)};`).join('\n');
}
