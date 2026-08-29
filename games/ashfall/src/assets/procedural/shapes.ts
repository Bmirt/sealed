/**
 * Small geometry helpers for the procedural painters. Pure functions → point lists.
 */
export interface Pt {
  readonly x: number;
  readonly y: number;
}

export type Poly = number[]; // flat [x0, y0, x1, y1, …] for Graphics.poly()

export const pt = (x: number, y: number): Pt => ({ x, y });

export function quad(p0: Pt, c: Pt, p1: Pt, t: number): Pt {
  const mt = 1 - t;
  return {
    x: mt * mt * p0.x + 2 * mt * t * c.x + t * t * p1.x,
    y: mt * mt * p0.y + 2 * mt * t * c.y + t * t * p1.y,
  };
}

export function cubic(p0: Pt, c0: Pt, c1: Pt, p1: Pt, t: number): Pt {
  const mt = 1 - t;
  const a = mt * mt * mt;
  const b = 3 * mt * mt * t;
  const c = 3 * mt * t * t;
  const d = t * t * t;
  return {
    x: a * p0.x + b * c0.x + c * c1.x + d * p1.x,
    y: a * p0.y + b * c0.y + c * c1.y + d * p1.y,
  };
}

/**
 * A tapered ribbon along a quadratic or cubic curve: width w0 at the start → w1 at the end.
 * Returns a closed polygon (one side forward, the other back). Used for necks, tails, horns, tentacles.
 */
export function ribbon(
  curve: { readonly p0: Pt; readonly c0: Pt; readonly c1?: Pt; readonly p1: Pt },
  w0: number,
  w1: number,
  steps = 14,
  ease: (t: number) => number = (t) => t,
): Poly {
  const left: Pt[] = [];
  const right: Pt[] = [];
  const at = (t: number): Pt => (curve.c1 ? cubic(curve.p0, curve.c0, curve.c1, curve.p1, t) : quad(curve.p0, curve.c0, curve.p1, t));
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const p = at(t);
    const q = at(Math.min(1, t + 0.01));
    const r = at(Math.max(0, t - 0.01));
    let dx = q.x - r.x;
    let dy = q.y - r.y;
    const len = Math.hypot(dx, dy) || 1;
    dx /= len;
    dy /= len;
    const w = (w0 + (w1 - w0) * ease(t)) / 2;
    left.push({ x: p.x - dy * w, y: p.y + dx * w });
    right.push({ x: p.x + dy * w, y: p.y - dx * w });
  }
  const out: Poly = [];
  for (const p of left) out.push(p.x, p.y);
  for (let i = right.length - 1; i >= 0; i--) {
    const p = right[i];
    if (p) out.push(p.x, p.y);
  }
  return out;
}

/** Flatten a point list. */
export function flat(points: readonly Pt[]): Poly {
  const out: Poly = [];
  for (const p of points) out.push(p.x, p.y);
  return out;
}

/** Translate + scale a flat polygon. */
export function xform(poly: Poly, dx: number, dy: number, s = 1, mirrorX = false): Poly {
  const out: Poly = [];
  for (let i = 0; i < poly.length; i += 2) {
    const x = poly[i] ?? 0;
    const y = poly[i + 1] ?? 0;
    out.push((mirrorX ? -x : x) * s + dx, y * s + dy);
  }
  return out;
}

/** A regular star polygon (for sparks / gems). */
export function star(cx: number, cy: number, points: number, outer: number, inner: number, rotation = 0): Poly {
  const out: Poly = [];
  for (let i = 0; i < points * 2; i++) {
    const r = i % 2 === 0 ? outer : inner;
    const a = rotation + (i * Math.PI) / points;
    out.push(cx + Math.cos(a) * r, cy + Math.sin(a) * r);
  }
  return out;
}

/** Deterministic tiny PRNG for decorative jitter (cracks, ember positions). */
export function jitter(seed: number): () => number {
  let s = seed >>> 0 || 1;
  return () => {
    s ^= s << 13;
    s >>>= 0;
    s ^= s >>> 17;
    s ^= s << 5;
    s >>>= 0;
    return s / 4294967296;
  };
}
