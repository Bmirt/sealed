import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { SURFACE_Y, WORLD_PER_METRE, glowTexture } from './palette';

const yAt = (metres: number): number => SURFACE_Y - 1 - metres * WORLD_PER_METRE;

type School = { center: THREE.Vector3; radius: number; speed: number; phase: number; first: number; count: number };
type Swimmer = { root: THREE.Group; home: THREE.Vector3; phase: number; speed: number; part?: THREE.Object3D };

/**
 * Sea life by zone, placed at fixed depths so each dive passes the same kinds of life in order:
 * silver fish schools in the sunlit zone, glowing jellyfish in the twilight zone, anglerfish with
 * lures in the midnight zone, and glowing siphonophore chains in the abyss. Everything is shared
 * geometry/materials; fish are one instanced mesh. Only creatures near the camera are animated.
 */
export class Creatures {
  readonly group = new THREE.Group();
  private readonly fish: THREE.InstancedMesh;
  private readonly schools: School[] = [];
  private readonly jellies: Swimmer[] = [];
  private readonly anglers: Swimmer[] = [];
  private readonly chains: THREE.InstancedMesh;
  private readonly chainData: { home: THREE.Vector3; phase: number }[] = [];
  private readonly tmp = new THREE.Matrix4();
  private readonly q = new THREE.Quaternion();
  private readonly e = new THREE.Euler();
  private readonly v = new THREE.Vector3();
  private readonly s = new THREE.Vector3(1, 1, 1);
  private static readonly BEADS = 26;

