import * as THREE from 'three';
import { SURFACE_Y, WORLD_PER_METRE, canvasTexture, type DepthLook, type Materials } from './palette';

const WRAP = 56; // vertical span the wall rocks repeat over, in world units

type RockSlot = { base: THREE.Vector3; scale: THREE.Vector3; rot: THREE.Euler };

/**
 * The canyon the sub descends through. Wall rocks are three displaced-icosahedron variants drawn
 * as instanced meshes; each instance wraps vertically around the camera, so the canyon is endless
 * at any depth for three draw calls. Kelp sways on the shallow ledges and a depth-marker cable
 * with buoys every 100 m gives an in-world scale cue.
 */
export class WorldKit {
  readonly group = new THREE.Group();
  private readonly rocks: { mesh: THREE.InstancedMesh; slots: RockSlot[] }[] = [];
  private readonly rockMat: THREE.MeshStandardMaterial;
  private readonly kelpMat: THREE.MeshStandardMaterial;
  private readonly tmp = new THREE.Matrix4();
  private readonly q = new THREE.Quaternion();
  private readonly v = new THREE.Vector3();
  private readonly shallowRock = new THREE.Color(0x5d6f68);
  private readonly deepRock = new THREE.Color(0x1d2735);
  private readonly abyssRock = new THREE.Color(0x3a1c18);

  constructor(rng: () => number, m: Materials) {
    this.rockMat = m.rock;
    this.kelpMat = m.kelp;
    this.buildRocks(rng);
    this.buildKelp(rng);
    this.buildMarkers(m);
  }

  private buildRocks(rng: () => number): void {
    const variants = [0, 1, 2].map((v) => rockGeometry(v * 17 + 3));
    const perVariant = 64;
    for (const geo of variants) {
      const mesh = new THREE.InstancedMesh(geo, this.rockMat, perVariant);
      mesh.frustumCulled = false;
      const slots: RockSlot[] = [];
      for (let i = 0; i < perVariant; i++) {
        const side = i % 2 === 0 ? -1 : 1;
        const fore = rng() < 0.12; // a few dark foreground rocks frame the shot
        const s = fore ? 0.9 + rng() * 1.1 : 1.6 + rng() * 3.2;
        slots.push({
          base: new THREE.Vector3(
            side * (fore ? 14 + rng() * 3 : 12.5 + rng() * 7),
            rng() * WRAP,
            fore ? 1 + rng() * 2.5 : -4 - rng() * 15,
          ),
          scale: new THREE.Vector3(s * (0.8 + rng() * 0.6), s * (0.7 + rng() * 0.9), s * (0.8 + rng() * 0.5)),
          rot: new THREE.Euler(rng() * 6.28, rng() * 6.28, rng() * 6.28),
        });
      }
      this.rocks.push({ mesh, slots });
      this.group.add(mesh);
    }
  }

