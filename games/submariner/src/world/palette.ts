import * as THREE from 'three';

/** World units per metre of depth. The sub descends ~27 m/s, so ~1.6 units/s. */
export const WORLD_PER_METRE = 0.06;
/** World Y of the water surface (the sub rests just under it while boarding). */
export const SURFACE_Y = 2.6;

type Stop = { depth: number; water: number; fog: number; light: number };

/**
 * Water colour, fog density and sunlight by depth. The key idea of the art direction: the sea
 * itself is the progress bar. Turquoise at the surface, blue, then ink, then a warm-black abyss
 * where only the sub's own light and the creatures' bioluminescence remain.
 */
const STOPS: Stop[] = [
  { depth: 0, water: 0x1a9fbf, fog: 0.018, light: 1 },
  { depth: 60, water: 0x14809f, fog: 0.022, light: 0.85 },
  { depth: 150, water: 0x0d5a82, fog: 0.028, light: 0.55 },
  { depth: 400, water: 0x07345a, fog: 0.034, light: 0.25 },
  { depth: 600, water: 0x041d38, fog: 0.04, light: 0.1 },
  { depth: 1000, water: 0x020c1d, fog: 0.045, light: 0.03 },
  { depth: 1300, water: 0x07030d, fog: 0.048, light: 0.0 },
  { depth: 2000, water: 0x0d0306, fog: 0.05, light: 0.0 },
];

const a = new THREE.Color();
const b = new THREE.Color();

export interface DepthLook {
  water: THREE.Color;
  fog: number;
  /** 0..1 sunlight reaching this depth. */
  sun: number;
  /** 0..1 how much the sub's searchlight dominates (dark water). */
  dark: number;
}

export function depthLook(depth: number, out: DepthLook): DepthLook {
  let i = 0;
  while (i < STOPS.length - 2 && depth > STOPS[i + 1]!.depth) i++;
  const s0 = STOPS[i]!;
  const s1 = STOPS[i + 1]!;
  const t = THREE.MathUtils.clamp((depth - s0.depth) / (s1.depth - s0.depth), 0, 1);
  a.setHex(s0.water);
  b.setHex(s1.water);
  out.water.copy(a).lerp(b, t);
  out.fog = THREE.MathUtils.lerp(s0.fog, s1.fog, t);
  out.sun = THREE.MathUtils.lerp(s0.light, s1.light, t);
  out.dark = 1 - THREE.MathUtils.smoothstep(out.sun, 0, 0.6);
  return out;
}

export const newLook = (): DepthLook => ({ water: new THREE.Color(), fog: 0, sun: 1, dark: 0 });

/** Shared material roles (technical-art: name roles, reuse them everywhere). */
export function createMaterials() {
  return {
    hullPaint: new THREE.MeshPhysicalMaterial({ color: 0xe8561a, metalness: 0.2, roughness: 0.45, clearcoat: 0.6, clearcoatRoughness: 0.3, envMapIntensity: 0.6 }),
    hullWhite: new THREE.MeshPhysicalMaterial({ color: 0xd9dee2, metalness: 0.1, roughness: 0.42, clearcoat: 0.5, clearcoatRoughness: 0.3, envMapIntensity: 0.6 }),
    steel: new THREE.MeshStandardMaterial({ color: 0x5c6670, metalness: 0.85, roughness: 0.38 }),
    darkSteel: new THREE.MeshStandardMaterial({ color: 0x23282e, metalness: 0.7, roughness: 0.55 }),
    brass: new THREE.MeshStandardMaterial({ color: 0xc9a14a, metalness: 1, roughness: 0.3 }),
    rubber: new THREE.MeshStandardMaterial({ color: 0x111316, metalness: 0, roughness: 0.9 }),
    trim: new THREE.MeshStandardMaterial({ color: 0x2a2f36, metalness: 0.6, roughness: 0.5 }),
    hazard: new THREE.MeshStandardMaterial({ color: 0x111111, emissive: 0xff3b2f, emissiveIntensity: 0, roughness: 0.4 }),
    portGlass: new THREE.MeshStandardMaterial({ color: 0x1b2a33, emissive: 0xffc56b, emissiveIntensity: 1.25, roughness: 0.15, metalness: 0 }),
    domeGlass: new THREE.MeshPhysicalMaterial({
      color: 0x9fe8ff, metalness: 0, roughness: 0.05, transparent: true, opacity: 0.35, clearcoat: 1, depthWrite: false,
      emissive: 0x2fb8d8, emissiveIntensity: 0.35,
    }),
    lamp: new THREE.MeshStandardMaterial({ color: 0x222222, emissive: 0xfff3d1, emissiveIntensity: 3, roughness: 0.2 }),
    rock: new THREE.MeshStandardMaterial({ color: 0x4b5a63, roughness: 0.95, metalness: 0, flatShading: true, vertexColors: true }),
    kelp: new THREE.MeshStandardMaterial({ color: 0x5f8f3a, roughness: 0.8, side: THREE.DoubleSide }),
    buoy: new THREE.MeshStandardMaterial({ color: 0xff7a1a, roughness: 0.45, metalness: 0.1 }),
    cable: new THREE.MeshStandardMaterial({ color: 0x1b1f24, roughness: 0.7, metalness: 0.4 }),
  };
}
export type Materials = ReturnType<typeof createMaterials>;

/** Canvas texture helper for labels, gradients and decals. */
export function canvasTexture(w: number, h: number, draw: (g: CanvasRenderingContext2D) => void): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  draw(c.getContext('2d')!);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

/** Soft radial glow sprite texture (shared by lures, lamps, jellies). */
let glow: THREE.Texture | null = null;
export function glowTexture(): THREE.Texture {
  glow ??= canvasTexture(128, 128, (g) => {
    const grad = g.createRadialGradient(64, 64, 0, 64, 64, 64);
    grad.addColorStop(0, 'rgba(255,255,255,1)');
    grad.addColorStop(0.25, 'rgba(255,255,255,0.55)');
    grad.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = grad;
    g.fillRect(0, 0, 128, 128);
  });
  return glow;
}
