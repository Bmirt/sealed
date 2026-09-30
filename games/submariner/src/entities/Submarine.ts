import * as THREE from 'three';
import { canvasTexture, glowTexture, type Materials } from '../world/palette';

/**
 * The hero: a deep-sea research submarine, nose toward +X. Built from authored parts
 * (lathe hull, extruded sail and fins, shrouded propeller, glass bow dome, portholes, skids,
 * searchlights, rivets and decals) so the silhouette reads as a submarine before any lighting.
 *
 * States: idle bob at the surface, dive (nose-down pitch, fast prop, searchlight), stress
 * (warning lamp blinks faster and the hull trembles with depth), implode (crush then hide).
 */
export class Submarine {
  readonly root = new THREE.Group();
  /** Everything that tilts/shakes; `root` only carries position. */
  private readonly body = new THREE.Group();
  private readonly prop = new THREE.Group();
  private readonly lampMat: THREE.MeshStandardMaterial;
  private readonly lampGlow: THREE.Sprite;
  private readonly beam: THREE.Mesh<THREE.ConeGeometry, THREE.ShaderMaterial>;
  readonly searchlight: THREE.SpotLight;
  /** World position the escape buoy launches from (top of the sail). */
  readonly hatch = new THREE.Object3D();
  private propSpeed = 0.6;
  private crush = 0;
  private time = 0;