  constructor(rng: () => number) {
    // ---- fish schools (sunlit and upper twilight)
    const fishGeo = fishGeometry();
    const fishMat = new THREE.MeshStandardMaterial({ color: 0xb9d4e0, metalness: 0.65, roughness: 0.3, vertexColors: true });
    const schools = 12;
    const perSchool = 16;
    this.fish = new THREE.InstancedMesh(fishGeo, fishMat, schools * perSchool);
    this.fish.frustumCulled = false;
    for (let i = 0; i < schools; i++) {
      const depth = 8 + (i / schools) * 380 + rng() * 25;
      this.schools.push({
        center: new THREE.Vector3((rng() < 0.5 ? -1 : 1) * (4 + rng() * 5), yAt(depth), -3 - rng() * 8),
        radius: 1.4 + rng() * 1.6,
        speed: (0.35 + rng() * 0.3) * (rng() < 0.5 ? -1 : 1),
        phase: rng() * 10,
        first: i * perSchool,
        count: perSchool,
      });
    }
    this.group.add(this.fish);

    // ---- jellyfish (twilight)
    const bellGeo = new THREE.LatheGeometry(
      [[0, 0.62], [0.28, 0.58], [0.5, 0.42], [0.62, 0.18], [0.66, 0], [0.6, -0.04], [0.5, 0.02]].map(([x, y]) => new THREE.Vector2(x, y)),
      32,
    );
    const tentacleGeo = new THREE.TubeGeometry(
      new THREE.CatmullRomCurve3([0, 1, 2, 3, 4, 5].map((k) => new THREE.Vector3(Math.sin(k * 1.3) * 0.12, -k * 0.55, Math.cos(k * 1.1) * 0.1))),
      24, 0.018, 5, false,
    );
    // All seven tentacles as one geometry: one draw call per jelly instead of seven.
    const ring = new THREE.Matrix4();
    const tentaclesGeo = mergeGeometries(
      Array.from({ length: 7 }, (_, t) => {
        const a = (t / 7) * Math.PI * 2;
        ring.makeRotationY(a).setPosition(Math.cos(a) * 0.38, 0, Math.sin(a) * 0.38);
        return tentacleGeo.clone().applyMatrix4(ring);
      }),
    );
    const jellyColors = [0xff5fd2, 0x8f7bff, 0x4fe3ff];
    const bellMats = jellyColors.map((c) => new THREE.MeshStandardMaterial({ color: c, emissive: c, emissiveIntensity: 0.9, transparent: true, opacity: 0.55, roughness: 0.2, depthWrite: false, side: THREE.DoubleSide }));
    const tentMats = jellyColors.map((c) => new THREE.MeshBasicMaterial({ color: c, transparent: true, opacity: 0.55, depthWrite: false, blending: THREE.AdditiveBlending }));
    const glowMats = jellyColors.map((c) => new THREE.SpriteMaterial({ map: glowTexture(), color: c, transparent: true, opacity: 0.55, depthWrite: false, blending: THREE.AdditiveBlending }));
    for (let i = 0; i < 18; i++) {
      const k = i % jellyColors.length;
      const root = new THREE.Group();
      const bell = new THREE.Mesh(bellGeo, bellMats[k]);
      root.add(bell);
      root.add(new THREE.Mesh(tentaclesGeo, tentMats[k]));
      const glow = new THREE.Sprite(glowMats[k]);
      glow.scale.setScalar(2.6);
      glow.position.y = 0.25;
      root.add(glow);
      const depth = 170 + (i / 18) * 800 + rng() * 40;
      const home = new THREE.Vector3((rng() < 0.5 ? -1 : 1) * (3.5 + rng() * 6.5), yAt(depth), -2 - rng() * 9);
      root.position.copy(home);
      root.scale.setScalar(0.7 + rng() * 0.7);
      this.jellies.push({ root, home, phase: rng() * 10, speed: 0.8 + rng() * 0.5, part: bell });
      this.group.add(root);
    }

    // ---- anglerfish (midnight)
    const bodyGeo = new THREE.SphereGeometry(0.7, 20, 14);
    bodyGeo.scale(1.25, 0.95, 0.8);
    const jawGeo = new THREE.SphereGeometry(0.62, 18, 10, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2);
    jawGeo.scale(1.1, 0.7, 0.75);
    const toothGeo = new THREE.ConeGeometry(0.035, 0.2, 5);
    const finGeo = new THREE.ConeGeometry(0.35, 0.8, 3);
    const bodyMat = new THREE.MeshStandardMaterial({ color: 0x2a2d3a, roughness: 0.55, metalness: 0.1, emissive: 0x0b1020, emissiveIntensity: 0.6 });
    const toothMat = new THREE.MeshStandardMaterial({ color: 0xe8e4d6, roughness: 0.4 });
    const eyeMat = new THREE.MeshStandardMaterial({ color: 0x0c0c0c, emissive: 0x9fffe0, emissiveIntensity: 0.6 });
    const lureMat = new THREE.MeshStandardMaterial({ color: 0x111111, emissive: 0x7dffcf, emissiveIntensity: 5 });
    const lureGlow = new THREE.SpriteMaterial({ map: glowTexture(), color: 0x7dffcf, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0.9 });
    const stalkGeo = new THREE.TubeGeometry(new THREE.QuadraticBezierCurve3(new THREE.Vector3(0.35, 0.55, 0), new THREE.Vector3(0.7, 1.4, 0), new THREE.Vector3(1.35, 1.0, 0)), 12, 0.025, 5, false);
    for (let i = 0; i < 9; i++) {
      const root = new THREE.Group();
      root.add(new THREE.Mesh(bodyGeo, bodyMat));
      const jaw = new THREE.Mesh(jawGeo, bodyMat);
      jaw.position.set(0.45, -0.15, 0);
      root.add(jaw);
      for (let t = 0; t < 9; t++) {
        const tooth = new THREE.Mesh(toothGeo, toothMat);
        const a = -0.9 + (t / 8) * 1.8;
        tooth.position.set(0.85 + Math.cos(a) * 0.05, -0.12, Math.sin(a) * 0.42);
        tooth.rotation.z = Math.PI;
        root.add(tooth);
      }
      for (const side of [1, -1]) {
        const eye = new THREE.Mesh(new THREE.SphereGeometry(0.07, 8, 6), eyeMat);
        eye.position.set(0.55, 0.22, 0.4 * side);
        root.add(eye);
      }
      const tail = new THREE.Mesh(finGeo, bodyMat);
      tail.rotation.z = Math.PI / 2;
      tail.position.x = -1.1;
      tail.scale.set(1, 1, 0.3);
      root.add(tail);
      root.add(new THREE.Mesh(stalkGeo, bodyMat));
      const lure = new THREE.Mesh(new THREE.SphereGeometry(0.09, 12, 8), lureMat);
      lure.position.set(1.35, 1.0, 0);
      const glow = new THREE.Sprite(lureGlow);
      glow.scale.setScalar(1.6);
      glow.position.copy(lure.position);
      root.add(lure, glow);
      const depth = 620 + (i / 9) * 900 + rng() * 60;
      const side = rng() < 0.5 ? -1 : 1;
      const home = new THREE.Vector3(side * (4 + rng() * 5), yAt(depth), -3 - rng() * 7);
      root.position.copy(home);
      root.rotation.y = side > 0 ? Math.PI : 0; // face the canyon centre
      root.scale.setScalar(0.8 + rng() * 0.6);
      this.anglers.push({ root, home, phase: rng() * 10, speed: 0.4 + rng() * 0.3, part: tail });
      this.group.add(root);
    }

    // ---- siphonophore chains (abyss): strings of glowing beads
    const chains = 8;
    this.chains = new THREE.InstancedMesh(
      new THREE.SphereGeometry(0.09, 10, 8),
      new THREE.MeshStandardMaterial({ color: 0x111111, emissive: 0xff6a3d, emissiveIntensity: 3.2 }),
      chains * Creatures.BEADS,
    );
    this.chains.frustumCulled = false;
    for (let i = 0; i < chains; i++) {
      this.chainData.push({
        home: new THREE.Vector3((rng() < 0.5 ? -1 : 1) * (3 + rng() * 6), yAt(1250 + i * 160 + rng() * 60), -2 - rng() * 8),
        phase: rng() * 10,
      });
    }
    this.group.add(this.chains);
  }

