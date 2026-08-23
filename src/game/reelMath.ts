/**
 * Pure helpers behind ReelView, kept separate so they can be unit-tested without WebGL.
 * A reel at continuous position `pos` shows strip index floor(pos)+k at row k (k may be −1 for the
 * buffer symbol above the window). Decreasing `pos` moves symbols down the screen.
 */
export function stripIndexAt(pos: number, rowOffset: number, stripLength: number): number {
  const i = Math.floor(pos) + rowOffset;
  return ((i % stripLength) + stripLength) % stripLength;
}

/** Vertical offset (in symbol heights) of row `rowOffset` for position `pos`. */
export function rowY(pos: number, rowOffset: number): number {
  const frac = pos - Math.floor(pos);
  return rowOffset - frac;
}

/**
 * Position a reel must travel to, spinning DOWN from `from`, to land on `stop` after at least
 * `minTurns` full strip revolutions. Result ≤ from; (result mod len) === stop.
 */
export function landingPosition(from: number, stop: number, stripLength: number, minTurns: number): number {
  const len = stripLength;
  const fromMod = ((from % len) + len) % len;
  // Distance (downwards = decreasing pos) from fromMod to stop.
  let delta = fromMod - stop;
  if (delta <= 0) delta += len;
  return from - delta - minTurns * len;
}