  private buildKelp(rng: () => number): void {
    const geo = new THREE.PlaneGeometry(0.42, 7, 1, 12);
    const pos = geo.attributes['position']!;
    for (let i = 0; i < pos.count; i++) {
      const y = pos.getY(i) + 3.5; // 0 at the root, 7 at the tip
      pos.setX(i, pos.getX(i) * (1 - (y / 7) * 0.7) + Math.sin(y * 0.9) * 0.18);
      pos.setY(i, y);
    }
    geo.computeVertexNormals();
    // Wind-sway recipe from the shader cookbook, keyed per instance.
    this.kelpMat.onBeforeCompile = (shader) => {
      shader.uniforms['uTime'] = { value: 0 };
      this.kelpMat.userData['shader'] = shader;
      shader.vertexShader = 'uniform float uTime;\n' + shader.vertexShader.replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
         #ifdef USE_INSTANCING
           float phase = instanceMatrix[3].x * 1.7 + instanceMatrix[3].y;
         #else
           float phase = 0.0;
         #endif
         float h = max(position.y, 0.0) / 7.0;
         transformed.x += sin(uTime * 0.9 + phase) * 0.6 * h * h;
         transformed.z += cos(uTime * 0.7 + phase) * 0.35 * h * h;`,
      );
    };
    this.kelpMat.customProgramCacheKey = () => 'kelp-sway';
    const count = 70;
    const kelp = new THREE.InstancedMesh(geo, this.kelpMat, count);
    const color = new THREE.Color();
    for (let i = 0; i < count; i++) {
      const side = i % 2 === 0 ? -1 : 1;
      const depth = 4 + rng() * 170;
      this.v.set(side * (8.5 + rng() * 5), SURFACE_Y - 1 - depth * WORLD_PER_METRE - 3, -2 - rng() * 12);
      this.q.setFromEuler(new THREE.Euler(0, rng() * 6.28, side * 0.15));
      const s = 0.7 + rng() * 0.8;
      this.tmp.compose(this.v, this.q, new THREE.Vector3(s, s * (0.8 + rng() * 0.6), s));
      kelp.setMatrixAt(i, this.tmp);
      kelp.setColorAt(i, color.setHSL(0.24 + rng() * 0.06, 0.45, 0.28 + rng() * 0.12));
    }
    kelp.instanceMatrix.needsUpdate = true;
    if (kelp.instanceColor) kelp.instanceColor.needsUpdate = true;
    this.group.add(kelp);
  }

  private buildMarkers(m: Materials): void {
    const x = -8.6;
    const z = -8;
    const deepest = 3000;
    const length = deepest * WORLD_PER_METRE + 4;
    const cable = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, length, 6), m.cable);
    cable.position.set(x, SURFACE_Y - length / 2, z);
    this.group.add(cable);
    const buoyGeo = new THREE.SphereGeometry(0.28, 16, 12);
    const ringGeo = new THREE.TorusGeometry(0.3, 0.05, 6, 20);
    for (let d = 100; d <= deepest; d += 100) {
      const y = SURFACE_Y - d * WORLD_PER_METRE;
      const buoy = new THREE.Mesh(buoyGeo, m.buoy);
      buoy.position.set(x, y, z);
      const ring = new THREE.Mesh(ringGeo, m.darkSteel);
      ring.rotation.x = Math.PI / 2;
      ring.position.set(x, y, z);
      const label = new THREE.Sprite(
        new THREE.SpriteMaterial({
          map: canvasTexture(256, 96, (g) => {
            g.fillStyle = 'rgba(8,20,30,0.72)';
            g.beginPath();
            g.roundRect(8, 16, 240, 64, 12);
            g.fill();
            g.strokeStyle = 'rgba(255,160,80,0.9)';
            g.lineWidth = 4;
            g.stroke();
            g.fillStyle = '#ffe2c4';
            g.font = 'bold 44px system-ui, sans-serif';
            g.textAlign = 'center';
            g.textBaseline = 'middle';
            g.fillText(`${d} m`, 128, 50);
          }),
          transparent: true,
          depthWrite: false,
        }),
      );
      label.scale.set(1.6, 0.6, 1);
      label.position.set(x + 1.2, y, z);
      this.group.add(buoy, ring, label);
    }
  }

  update(elapsed: number, cameraY: number, depth: number, look: DepthLook): void {
    for (const { mesh, slots } of this.rocks) {
      for (let i = 0; i < slots.length; i++) {
        const s = slots[i]!;
        const y = s.base.y + WRAP * Math.round((cameraY - s.base.y) / WRAP);
        this.v.set(s.base.x, y, s.base.z);
        this.q.setFromEuler(s.rot);
        this.tmp.compose(this.v, this.q, s.scale);
        mesh.setMatrixAt(i, this.tmp);
      }
      mesh.instanceMatrix.needsUpdate = true;
    }
    // Rock tint follows the zone: mossy shallows, blue-black depths, rust-red abyss.
    const deepT = THREE.MathUtils.smoothstep(depth, 60, 700);
    const abyssT = THREE.MathUtils.smoothstep(depth, 1100, 1700);
    this.rockMat.color.copy(this.shallowRock).lerp(this.deepRock, deepT).lerp(this.abyssRock, abyssT);
    this.rockMat.emissive.setRGB(0.05, 0.012, 0.004).multiplyScalar(abyssT);
    const shader = this.kelpMat.userData['shader'] as { uniforms: { uTime: { value: number } } } | undefined;
    if (shader) shader.uniforms.uTime.value = elapsed;
    void look;
  }
}

/** A faceted rock: icosahedron with position-hashed displacement (no cracks) and cavity darkening. */
function rockGeometry(seed: number): THREE.BufferGeometry {
  const geo = new THREE.IcosahedronGeometry(1, 2);
  const pos = geo.attributes['position']!;
  const colors = new Float32Array(pos.count * 3);
  const hash = (x: number, y: number, z: number): number => {
    const h = Math.sin(x * 127.1 + y * 311.7 + z * 74.7 + seed * 19.19) * 43758.5453;
    return h - Math.floor(h);
  };
  const p = new THREE.Vector3();
  for (let i = 0; i < pos.count; i++) {
    p.fromBufferAttribute(pos, i);
    const k = (v: number): number => Math.round(v * 1000) / 1000;
    const n = hash(k(p.x), k(p.y), k(p.z));
    const n2 = hash(k(p.x * 2.1), k(p.y * 2.1), k(p.z * 2.1));
    const d = 0.72 + n * 0.38 + n2 * 0.12;
    p.multiplyScalar(d);
    p.y *= 0.8;
    pos.setXYZ(i, p.x, p.y, p.z);
    const shade = 0.55 + (d - 0.72) * 0.9;
    colors[i * 3] = shade;
    colors[i * 3 + 1] = shade;
    colors[i * 3 + 2] = shade * 1.04;
  }
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  geo.computeVertexNormals();
  return geo;
}
