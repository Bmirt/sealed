import * as THREE from 'three';
import { canvasTexture, glowTexture, type Materials } from '../world/palette';

type Bubble = { alive: boolean; p: THREE.Vector3; v: THREE.Vector3; size: number; life: number; age: number; wobble: number };
type Shard = { p: THREE.Vector3; v: THREE.Vector3; r: THREE.Euler; w: THREE.Vector3; s: number };
type Buoy = { root: THREE.Group; label: THREE.Sprite; age: number };

const MAX_BUBBLES = 320;
const SHARDS = 34;

/**
 * Event-driven effects, pooled and allocation-free per frame:
 *  - bubbles (propeller wash while diving, implosion burst, buoy trail)
 *  - implosion: white-hot flash, expanding shockwave shell, hull debris, a point-light pop
 *  - cash-out: an escape buoy launched from the hatch that rises out of frame with the payout on a tag
 */
export class Vfx {
  readonly group = new THREE.Group();
  private readonly bubbles: Bubble[] = [];
  private readonly bubbleMesh: THREE.InstancedMesh;
  private readonly shards: Shard[] = [];
  private readonly shardMesh: THREE.InstancedMesh;
  private readonly flash: THREE.Mesh<THREE.SphereGeometry, THREE.MeshBasicMaterial>;
  private readonly shock: THREE.Mesh<THREE.SphereGeometry, THREE.ShaderMaterial>;
  private readonly flashLight = new THREE.PointLight(0xbfe9ff, 0, 30, 1.6);
  private readonly buoys: Buoy[] = [];
  private readonly buoyGeo: { float: THREE.BufferGeometry; band: THREE.BufferGeometry; mast: THREE.BufferGeometry; bulb: THREE.BufferGeometry };
  private readonly buoyLamp = new THREE.MeshStandardMaterial({ color: 0x111111, emissive: 0x5dff9b, emissiveIntensity: 4 });
  private readonly buoyGlow = new THREE.SpriteMaterial({ map: glowTexture(), color: 0x5dff9b, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending });
  /** Hidden template: only ever shown during warm-up so its shaders compile before the first cash out. */
  private readonly buoyProto: THREE.Group;
  private implodeAge = -1;
  private readonly tmp = new THREE.Matrix4();
  private readonly q = new THREE.Quaternion();
  private readonly s = new THREE.Vector3();
  private emitCarry = 0;

  constructor(
    private readonly rng: () => number,
    private readonly materials: Materials,
  ) {
    this.bubbleMesh = new THREE.InstancedMesh(
      new THREE.SphereGeometry(1, 10, 8),
      new THREE.MeshPhysicalMaterial({ color: 0xe8fbff, roughness: 0.05, metalness: 0, transparent: true, opacity: 0.55, clearcoat: 1, emissive: 0x7fdcff, emissiveIntensity: 0.25, depthWrite: false }),
      MAX_BUBBLES,
    );
    this.bubbleMesh.frustumCulled = false;
    for (let i = 0; i < MAX_BUBBLES; i++) this.bubbles.push({ alive: false, p: new THREE.Vector3(), v: new THREE.Vector3(), size: 0, life: 0, age: 0, wobble: 0 });

    const shardGeo = new THREE.TetrahedronGeometry(0.28, 0);
    shardGeo.scale(1.4, 0.5, 1);
    this.shardMesh = new THREE.InstancedMesh(shardGeo, materials.hullPaint, SHARDS);
    this.shardMesh.frustumCulled = false;
    this.shardMesh.visible = false;
    for (let i = 0; i < SHARDS; i++) {
      this.shards.push({ p: new THREE.Vector3(), v: new THREE.Vector3(), r: new THREE.Euler(), w: new THREE.Vector3(), s: 1 });
      this.shardMesh.setColorAt(i, new THREE.Color(i % 3 === 0 ? 0xe9edf0 : i % 3 === 1 ? 0xf26b1d : 0x3a4048));
    }

    this.flash = new THREE.Mesh(
      new THREE.SphereGeometry(1, 24, 16),
      new THREE.MeshBasicMaterial({ color: 0xdff6ff, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending, fog: false }),
    );
    this.flash.visible = false;
    this.shock = new THREE.Mesh(
      new THREE.SphereGeometry(1, 40, 24),
      new THREE.ShaderMaterial({
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        uniforms: { uAlpha: { value: 0 } },
        vertexShader: `varying vec3 vN; varying vec3 vV; void main(){ vec4 mv = modelViewMatrix * vec4(position,1.0);
          vN = normalize(normalMatrix * normal); vV = normalize(-mv.xyz); gl_Position = projectionMatrix * mv; }`,
        fragmentShader: `uniform float uAlpha; varying vec3 vN; varying vec3 vV;
          void main(){ float rim = pow(1.0 - abs(dot(vN, vV)), 3.0); float a = uAlpha * rim;
            gl_FragColor = vec4(vec3(0.75, 0.93, 1.0) * a, a); }`,
      }),
    );
    this.shock.visible = false;
    this.buoyGeo = {
      float: new THREE.CapsuleGeometry(0.22, 0.34, 6, 14),
      band: new THREE.TorusGeometry(0.23, 0.035, 6, 20),
      mast: new THREE.CylinderGeometry(0.015, 0.015, 0.4, 6),
      bulb: new THREE.SphereGeometry(0.05, 10, 8),
    };
    this.buoyProto = this.buildBuoy(new THREE.SpriteMaterial({ map: glowTexture(), transparent: true, depthWrite: false }));
    this.buoyProto.visible = false;
    this.group.add(this.bubbleMesh, this.shardMesh, this.flash, this.shock, this.flashLight, this.buoyProto);
  }

