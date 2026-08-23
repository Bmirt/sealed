/** Inline SVG glyphs (original, minimal). Paths only — wrapped by ui/dom.icon(). */
export const ICONS = {
  spin: '<path d="M12 4a8 8 0 1 1-7.4 5" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"/><path d="M4 3v6h6" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/>',
  bolt: '<path d="M13 2 4 14h7l-1 8 9-12h-7l1-8z" fill="currentColor"/>',
  bolt2: '<path d="M9 2 2 13h5l-1 7 7-10H8l1-8z" fill="currentColor"/><path d="M19 4l-5 8h4l-1 6 6-9h-4l0-5z" fill="currentColor" opacity=".8"/>',
  bolt3: '<path d="M7 2 1 12h4l-1 7 6-9H6l1-8z" fill="currentColor"/><path d="M14 2 8 12h4l-1 7 6-9h-4l1-8z" fill="currentColor" opacity=".85"/><path d="M21 3l-5 8h4l-1 6 5-8h-3l0-6z" fill="currentColor" opacity=".7"/>',
  auto: '<path d="M12 4a8 8 0 1 0 8 8" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/><path d="M10 8.5v7l6-3.5z" fill="currentColor"/><path d="M20 4v5h-5" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/>',
  sound: '<path d="M4 9v6h4l5 4V5L8 9z" fill="currentColor"/><path d="M16 8.5a5 5 0 0 1 0 7M18.5 6a8.5 8.5 0 0 1 0 12" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>',
  mute: '<path d="M4 9v6h4l5 4V5L8 9z" fill="currentColor"/><path d="M16 9l5 6M21 9l-5 6" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/>',
  gear: '<path d="M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8z" fill="none" stroke="currentColor" stroke-width="2"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3M4.9 4.9l2.1 2.1M17 17l2.1 2.1M4.9 19.1 7 17M17 7l2.1-2.1" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/>',
  info: '<circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" stroke-width="2"/><path d="M12 11v6" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"/><circle cx="12" cy="7.6" r="1.4" fill="currentColor"/>',
  minus: '<path d="M6 12h12" stroke="currentColor" stroke-width="2.6" stroke-linecap="round"/>',
  plus: '<path d="M12 6v12M6 12h12" stroke="currentColor" stroke-width="2.6" stroke-linecap="round"/>',
  egg: '<path d="M12 2C8 2 5 8 5 13a7 7 0 0 0 14 0c0-5-3-11-7-11z" fill="currentColor"/><path d="M11 8l1.5 3-1 2 1.5 3" fill="none" stroke="#0b0a0d" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"/>',
  close: '<path d="M6 6l12 12M18 6 6 18" stroke="currentColor" stroke-width="2.6" stroke-linecap="round"/>',
  stop: '<rect x="6" y="6" width="12" height="12" rx="2" fill="currentColor"/>',
} as const;