  constructor(m: Materials) {
    this.root.name = 'submarine';
    this.root.add(this.body);
    this.lampMat = m.hazard.clone();

    this.buildHull(m);
    this.buildSail(m);
    this.buildTail(m);
    this.buildBow(m);
    this.buildUnderside(m);
    this.buildRivets(m);

    // Searchlight: a real spot (the key light once the sun is gone) plus a soft volumetric cone.
    this.searchlight = new THREE.SpotLight(0xfff1d6, 0, 26, 0.42, 0.55, 1.2);
    this.searchlight.position.set(2.3, -0.3, 0);
    const target = new THREE.Object3D();
    target.position.set(9, -3.2, 0);
    this.body.add(this.searchlight, target);
    this.searchlight.target = target;

    const beamGeo = new THREE.ConeGeometry(2.1, 8, 32, 1, true);
    beamGeo.translate(0, -4, 0); // apex at origin, opening along -Y
    this.beam = new THREE.Mesh(
      beamGeo,
      new THREE.ShaderMaterial({
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        side: THREE.DoubleSide,
        uniforms: { uStrength: { value: 0 }, uColor: { value: new THREE.Color(0xfff1d6) } },
        vertexShader: `varying float vAlong; varying vec3 vN; varying vec3 vView;
          void main(){ vAlong = -position.y / 8.0; vec4 mv = modelViewMatrix * vec4(position,1.0);
            vN = normalize(normalMatrix * normal); vView = normalize(-mv.xyz); gl_Position = projectionMatrix * mv; }`,
        fragmentShader: `uniform float uStrength; uniform vec3 uColor; varying float vAlong; varying vec3 vN; varying vec3 vView;
          void main(){ float edge = pow(abs(dot(vN, vView)), 1.5);
            float a = uStrength * (1.0 - vAlong) * (1.0 - vAlong) * edge * 0.22;
            gl_FragColor = vec4(uColor * a, a); }`,
      }),
    );
    this.beam.position.set(2.25, -0.3, 0);
    this.beam.rotation.z = Math.PI / 2 + 0.38; // point forward and down, like the spot
    this.body.add(this.beam);

    this.lampGlow = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTexture(), color: 0xff3b2f, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0 }));
    this.lampGlow.scale.setScalar(0.7);
    this.lampGlow.position.set(-0.05, 1.98, 0);
    this.body.add(this.lampGlow);

    this.root.traverse((o) => {
      if (o instanceof THREE.Mesh) {
        o.castShadow = false;
        o.receiveShadow = false;
      }
    });
  }

  // ------------------------------------------------------------------ model

  private buildHull(m: Materials): void {
    const profile = [
      [0.02, -2.34], [0.22, -2.24], [0.44, -1.95], [0.64, -1.45], [0.76, -0.85],
      [0.8, -0.2], [0.8, 0.8], [0.77, 1.35], [0.68, 1.75], [0.53, 2.03],
    ].map(([r, y]) => new THREE.Vector2(r, y));
    const hullGeo = new THREE.LatheGeometry(profile, 64);
    hullGeo.rotateZ(-Math.PI / 2); // lathe axis Y → +X (nose)
    const hull = new THREE.Mesh(hullGeo, m.hullPaint);
    hull.name = 'hull';
    this.body.add(hull);

    // White band and dark panel rings: scale cues and a clear read of the hull's roundness.
    const band = new THREE.Mesh(new THREE.CylinderGeometry(0.812, 0.812, 0.42, 64, 1, true), m.hullWhite);
    band.rotation.z = Math.PI / 2;
    band.position.x = 0.15;
    this.body.add(band);
    for (const [x, r] of [[-1.45, 0.645], [-0.75, 0.785], [0.95, 0.797], [1.62, 0.715]] as const) {
      const ring = new THREE.Mesh(new THREE.TorusGeometry(r, 0.022, 8, 64), m.trim);
      ring.rotation.y = Math.PI / 2;
      ring.position.x = x;
      this.body.add(ring);
    }

    // Portholes: brass rim + warm lit glass, three per side.
    const rimGeo = new THREE.TorusGeometry(0.13, 0.032, 10, 28);
    const glassGeo = new THREE.CircleGeometry(0.115, 28);
    for (const side of [1, -1]) {
      for (const x of [-1.0, -0.25, 0.55]) {
        const rim = new THREE.Mesh(rimGeo, m.brass);
        rim.position.set(x, 0.12, 0.79 * side);
        const glass = new THREE.Mesh(glassGeo, m.portGlass);
        glass.position.set(x, 0.12, 0.8 * side);
        if (side < 0) glass.rotation.y = Math.PI;
        this.body.add(rim, glass);
      }
    }

    // Hull number decal on the side band.
    const decal = canvasTexture(256, 64, (g) => {
      g.fillStyle = '#1d2329';
      g.font = 'bold 44px "Arial Black", Arial, sans-serif';
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      g.fillText('SB-07', 128, 34);
    });
    const decalMat = new THREE.MeshBasicMaterial({ map: decal, transparent: true, polygonOffset: true, polygonOffsetFactor: -2, toneMapped: true });
    for (const side of [1, -1]) {
      const plate = new THREE.Mesh(new THREE.PlaneGeometry(0.9, 0.22), decalMat);
      plate.position.set(1.25, -0.28, 0.77 * side);
      plate.rotation.y = side > 0 ? 0 : Math.PI;
      plate.rotation.x = side * 0.34;
      this.body.add(plate);
    }
  }

  private buildSail(m: Materials): void {
    // Conning tower: an extruded, bevelled, raked profile.
    const s = new THREE.Shape();
    s.moveTo(-0.85, 0);
    s.lineTo(0.75, 0);
    s.quadraticCurveTo(0.62, 0.55, 0.45, 0.82);
    s.lineTo(-0.52, 0.82);
    s.quadraticCurveTo(-0.72, 0.5, -0.85, 0);
    const geo = new THREE.ExtrudeGeometry(s, { depth: 0.46, bevelEnabled: true, bevelSize: 0.06, bevelThickness: 0.06, bevelSegments: 3, curveSegments: 12 });
    geo.translate(0, 0, -0.23);
    const sail = new THREE.Mesh(geo, m.hullWhite);
    sail.name = 'sail';
    sail.position.set(0.05, 0.62, 0);
    this.body.add(sail);

    // Sail windows (bridge), lit.
    const winGeo = new THREE.BoxGeometry(0.16, 0.1, 0.02);
    for (const side of [1, -1]) {
      for (let i = 0; i < 3; i++) {
        const w = new THREE.Mesh(winGeo, m.portGlass);
        w.position.set(0.28 - i * 0.24, 1.26, 0.3 * side);
        this.body.add(w);
      }
    }
    // Sail dive planes.
    const fin = new THREE.Shape();
    fin.moveTo(0, 0);
    fin.lineTo(0.5, 0);
    fin.lineTo(0.38, 0.42);
    fin.lineTo(0.08, 0.42);
    fin.lineTo(0, 0);
    const finGeo = new THREE.ExtrudeGeometry(fin, { depth: 0.04, bevelEnabled: true, bevelSize: 0.015, bevelThickness: 0.015, bevelSegments: 1 });
    for (const side of [1, -1]) {
      const f = new THREE.Mesh(finGeo, m.darkSteel);
      f.rotation.x = side * Math.PI / 2;
      f.position.set(0.12, 1.02, 0.28 * side);
      this.body.add(f);
    }
    // Hatch, periscope, antenna and the warning lamp.
    const hatch = new THREE.Mesh(new THREE.TorusGeometry(0.14, 0.035, 8, 24), m.brass);
    hatch.rotation.x = Math.PI / 2;
    hatch.position.set(-0.15, 1.5, 0);
    const lid = new THREE.Mesh(new THREE.CylinderGeometry(0.13, 0.13, 0.04, 24), m.steel);
    lid.position.set(-0.15, 1.5, 0);
    this.body.add(hatch, lid);
    this.hatch.position.set(-0.15, 1.6, 0);
    this.body.add(this.hatch);

    const scope = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.045, 0.55, 12), m.steel);
    scope.position.set(0.3, 1.72, 0);
    const scopeHead = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.08, 0.08), m.steel);
    scopeHead.position.set(0.36, 2.0, 0);
    const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.02, 0.5, 8), m.darkSteel);
    mast.position.set(-0.05, 1.72, 0);
    const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.05, 12, 8), this.lampMat);
    lamp.position.set(-0.05, 1.98, 0);
    this.body.add(scope, scopeHead, mast, lamp);
  }

  private buildTail(m: Materials): void {
    // Cross tail: four swept fins.
    const fin = new THREE.Shape();
    fin.moveTo(0, 0);
    fin.lineTo(0.62, 0);
    fin.lineTo(0.28, 0.62);
    fin.lineTo(0.0, 0.62);
    fin.lineTo(0, 0);
    const geo = new THREE.ExtrudeGeometry(fin, { depth: 0.05, bevelEnabled: true, bevelSize: 0.015, bevelThickness: 0.015, bevelSegments: 1 });
    geo.translate(0, 0, -0.025);
    for (let i = 0; i < 4; i++) {
      const pivot = new THREE.Group();
      pivot.position.x = -2.05;
      pivot.rotation.x = (i * Math.PI) / 2;
      const f = new THREE.Mesh(geo, i % 2 === 0 ? m.hullPaint : m.darkSteel);
      f.position.set(-0.05, 0.22, 0);
      f.rotation.y = Math.PI;
      pivot.add(f);
      this.body.add(pivot);
    }
    // Propeller shroud + hub + five skewed blades.
    const shroud = new THREE.Mesh(new THREE.CylinderGeometry(0.44, 0.4, 0.32, 40, 1, true), m.darkSteel);
    shroud.material = m.darkSteel;
    (shroud.material as THREE.MeshStandardMaterial).side = THREE.DoubleSide;
    shroud.rotation.z = Math.PI / 2;
    shroud.position.x = -2.5;
    const lip = new THREE.Mesh(new THREE.TorusGeometry(0.44, 0.03, 8, 40), m.steel);
    lip.rotation.y = Math.PI / 2;
    lip.position.x = -2.35;
    this.body.add(shroud, lip);
    this.prop.position.x = -2.5;
    const hub = new THREE.Mesh(new THREE.ConeGeometry(0.1, 0.26, 16), m.brass);
    hub.rotation.z = Math.PI / 2;
    hub.position.x = -0.1;
    this.prop.add(hub);
    const bladeGeo = new THREE.BoxGeometry(0.04, 0.34, 0.13);
    bladeGeo.translate(0, 0.2, 0);
    for (let i = 0; i < 5; i++) {
      const b = new THREE.Mesh(bladeGeo, m.brass);
      b.rotation.x = (i * Math.PI * 2) / 5;
      b.rotateY(0.55); // pitch
      this.prop.add(b);
    }
    this.body.add(this.prop);
  }

  private buildBow(m: Materials): void {
    const dome = new THREE.Mesh(new THREE.SphereGeometry(0.53, 40, 20, 0, Math.PI * 2, 0, Math.PI / 2), m.domeGlass);
    dome.rotation.z = -Math.PI / 2;
    dome.position.x = 2.02;
    const frame = new THREE.Mesh(new THREE.TorusGeometry(0.53, 0.04, 10, 48), m.brass);
    frame.rotation.y = Math.PI / 2;
    frame.position.x = 2.03;
    // A lit cockpit behind the glass: instrument glow and a pilot seat silhouette.
    const cockpit = new THREE.Mesh(new THREE.SphereGeometry(0.34, 20, 12), new THREE.MeshStandardMaterial({ color: 0x0b1a22, emissive: 0x39c6e0, emissiveIntensity: 0.9, roughness: 0.6 }));
    cockpit.position.set(1.95, -0.05, 0);
    cockpit.scale.set(0.8, 0.7, 1);
    const seat = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.32, 0.28), m.rubber);
    seat.position.set(2.05, -0.02, 0);
    this.body.add(cockpit, seat, dome, frame);

    // Searchlight pods under the chin.
    const podGeo = new THREE.CylinderGeometry(0.09, 0.11, 0.26, 16);
    const lensGeo = new THREE.CircleGeometry(0.085, 16);
    for (const side of [1, -1]) {
      const pod = new THREE.Mesh(podGeo, m.steel);
      pod.rotation.z = Math.PI / 2 + 0.35;
      pod.position.set(1.72, -0.58, 0.36 * side);
      const lens = new THREE.Mesh(lensGeo, m.lamp);
      lens.position.set(1.86, -0.63, 0.36 * side);
      lens.rotation.y = Math.PI / 2;
      lens.rotation.x = -0.35;
      this.body.add(pod, lens);
    }
  }

  private buildUnderside(m: Materials): void {
    // Ballast skids with struts.
    const skidGeo = new THREE.CapsuleGeometry(0.1, 2.7, 6, 16);
    skidGeo.rotateZ(Math.PI / 2);
    const strutGeo = new THREE.BoxGeometry(0.08, 0.3, 0.06);
    for (const side of [1, -1]) {
      const skid = new THREE.Mesh(skidGeo, m.darkSteel);
      skid.position.set(0, -0.86, 0.36 * side);
      this.body.add(skid);
      for (const x of [-0.9, 0.9]) {
        const strut = new THREE.Mesh(strutGeo, m.darkSteel);
        strut.position.set(x, -0.66, 0.3 * side);
        strut.rotation.x = -0.35 * side;
        this.body.add(strut);
      }
    }
    // Manipulator arm folded under the bow: a functional detail that sells "research sub".
    const armMat = m.steel;
    const upper = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 0.5, 10), armMat);
    upper.position.set(1.3, -0.78, 0);
    upper.rotation.z = 1.2;
    const lower = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 0.42, 10), armMat);
    lower.position.set(1.62, -0.9, 0);
    lower.rotation.z = -0.4;
    const claw = new THREE.Mesh(new THREE.ConeGeometry(0.06, 0.14, 8), m.darkSteel);
    claw.position.set(1.7, -1.1, 0);
    claw.rotation.z = Math.PI;
    this.body.add(upper, lower, claw);
  }

  private buildRivets(m: Materials): void {
    const rings: [number, number][] = [[-1.45, 0.66], [-0.75, 0.8], [0.95, 0.81], [1.62, 0.73]];
    const perRing = 22;
    const rivets = new THREE.InstancedMesh(new THREE.SphereGeometry(0.02, 6, 4), m.steel, rings.length * perRing);
    const mat4 = new THREE.Matrix4();
    let i = 0;
    for (const [x, r] of rings) {
      for (let k = 0; k < perRing; k++) {
        const a = (k / perRing) * Math.PI * 2;
        mat4.makeTranslation(x + 0.05, Math.cos(a) * r, Math.sin(a) * r);
        rivets.setMatrixAt(i++, mat4);
      }
    }
    rivets.instanceMatrix.needsUpdate = true;
    this.body.add(rivets);
  }

  // ------------------------------------------------------------------ state

  reset(): void {
    this.crush = 0;
    this.root.visible = true;
    this.body.scale.set(1, 1, 1);
    this.body.rotation.set(0, 0, 0);
    this.body.position.set(0, 0, 0);
  }

  /**
   * @param diving     whether the dive is on (prop speed, pitch)
   * @param stress     0..1 hull stress from depth (lamp blink rate, tremble)
   * @param dark       0..1 how dark the water is (searchlight strength)
   */
  update(delta: number, elapsed: number, diving: boolean, stress: number, dark: number): void {
    this.time = elapsed;
    const targetProp = diving ? 22 : 3;
    this.propSpeed += (targetProp - this.propSpeed) * Math.min(1, delta * 2);
    this.prop.rotation.x += this.propSpeed * delta;

    if (this.crush > 0) return;
    const bob = diving ? 0.04 : 0.09;
    const pitchTarget = diving ? -0.14 : Math.sin(elapsed * 0.9) * 0.03;
    this.body.rotation.z += (pitchTarget - this.body.rotation.z) * Math.min(1, delta * 1.5);
    this.body.rotation.x = Math.sin(elapsed * 0.7) * 0.025;
    this.body.position.y = Math.sin(elapsed * 1.3) * bob;
    // Tremble under pressure (visual only; it says nothing about when the hull gives).
    const tremble = stress * stress * 0.025;
    this.body.position.x = Math.sin(elapsed * 61) * tremble;
    this.body.position.z = Math.cos(elapsed * 47) * tremble;

    // Warning lamp: slow blink at the surface, frantic in the deep.
    const rate = 0.8 + stress * 5;
    const on = diving && Math.sin(elapsed * Math.PI * 2 * rate) > 0.2 ? 1 : 0;
    this.lampMat.emissiveIntensity = on * 4;
    this.lampGlow.material.opacity = on * 0.9;

    const light = diving ? 0.25 + dark * 0.75 : 0.2;
    this.searchlight.intensity = light * 55;
    this.beam.material.uniforms.uStrength!.value = light;
  }

  /** Crush animation driver: progress 0..1 over the first fraction of a second. */
  setCrush(progress: number): void {
    this.crush = progress;
    if (progress <= 0) return;
    const p = Math.min(1, progress);
    const squeeze = 1 - p * 0.75;
    this.body.scale.set(1 - p * 0.35, squeeze, squeeze);
    this.body.position.x = Math.sin(this.time * 90) * 0.06 * (1 - p);
    this.root.visible = p < 1;
    this.searchlight.intensity *= 1 - p;
  }

  get crushed(): boolean {
    return this.crush >= 1;
  }
}
