import * as THREE from 'three';
import { SURFACE_Y, canvasTexture, type DepthLook } from './palette';

/**
 * The water around the sub: the surface seen from below (rippling, bright), god-ray light shafts
 * that fade out with depth, drifting marine snow (parallax, wrapped around the camera in the vertex
 * shader, so it is one draw call at any depth), and bioluminescent specks that only show in the dark.
 */
export class Ocean {
  readonly group = new THREE.Group();
  private readonly surfaceMat: THREE.ShaderMaterial;
  private readonly shafts: THREE.Mesh[] = [];
  private readonly shaftMat: THREE.MeshBasicMaterial;
  private readonly snow: THREE.Points<THREE.BufferGeometry, THREE.ShaderMaterial>;
  private readonly specks: THREE.Points<THREE.BufferGeometry, THREE.ShaderMaterial>;

  constructor(rng: () => number) {
    // --- surface from below
    this.surfaceMat = new THREE.ShaderMaterial({
      side: THREE.DoubleSide,
      transparent: true,
      depthWrite: false,
      uniforms: { uTime: { value: 0 }, uFade: { value: 1 } },
      vertexShader: `varying vec2 vUv; varying float vDist;
        void main(){ vUv = uv; vec4 mv = modelViewMatrix * vec4(position,1.0); vDist = -mv.z; gl_Position = projectionMatrix * mv; }`,
      fragmentShader: `uniform float uTime; uniform float uFade; varying vec2 vUv; varying float vDist;
        float wave(vec2 p){ return sin(p.x*1.7+uTime*1.1)*0.5 + sin(p.y*2.3-uTime*0.8)*0.5 + sin((p.x+p.y)*3.1+uTime*1.7)*0.25; }
        void main(){
          vec2 p = vUv * 60.0;
          float w = wave(p) + wave(p*2.1+3.0)*0.5;
          float caustic = pow(max(0.0, 1.0 - abs(w)), 6.0);
          vec3 deep = vec3(0.08, 0.55, 0.66);
          vec3 bright = vec3(0.78, 0.97, 1.0);
          vec3 col = mix(deep, bright, 0.35 + caustic * 0.65);
          float edge = smoothstep(95.0, 30.0, vDist);
          gl_FragColor = vec4(col, uFade * edge * (0.75 + caustic * 0.25));
        }`,
    });
    const surface = new THREE.Mesh(new THREE.PlaneGeometry(220, 220, 1, 1), this.surfaceMat);
    surface.rotation.x = Math.PI / 2;
    surface.position.y = SURFACE_Y;
    surface.renderOrder = -1;
    this.group.add(surface);

    // --- light shafts (god rays) hanging from the surface
    const shaftTex = canvasTexture(64, 256, (g) => {
      const grad = g.createLinearGradient(0, 0, 0, 256);
      grad.addColorStop(0, 'rgba(255,255,255,0.9)');
      grad.addColorStop(0.5, 'rgba(255,255,255,0.3)');
      grad.addColorStop(1, 'rgba(255,255,255,0)');
      g.fillStyle = grad;
      g.fillRect(0, 0, 64, 256);
      const side = g.createLinearGradient(0, 0, 64, 0);
      side.addColorStop(0, 'rgba(0,0,0,1)');
      side.addColorStop(0.5, 'rgba(0,0,0,0)');
      side.addColorStop(1, 'rgba(0,0,0,1)');
      g.globalCompositeOperation = 'destination-out';
      g.fillStyle = side;
      g.fillRect(0, 0, 64, 256);
    });
    this.shaftMat = new THREE.MeshBasicMaterial({ map: shaftTex, color: 0xbff4ff, transparent: true, opacity: 0.16, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, fog: false });
    for (let i = 0; i < 9; i++) {
      const h = 26 + rng() * 14;
      const shaft = new THREE.Mesh(new THREE.PlaneGeometry(1.2 + rng() * 2.4, h), this.shaftMat);
      const side = i % 2 === 0 ? -1 : 1; // keep the shafts off the sub, which sits at the centre
      shaft.position.set(side * (5 + (i >> 1) * 3.2 + rng() * 1.5), SURFACE_Y - h / 2 + 0.5, -9 - rng() * 12);
      shaft.rotation.z = 0.2 + rng() * 0.12;
      shaft.userData['phase'] = rng() * 10;
      this.shafts.push(shaft);
      this.group.add(shaft);
    }

    // --- marine snow and bioluminescent specks (camera-wrapped points)
    this.snow = makeWrappedPoints(rng, 1400, { size: 2.2, color: new THREE.Color(0xdff6ff), opacity: 0.55, drift: -0.12, blink: 0 });
    this.specks = makeWrappedPoints(rng, 260, { size: 4.2, color: new THREE.Color(0x49ffd8), opacity: 0, drift: 0.05, blink: 1 });
    this.group.add(this.snow, this.specks);
  }