  update(elapsed: number, cameraY: number): void {
    const near = (y: number): boolean => Math.abs(y - cameraY) < 26;

    // fish: orbit their school centre, facing their direction of travel
    for (const sc of this.schools) {
      const active = near(sc.center.y);
      for (let i = 0; i < sc.count; i++) {
        const idx = sc.first + i;
        if (!active) {
          this.tmp.makeScale(0, 0, 0);
          this.fish.setMatrixAt(idx, this.tmp);
          continue;
        }
        const a = elapsed * sc.speed + sc.phase + (i / sc.count) * Math.PI * 2 * 0.35 + (i % 3) * 0.4;
        const r = sc.radius * (0.7 + (i % 4) * 0.12);
        this.v.set(
          sc.center.x + Math.cos(a) * r,
          sc.center.y + Math.sin(a * 2 + i) * 0.35 + ((i % 5) - 2) * 0.25,
          sc.center.z + Math.sin(a) * r * 0.6,
        );
        const heading = Math.atan2(-Math.cos(a) * 0.6 * Math.sign(sc.speed), -Math.sin(a) * Math.sign(sc.speed));
        this.e.set(0, heading, Math.sin(elapsed * 9 + i) * 0.08);
        this.q.setFromEuler(this.e);
        this.s.setScalar(0.32 + (i % 3) * 0.05);
        this.tmp.compose(this.v, this.q, this.s);
        this.fish.setMatrixAt(idx, this.tmp);
      }
    }
    this.fish.instanceMatrix.needsUpdate = true;

    // jellies: bell pulse and a slow rise-and-sink
    for (const j of this.jellies) {
      j.root.visible = near(j.home.y);
      if (!j.root.visible) continue;
      const beat = Math.sin(elapsed * j.speed * 2 + j.phase);
      j.part!.scale.set(1 - beat * 0.08, 1 + beat * 0.12, 1 - beat * 0.08);
      j.root.position.y = j.home.y + Math.sin(elapsed * 0.4 + j.phase) * 0.6;
      j.root.position.x = j.home.x + Math.sin(elapsed * 0.2 + j.phase) * 0.4;
      j.root.rotation.y = elapsed * 0.1 + j.phase;
    }

    // anglers: drift and tail beat
    for (const f of this.anglers) {
      f.root.visible = near(f.home.y);
      if (!f.root.visible) continue;
      f.root.position.y = f.home.y + Math.sin(elapsed * f.speed + f.phase) * 0.4;
      f.root.position.x = f.home.x + Math.sin(elapsed * f.speed * 0.5 + f.phase) * 0.8;
      f.part!.rotation.y = Math.sin(elapsed * 3 + f.phase) * 0.35;
    }

    // chains: undulating strings of beads
    for (let c = 0; c < this.chainData.length; c++) {
      const ch = this.chainData[c]!;
      const on = near(ch.home.y);
      for (let b = 0; b < Creatures.BEADS; b++) {
        const idx = c * Creatures.BEADS + b;
        if (!on) {
          this.tmp.makeScale(0, 0, 0);
        } else {
          const t = b / Creatures.BEADS;
          this.v.set(
            ch.home.x + Math.sin(elapsed * 0.6 + ch.phase + t * 5) * 0.5,
            ch.home.y + 2.5 - t * 5,
            ch.home.z + Math.cos(elapsed * 0.5 + ch.phase + t * 4) * 0.4,
          );
          this.s.setScalar(0.7 + 0.5 * Math.sin(elapsed * 3 + b * 0.7 + ch.phase) ** 2);
          this.tmp.compose(this.v, this.q.identity(), this.s);
        }
        this.chains.setMatrixAt(idx, this.tmp);
      }
    }
    this.chains.instanceMatrix.needsUpdate = true;
  }
}

/** Low-poly fish (body + tail + dorsal), nose toward +X, with a dark back and a light belly. */
function fishGeometry(): THREE.BufferGeometry {
  const body = new THREE.SphereGeometry(0.5, 12, 8);
  body.scale(1, 0.42, 0.22);
  const tail = new THREE.ConeGeometry(0.28, 0.4, 3);
  tail.rotateZ(Math.PI / 2);
  tail.scale(1, 1, 0.25);
  tail.translate(-0.62, 0, 0);
  const dorsal = new THREE.ConeGeometry(0.1, 0.24, 3);
  dorsal.scale(1.6, 1, 0.2);
  dorsal.translate(0.02, 0.24, 0);
  const parts = [body, tail, dorsal].map((g) => g.toNonIndexed());
  const total = parts.reduce((n, g) => n + g.attributes['position']!.count, 0);
  const pos = new Float32Array(total * 3);
  const col = new Float32Array(total * 3);
  let o = 0;
  for (const g of parts) {
    const p = g.attributes['position']!;
    for (let i = 0; i < p.count; i++) {
      pos[o * 3] = p.getX(i);
      pos[o * 3 + 1] = p.getY(i);
      pos[o * 3 + 2] = p.getZ(i);
      const shade = p.getY(i) > 0.02 ? 0.45 : 1.0; // countershading
      col[o * 3] = shade * 0.9;
      col[o * 3 + 1] = shade;
      col[o * 3 + 2] = shade * 1.05;
      o++;
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  geo.computeVertexNormals();
  return geo;
}