  // ------------------------------------------------------------ emitters

  bubble(at: THREE.Vector3, spread: number, speed: number, size: number): void {
    const b = this.bubbles.find((x) => !x.alive);
    if (!b) return;
    b.alive = true;
    b.p.set(at.x + (this.rng() - 0.5) * spread, at.y + (this.rng() - 0.5) * spread, at.z + (this.rng() - 0.5) * spread);
    b.v.set((this.rng() - 0.5) * 0.6, speed * (0.6 + this.rng() * 0.8), (this.rng() - 0.5) * 0.6);
    b.size = size * (0.4 + this.rng() * 0.9);
    b.life = 1.6 + this.rng() * 1.8;
    b.age = 0;
    b.wobble = this.rng() * 10;
  }

  /** Continuous propeller wash; rate in bubbles per second. */
  wash(at: THREE.Vector3, rate: number, delta: number): void {
    this.emitCarry += rate * delta;
    while (this.emitCarry >= 1) {
      this.emitCarry -= 1;
      this.bubble(at, 0.35, 1.2, 0.06);
    }
  }

  implode(at: THREE.Vector3): void {
    this.implodeAge = 0;
    this.flash.position.copy(at);
    this.shock.position.copy(at);
    this.flashLight.position.copy(at);
    this.flash.visible = true;
    this.shock.visible = true;
    this.shardMesh.visible = true;
    for (const sh of this.shards) {
      sh.p.set(at.x + (this.rng() - 0.5) * 3, at.y + (this.rng() - 0.5) * 1.2, at.z + (this.rng() - 0.5) * 1.2);
      // Implosion: debris first sucks inward, then the rebound throws it out.
      sh.v.set(sh.p.x - at.x, sh.p.y - at.y, sh.p.z - at.z).normalize().multiplyScalar(3 + this.rng() * 6);
      sh.r.set(this.rng() * 6, this.rng() * 6, this.rng() * 6);
      sh.w.set((this.rng() - 0.5) * 12, (this.rng() - 0.5) * 12, (this.rng() - 0.5) * 12);
      sh.s = 0.5 + this.rng() * 1.1;
    }
    for (let i = 0; i < 90; i++) this.bubble(at, 2.2, 3.5 + this.rng() * 3, 0.12);
  }

  /** Show every pooled effect (for shader warm-up) or put them back. */
  setWarmup(on: boolean, at: THREE.Vector3): void {
    for (const o of [this.flash, this.shock, this.shardMesh, this.buoyProto]) {
      o.visible = on;
      if (on) o.position.copy(at);
    }
    if (on) this.shock.material.uniforms.uAlpha!.value = 0.001;
    this.flash.material.opacity = 0;
  }

  private buildBuoy(tagMaterial: THREE.SpriteMaterial): THREE.Group {
    const m = this.materials;
    const g = this.buoyGeo;
    const root = new THREE.Group();
    const float = new THREE.Mesh(g.float, m.buoy);
    const band = new THREE.Mesh(g.band, m.hullWhite);
    band.rotation.x = Math.PI / 2;
    const mast = new THREE.Mesh(g.mast, m.darkSteel);
    mast.position.y = 0.45;
    const bulb = new THREE.Mesh(g.bulb, this.buoyLamp);
    bulb.position.y = 0.67;
    const glow = new THREE.Sprite(this.buoyGlow);
    glow.scale.setScalar(0.9);
    glow.position.y = 0.67;
    const tag = new THREE.Sprite(tagMaterial);
    tag.name = 'tag';
    tag.scale.set(1.9, 0.57, 1);
    tag.position.set(0, 1.25, 0);
    root.add(float, band, mast, bulb, glow, tag);
    return root;
  }