  update(elapsed: number, camera: THREE.Camera, look: DepthLook): void {
    this.surfaceMat.uniforms.uTime!.value = elapsed;
    this.surfaceMat.uniforms.uFade!.value = THREE.MathUtils.clamp(look.sun * 1.2, 0, 1);
    this.shaftMat.opacity = 0.16 * look.sun * look.sun;
    for (const s of this.shafts) s.rotation.z = 0.24 + Math.sin(elapsed * 0.25 + (s.userData['phase'] as number)) * 0.05;
    for (const p of [this.snow, this.specks]) {
      p.material.uniforms.uCam!.value.copy(camera.position);
      p.material.uniforms.uTime!.value = elapsed;
    }
    this.snow.material.uniforms.uColor!.value.setRGB(0.75 + look.sun * 0.2, 0.9, 1);
    this.specks.material.uniforms.uOpacity!.value = look.dark * 0.9;
  }
}

const BOX = new THREE.Vector3(44, 30, 30);

function makeWrappedPoints(
  rng: () => number,
  count: number,
  o: { size: number; color: THREE.Color; opacity: number; drift: number; blink: number },
): THREE.Points<THREE.BufferGeometry, THREE.ShaderMaterial> {
  const pos = new Float32Array(count * 3);
  const seed = new Float32Array(count);
  for (let i = 0; i < count; i++) {
    pos[i * 3] = rng() * BOX.x;
    pos[i * 3 + 1] = rng() * BOX.y;
    pos[i * 3 + 2] = rng() * BOX.z;
    seed[i] = rng();
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('aSeed', new THREE.BufferAttribute(seed, 1));
  const mat = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    uniforms: {
      uCam: { value: new THREE.Vector3() },
      uTime: { value: 0 },
      uBox: { value: BOX },
      uSize: { value: o.size },
      uColor: { value: o.color },
      uOpacity: { value: o.opacity },
      uDrift: { value: o.drift },
      uBlink: { value: o.blink },
    },
    vertexShader: `uniform vec3 uCam; uniform float uTime; uniform vec3 uBox; uniform float uSize; uniform float uDrift; uniform float uBlink;
      attribute float aSeed; varying float vAlpha;
      void main(){
        vec3 p = position;
        p.y += uTime * uDrift * (0.6 + aSeed) * 6.0;
        p.x += sin(uTime * 0.3 + aSeed * 40.0) * 0.4;
        // wrap every particle into a box centred ahead of the camera
        vec3 origin = uCam - vec3(uBox.x * 0.5, uBox.y * 0.5, uBox.z + 2.0);
        vec3 w = mod(p - origin, uBox) + origin;
        vec4 mv = modelViewMatrix * vec4(w, 1.0);
        float blink = mix(1.0, 0.5 + 0.5 * sin(uTime * (1.5 + aSeed * 3.0) + aSeed * 60.0), uBlink);
        vAlpha = blink * smoothstep(40.0, 8.0, -mv.z) * smoothstep(0.5, 3.0, -mv.z);
        gl_PointSize = uSize * (0.5 + aSeed) * (30.0 / -mv.z);
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: `uniform vec3 uColor; uniform float uOpacity; varying float vAlpha;
      void main(){ vec2 c = gl_PointCoord - 0.5; float d = dot(c, c); if (d > 0.25) discard;
        float a = uOpacity * vAlpha * (1.0 - d * 4.0); gl_FragColor = vec4(uColor * a, a); }`,
  });
  const points = new THREE.Points(geo, mat);
  points.frustumCulled = false;
  return points;
}
