import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';

const VignetteShader = {
  uniforms: { tDiffuse: { value: null }, uStrength: { value: 0.55 }, uSize: { value: 0.78 } },
  vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
  fragmentShader: `uniform sampler2D tDiffuse; uniform float uStrength, uSize; varying vec2 vUv;
    void main(){ vec4 c = texture2D(tDiffuse, vUv); float d = distance(vUv, vec2(0.5));
      c.rgb *= mix(1.0, smoothstep(uSize, uSize - 0.5, d), uStrength); gl_FragColor = c; }`,
};

/**
 * Render → bloom (authored emissives only: portholes, lamps, lures, jellies; threshold keeps lit
 * surfaces out) → subtle vignette → output (tone mapping + sRGB). Two passes beyond render/output,
 * inside the desktop budget; phones get a lower DPR cap and half-resolution bloom.
 */
export class RenderPipeline {
  readonly composer: EffectComposer;
  readonly bloom: UnrealBloomPass;
  maxDpr: number;

  constructor(
    readonly renderer: THREE.WebGLRenderer,
    scene: THREE.Scene,
    readonly camera: THREE.PerspectiveCamera,
  ) {
    this.maxDpr = RenderPipeline.defaultDpr();
    this.composer = new EffectComposer(renderer);
    this.composer.addPass(new RenderPass(scene, camera));
    this.bloom = new UnrealBloomPass(new THREE.Vector2(256, 256), 0.55, 0.35, 0.9);
    this.composer.addPass(this.bloom);
    this.composer.addPass(new ShaderPass(VignetteShader));
    this.composer.addPass(new OutputPass());
  }

  static defaultDpr(): number {
    const phone = Math.min(window.innerWidth, window.innerHeight) < 600;
    return phone ? 1.5 : 2;
  }

  /** Match canvas, renderer, camera and composer to the displayed size. */
  resize(): boolean {
    const canvas = this.renderer.domElement;
    const w = Math.max(1, Math.floor(canvas.clientWidth));
    const h = Math.max(1, Math.floor(canvas.clientHeight));
    const dpr = Math.min(window.devicePixelRatio || 1, this.maxDpr);
    if (canvas.width === Math.floor(w * dpr) && canvas.height === Math.floor(h * dpr)) return false;
    this.renderer.setPixelRatio(dpr);
    this.renderer.setSize(w, h, false);
    this.composer.setPixelRatio(dpr);
    this.composer.setSize(w, h);
    this.bloom.resolution.set(w / 2, h / 2);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    return true;
  }

  render(): void {
    this.composer.render();
  }

  dispose(): void {
    this.composer.dispose();
  }
}
