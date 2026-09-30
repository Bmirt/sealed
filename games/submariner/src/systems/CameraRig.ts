import * as THREE from 'three';

const FOV = 42;
/** Approximate on-screen extent of the sub (propeller to dome) in world units. */
const SUB_WIDTH = 5.4;
/**
 * Side-on follow camera. Distance is derived from the viewport so the sub fills a steady share of
 * the width on any aspect (wide desktop or tall phone), and the framing leaves the sub above the
 * bet panel and below the multiplier. The view never shakes, sways or rolls: it only follows the
 * sub smoothly, so the 3D scene stays steady under the HUD (the implosion is carried by the
 * flash, shockwave and debris instead).
 */
export class CameraRig {
  private readonly look = new THREE.Vector3();
  private readonly desired = new THREE.Vector3();
  reducedMotion = false;
  /** Where on screen (0 top .. 1 bottom) the sub should sit; set from the HUD layout. */
  screenY = 0.46;

  constructor(readonly camera: THREE.PerspectiveCamera) {
    camera.fov = FOV;
  }

  private frame(target: THREE.Vector3): void {
    const aspect = this.camera.aspect;
    const tan = Math.tan(THREE.MathUtils.degToRad(FOV / 2));
    const share = aspect < 0.8 ? 0.74 : aspect < 1.2 ? 0.56 : 0.34;
    const distance = THREE.MathUtils.clamp(SUB_WIDTH / (share * 2 * tan * aspect), 9, 24);
    const visibleH = 2 * distance * tan;
    // Aim above the sub to draw it lower on screen (screenY > 0.5), below it to draw it higher.
    const shift = (this.screenY - 0.5) * visibleH;
    // Camera and target share x: the view only ever pitches, so it can never roll or yaw.
    this.desired.set(target.x - 0.1, target.y + 0.6 + shift, target.z + distance);
    this.look.set(target.x - 0.1, target.y + shift, target.z);
  }

  snapTo(target: THREE.Vector3): void {
    this.frame(target);
    this.camera.position.copy(this.desired);
    this.camera.lookAt(this.look);
  }

  update(delta: number, target: THREE.Vector3): void {
    this.frame(target);
    // Vertical follow is tight (the sub must never drift off the framing); x/z ease.
    const k = 1 - Math.exp(-delta * 4);
    this.camera.position.x += (this.desired.x - this.camera.position.x) * k;
    this.camera.position.z += (this.desired.z - this.camera.position.z) * k;
    this.camera.position.y += (this.desired.y - this.camera.position.y) * (1 - Math.exp(-delta * 10));
    this.camera.lookAt(this.look);
  }
}