  cashout(from: THREE.Vector3, label: string): void {
    const root = this.buildBuoy(
      new THREE.SpriteMaterial({
        map: canvasTexture(320, 96, (g) => {
          g.fillStyle = 'rgba(6,30,24,0.85)';
          g.beginPath();
          g.roundRect(6, 10, 308, 76, 16);
          g.fill();
          g.strokeStyle = '#5dff9b';
          g.lineWidth = 5;
          g.stroke();
          g.fillStyle = '#d9ffe9';
          g.font = 'bold 46px system-ui, sans-serif';
          g.textAlign = 'center';
          g.textBaseline = 'middle';
          g.fillText(label, 160, 50);
        }),
        transparent: true,
        depthWrite: false,
      }),
    );
    root.position.copy(from);
    this.group.add(root);
    this.buoys.push({ root, label: root.getObjectByName('tag') as THREE.Sprite, age: 0 });
  }

  reset(): void {
    this.implodeAge = -1;
    this.flash.visible = false;
    this.shock.visible = false;
    this.shardMesh.visible = false;
    this.flashLight.intensity = 0;
    for (const b of this.bubbles) b.alive = false;
    for (const buoy of this.buoys) this.disposeBuoy(buoy);
    this.buoys.length = 0;
  }

  // ------------------------------------------------------------ update

  update(delta: number, elapsed: number): void {
    // bubbles
    let n = 0;
    for (const b of this.bubbles) {
      if (!b.alive) continue;
      b.age += delta;
      if (b.age >= b.life) {
        b.alive = false;
        continue;
      }
      b.v.y += 0.8 * delta;
      b.p.addScaledVector(b.v, delta);
      b.p.x += Math.sin(elapsed * 6 + b.wobble) * 0.004;
      const grow = Math.min(1, b.age * 6) * (1 - Math.max(0, (b.age - b.life + 0.3) / 0.3));
      this.s.setScalar(b.size * grow);
      this.tmp.compose(b.p, this.q.identity(), this.s);
      this.bubbleMesh.setMatrixAt(n++, this.tmp);
    }
    this.bubbleMesh.count = n;
    this.bubbleMesh.instanceMatrix.needsUpdate = true;

    // implosion
    if (this.implodeAge >= 0) {
      this.implodeAge += delta;
      const t = this.implodeAge;
      const flashT = Math.min(1, t / 0.45);
      this.flash.scale.setScalar(0.4 + flashT * 5);
      this.flash.material.opacity = (1 - flashT) * 0.9;
      this.shock.scale.setScalar(0.5 + t * 11);
      this.shock.material.uniforms.uAlpha!.value = Math.max(0, 1.2 - t * 2.6);
      this.flashLight.intensity = Math.max(0, 400 * (1 - t / 0.6));
      for (let i = 0; i < SHARDS; i++) {
        const sh = this.shards[i]!;
        const drag = Math.exp(-2.2 * delta);
        sh.v.multiplyScalar(drag);
        sh.v.y -= 1.4 * delta; // debris sinks
        sh.p.addScaledVector(sh.v, delta);
        sh.r.x += sh.w.x * delta;
        sh.r.y += sh.w.y * delta;
        sh.r.z += sh.w.z * delta;
        this.q.setFromEuler(sh.r);
        this.s.setScalar(sh.s * Math.max(0, 1 - t / 3.4));
        this.tmp.compose(sh.p, this.q, this.s);
        this.shardMesh.setMatrixAt(i, this.tmp);
      }
      this.shardMesh.instanceMatrix.needsUpdate = true;
      if (t > 3.4) {
        this.implodeAge = -1;
        this.flash.visible = false;
        this.shock.visible = false;
        this.shardMesh.visible = false;
      }
    }

    // buoys rise out of frame, trailing bubbles
    for (let i = this.buoys.length - 1; i >= 0; i--) {
      const b = this.buoys[i]!;
      b.age += delta;
      b.root.position.y += (0.9 + b.age * 1.5) * delta;
      b.root.rotation.z = Math.sin(b.age * 3) * 0.12;
      this.buoyLamp.emissiveIntensity = Math.sin(b.age * 14) > 0 ? 5 : 1;
      if (i % 1 === 0 && this.rng() < delta * 18) this.bubble(b.root.position, 0.2, 1.5, 0.05);
      if (b.age > 6) {
        this.disposeBuoy(b);
        this.buoys.splice(i, 1);
      }
    }
  }

  private disposeBuoy(b: Buoy): void {
    this.group.remove(b.root);
    // Geometry and the lamp/glow materials are shared; only the payout tag belongs to this buoy.
    b.label.material.map?.dispose();
    b.label.material.dispose();
  }
}
