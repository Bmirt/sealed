import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { Loop } from '../core/Loop';
import { createRenderer } from '../core/Renderer';
import { Submarine } from '../entities/Submarine';
import { GameAudio } from '../systems/Audio';
import { CameraRig } from '../systems/CameraRig';
import { DebugTools, type DebugTuning } from '../systems/DebugTools';
import { RenderPipeline } from '../systems/RenderPipeline';
import { Vfx } from '../systems/Vfx';
import { Hud, money } from '../ui/Hud';
import { createSeededRandom } from '../utils/random';
import { Creatures } from '../world/Creatures';
import { Ocean } from '../world/Ocean';
import { SURFACE_Y, WORLD_PER_METRE, createMaterials, depthLook, newLook } from '../world/palette';
import { WorldKit } from '../world/WorldKit';
import { depthFor } from './crash';
import { RoundState, type Phase, type RoundEvent } from './RoundState';

/** Unpredictable crash points for real play; the seed() test hook swaps in a seeded RNG. */
const secureRandom = (): number => {
  const buf = new Uint32Array(1);
  crypto.getRandomValues(buf);
  return (buf[0] ?? 0) / 0x1_0000_0000;
};

/** The balance lives in sessionStorage: it survives a reload, but closing the tab resets it. */
const balanceStore = {
  load(): number | null {
    try {
      localStorage.removeItem('submariner.balance'); // older versions kept it across visits
      const v = sessionStorage.getItem('submariner.balance');
      return v === null ? null : Number(v);
    } catch {
      return null;
    }
  },
  save(cents: number): void {
    try {
      sessionStorage.setItem('submariner.balance', String(cents));
    } catch {
      /* private mode */
    }
  },
};

const IMPLODE_CRUSH = 0.24; // seconds the hull takes to crush
const RESET_AFTER = 0.34; // seconds into the fade before the scene snaps back to the surface
const SUB_SURFACE_Y = SURFACE_Y - 3.3; // sail top stays under the waterline
const TEST_STATES = ['boarding', 'diving', 'twilight', 'midnight', 'abyss', 'brink', 'imploded', 'cashout'] as const;

export class Game {
  private readonly renderer: THREE.WebGLRenderer;
  private readonly scene = new THREE.Scene();
  private readonly camera = new THREE.PerspectiveCamera(42, 1, 0.1, 160);
  private readonly pipeline: RenderPipeline;
  private readonly cameraRig: CameraRig;
  private readonly state: RoundState;
  private readonly sub: Submarine;
  private readonly ocean: Ocean;
  private readonly world: WorldKit;
  private readonly creatures: Creatures;
  private readonly vfx: Vfx;
  private readonly audio: GameAudio;
  private readonly hud: Hud;
  private readonly debugTools: DebugTools;
  private readonly look = newLook();
  private readonly hemi = new THREE.HemisphereLight(0xbff4ff, 0x0b2230, 1.2);
  private readonly sun = new THREE.DirectionalLight(0xe6fbff, 2);
  private readonly rim = new THREE.DirectionalLight(0x7fd8ff, 1.2);
  private readonly fog = new THREE.FogExp2(0x1a9fbf, 0.02);
  private readonly loop = new Loop((d, e) => this.update(d, e), () => this.render());
  private readonly tuning: DebugTuning = { exposure: 0.95, bloom: 0.55, maxDpr: RenderPipeline.defaultDpr() };
  private readonly tmp = new THREE.Vector3();
  private rng = createSeededRandom(20260930);
  private frame = 0;
  private time = 0;
  private renderDepth = 0;
  private implodeT = -1;
  private imploded = false;
  private resetT = -1;
  private sonarT = 1;
  private creakT = 4;
  private paused = false;
  private reducedMotion = false;
  private muted = false;
  private updateMs = 0;
  private markReadyFn: () => void = () => undefined;
  /** Resolves once warm-up is done and the splash is gone (test hooks wait for it). */
  private readonly ready = new Promise<void>((resolve) => (this.markReadyFn = resolve));
  private renderMs = 0;

  constructor(private readonly canvas: HTMLCanvasElement) {
    this.renderer = createRenderer(canvas);
    this.renderer.shadowMap.enabled = false;
    this.renderer.toneMappingExposure = this.tuning.exposure;
    this.renderer.info.autoReset = false;
    this.pipeline = new RenderPipeline(this.renderer, this.scene, this.camera);
    this.cameraRig = new CameraRig(this.camera);

    const pmrem = new THREE.PMREMGenerator(this.renderer);
    this.scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    pmrem.dispose();
    this.scene.fog = this.fog;
    this.scene.background = new THREE.Color(0x1a9fbf);

    const worldRng = createSeededRandom(7);
    const materials = createMaterials();
    this.sub = new Submarine(materials);
    this.ocean = new Ocean(worldRng);
    this.world = new WorldKit(worldRng, materials);
    this.creatures = new Creatures(worldRng);
    this.vfx = new Vfx(this.rng, materials);
    this.scene.add(this.sub.root, this.ocean.group, this.world.group, this.creatures.group, this.vfx.group);

    this.sun.position.set(3, 12, 6);
    this.rim.position.set(-8, 3, -6);
    this.scene.add(this.hemi, this.sun, this.rim, this.sun.target);

    this.state = new RoundState(secureRandom, balanceStore);
    this.audio = new GameAudio(createSeededRandom(99));
    try {
      this.muted = localStorage.getItem('submariner.muted') === '1';
    } catch {
      this.muted = false;
    }
    this.audio.setMuted(this.muted);

    this.hud = new Hud(this.state, {
      bet: (slip) => this.handle(this.state.placeBet(slip)),
      cancel: () => this.handle(this.state.cancelBet()),
      cashOut: () => this.handle(this.state.cashOut()),
      autoBet: (on) => this.state.setAutoBet(on),
      toggleSound: () => this.toggleSound(),
      refill: () => {
        this.handle(this.state.resetBalance());
        this.audio.play('cashout', { gain: 0.6 });
      },
      press: () => this.audio.play('click', { gain: 0.7, pitchVar: 0.04 }),
    });
    this.hud.setSoundMuted(this.muted);

    const unlock = (): void => this.audio.unlock();
    for (const ev of ['pointerdown', 'pointerup', 'click', 'touchend', 'keydown'] as const) window.addEventListener(ev, unlock, true);
    document.addEventListener('visibilitychange', () => this.audio.suspend(document.hidden));

    this.debugTools = new DebugTools(this.tuning, () => {
      this.renderer.toneMappingExposure = this.tuning.exposure;
      this.pipeline.bloom.strength = this.tuning.bloom;
      this.pipeline.maxDpr = this.tuning.maxDpr;
    });

    this.placeSub();
    this.pipeline.resize();
    this.cameraRig.snapTo(this.sub.root.position);
    this.installTestHooks();
    this.publishDiagnostics();
  }

  start(): void {
    this.loop.start();
  }

  markReady(): void {
    this.markReadyFn();
  }

  /**
   * GPU warm-up, run once behind the splash: every object is made visible and un-culled (hidden
   * effects, the buoy template, creatures far below), its shaders are compiled, and one full frame
   * is drawn so instance buffers, textures and post-processing targets are uploaded. Without this
   * the first implosion (or the first jellyfish) stalls ~100 ms while the driver compiles.
   */
  async warmup(): Promise<void> {
    this.vfx.setWarmup(true, this.sub.root.position);
    const saved: [THREE.Object3D, boolean, boolean][] = [];
    this.scene.traverse((o) => {
      saved.push([o, o.visible, o.frustumCulled]);
      o.visible = true;
      o.frustumCulled = false;
    });
    try {
      await this.renderer.compileAsync(this.scene, this.camera);
    } catch {
      this.renderer.compile(this.scene, this.camera);
    }
    this.render();
    for (const [o, visible, culled] of saved) {
      o.visible = visible;
      o.frustumCulled = culled;
    }
    this.vfx.setWarmup(false, this.sub.root.position);

    this.vfx.reset();
    this.step(1 / 60);
    this.render();
    await new Promise((r) => requestAnimationFrame(() => r(undefined)));
  }

  dispose(): void {
    this.loop.stop();
    this.audio.dispose();
    this.debugTools.dispose();
    this.pipeline.dispose();
    this.renderer.dispose();
    window.__THREE_GAME_DIAGNOSTICS__ = undefined;
    window.__THREE_GAME_TEST_HOOKS__ = undefined;
  }

  // ------------------------------------------------------------------ loop

  private update(delta: number, _elapsed: number): void {
    this.frame++;
    this.pipeline.resize();
    if (this.paused) {
      this.publishDiagnostics();
      return;
    }
    const t0 = performance.now();
    this.handle(this.state.update(delta));
    this.step(delta);
    this.hud.update();
    this.updateMs = performance.now() - t0;
    this.publishDiagnostics();
  }

  /** Everything visual/audio that follows the state, advanced by delta. */
  private step(delta: number): void {
    this.time += this.reducedMotion ? 0 : delta;
    const t = this.time;
    const phase = this.state.phase;

    if (this.resetT >= 0) {
      this.resetT += delta;
      if (this.resetT >= RESET_AFTER) {
        this.resetScene();
        this.hud.fade(false);
        this.resetT = -1;
      }
    }
    if (this.resetT < 0) {
      this.renderDepth = phase === 'boarding' ? 0 : depthFor(this.state.phase === 'imploded' ? this.state.revealedCrash ?? 1 : this.state.multiplier);
    }
    const depth = this.renderDepth;
    const diving = phase === 'diving';
    const stress = THREE.MathUtils.clamp(depth / 1400, 0, 1);

    this.placeSub();
    depthLook(depth, this.look);
    (this.scene.background as THREE.Color).copy(this.look.water);
    this.fog.color.copy(this.look.water);
    this.fog.density = this.look.fog;
    this.hemi.intensity = 0.3 + this.look.sun * 0.75;
    this.hemi.color.copy(this.look.water).lerp(new THREE.Color(0xffffff), 0.55);
    this.sun.intensity = this.look.sun * 1.7;
    this.rim.intensity = 0.5 + this.look.dark * 1.1;
    this.scene.environmentIntensity = 0.25 + this.look.sun * 0.35;
    this.sun.target.position.copy(this.sub.root.position);
    this.sun.position.set(this.sub.root.position.x + 3, this.sub.root.position.y + 12, 6);

    // implosion sequence: crush, then the burst
    if (this.implodeT >= 0) {
      this.implodeT += delta;
      this.sub.setCrush(this.implodeT / IMPLODE_CRUSH);
      if (!this.imploded && this.implodeT >= IMPLODE_CRUSH * 0.7) {
        this.imploded = true;
        this.vfx.implode(this.sub.root.position);
        this.cameraRig.addTrauma(0.95);
      }
    }
    this.sub.update(delta, t, diving, stress, this.look.dark);

    if (diving) {
      this.tmp.set(-2.7, -0.1, 0).applyMatrix4(this.sub.root.matrixWorld);
      this.vfx.wash(this.tmp, 26, delta);
    } else if (phase === 'boarding' && this.rng() < delta * 3) {
      this.tmp.set((this.rng() - 0.5) * 3, -0.5, 0.5).add(this.sub.root.position);
      this.vfx.bubble(this.tmp, 0.4, 0.8, 0.05);
    }
    this.vfx.update(delta, t);
    this.ocean.update(t, this.camera, this.look);
    this.world.update(t, this.camera.position.y, depth, this.look);
    this.creatures.update(t, this.camera.position.y);
    this.cameraRig.reducedMotion = this.reducedMotion;
    this.cameraRig.screenY = this.hud.subScreenY;
    this.cameraRig.update(delta, this.sub.root.position, diving);

    // audio beds and tension
    this.audio.loop('ambience-loop', 0.7);
    this.audio.loop('engine-loop', diving ? 0.55 : phase === 'boarding' ? 0.16 : 0, 1 + stress * 0.12);
    if (diving) {
      this.sonarT -= delta;
      if (this.sonarT <= 0) {
        this.audio.play('sonar', { gain: 0.55, rate: 1 - stress * 0.25 });
        this.sonarT = 5;
      }
      if (stress > 0.12) {
        this.creakT -= delta;
        if (this.creakT <= 0) {
          this.audio.play(this.rng() < 0.5 ? 'creak-1' : 'creak-2', { gain: 0.4 + stress * 0.5, pitchVar: 0.08 });
          this.creakT = 7 - stress * 4.5 + this.rng() * 3;
        }
      }
    }
  }

  private render(): void {
    // Count every pass of the frame (the composer would otherwise leave only its last quad in info).
    const t0 = performance.now();
    this.renderer.info.reset();
    this.pipeline.render();
    this.renderMs = performance.now() - t0;
    if (window.__THREE_GAME_DIAGNOSTICS__) window.__THREE_GAME_DIAGNOSTICS__.timing = { update: this.updateMs, render: this.renderMs };
  }

  private placeSub(): void {
    this.sub.root.position.set(0, SUB_SURFACE_Y - this.renderDepth * WORLD_PER_METRE, 0);
    this.sub.root.updateMatrixWorld();
  }

  private resetScene(): void {
    this.renderDepth = 0;
    this.implodeT = -1;
    this.imploded = false;
    this.sub.reset();
    this.vfx.reset();
    this.placeSub();
    this.cameraRig.snapTo(this.sub.root.position);
  }

  // ------------------------------------------------------------------ events → feedback

  private handle(events: RoundEvent[]): void {
    for (const e of events) {
      switch (e.type) {
        case 'boarding':
          if (this.implodeT >= 0 || this.renderDepth > 0) {
            this.hud.fade(true);
            this.resetT = 0;
          }
          break;
        case 'countdown':
          this.audio.play('tick', { gain: 0.8, rate: e.secondsLeft === 1 ? 1.25 : 1 });
          break;
        case 'dive':
          this.audio.play('dive-start', { gain: 0.9 });
          this.sonarT = 1.2;
          this.creakT = 5;
          for (let i = 0; i < 30; i++) {
            this.tmp.set((this.rng() - 0.5) * 4, -0.6, (this.rng() - 0.5) * 1.5).add(this.sub.root.position);
            this.vfx.bubble(this.tmp, 0.5, 2, 0.08);
          }
          break;
        case 'milestone':
          this.audio.play('milestone', { gain: 0.8, rate: Math.min(1.5, 0.9 + Math.log10(e.multiplier) * 0.25) });
          this.hud.pulse();
          break;
        case 'betPlaced':
          this.audio.play('bet', { pitchVar: 0.03 });
          if (e.queued) this.hud.toast(`${money(e.slip.stakeCents)} queued for the next dive`, 'info');
          break;
        case 'betCancelled':
          this.audio.play('cancel');
          break;
        case 'cashout': {
          this.audio.play('cashout');
          const win = e.payoutCents - e.stakeCents;
          this.hud.toast(`${e.auto ? 'Auto cash out' : 'Cashed out'} at ${e.multiplier.toFixed(2)}×: +${money(win)}`, 'win');
          this.hud.bumpBalance();
          this.sub.hatch.getWorldPosition(this.tmp);
          this.vfx.cashout(this.tmp, `+${money(e.payoutCents)}`);
          break;
        }
        case 'implode':
          this.implodeT = 0;
          this.imploded = false;
          this.audio.play('implode');
          this.hud.flash();
          if (e.lostCents > 0) this.hud.toast(`Hull imploded at ${e.crash.toFixed(2)}×. Lost ${money(e.lostCents)}`, 'loss');
          break;
        case 'rejected':
          this.audio.play('cancel', { rate: 0.8 });
          this.hud.toast(e.reason, 'info');
          break;
        case 'balance':
          break;
      }
    }
  }

  private toggleSound(): void {
    this.muted = !this.muted;
    this.audio.setMuted(this.muted);
    this.hud.setSoundMuted(this.muted);
    try {
      localStorage.setItem('submariner.muted', this.muted ? '1' : '0');
    } catch {
      /* private mode */
    }
    if (!this.muted) this.audio.play('click');
  }

  // ------------------------------------------------------------------ test hooks + diagnostics

  private installTestHooks(): void {
    // Hooks can jump states and place bets, so a player build only exposes them with ?test.
    if (!import.meta.env.DEV && !new URLSearchParams(window.location.search).has('test')) return;
    window.__THREE_GAME_TEST_HOOKS__ = {
      seed: (value: number) => {
        this.rng = createSeededRandom(value);
        this.state.setRng(createSeededRandom(value + 1));
      },
      setState: async (name: string) => {
        if (!(TEST_STATES as readonly string[]).includes(name)) throw new Error(`Unknown test state: ${name}`);
        await this.ready;
        this.applyTestState(name as (typeof TEST_STATES)[number]);
        return { state: name };
      },
      setPausedForScreenshot: (paused: boolean) => {
        this.paused = paused;
      },
      setReducedMotion: (enabled: boolean) => {
        this.reducedMotion = enabled;
      },
      hideDebugUi: (hidden: boolean) => this.debugTools.setHidden(hidden),
    };
  }

  /** Deterministic scene setups for captures and bot checks, driven through the real state machine. */
  private applyTestState(name: (typeof TEST_STATES)[number]): void {
    const stake = { stakeCents: 500, autoCashout: null };
    this.resetScene();
    this.hud.fade(false);
    this.resetT = -1;
    this.handle(this.state.debugJump('boarding'));
    document.querySelector('#toasts')?.replaceChildren();
    const dive = (m: number, crash: number): void => {
      this.handle(this.state.placeBet(stake));
      this.handle(this.state.debugJump('diving', m, crash));
    };
    let phase: Phase = 'boarding';
    let settle = 0.5;
    switch (name) {
      case 'boarding':
        this.handle(this.state.placeBet(stake));
        break;
      case 'diving':
        dive(1.42, 5);
        phase = 'diving';
        break;
      case 'twilight':
        dive(3.4, 8);
        phase = 'diving';
        break;
      case 'midnight':
        dive(14, 30);
        phase = 'diving';
        break;
      case 'abyss':
        dive(92, 200);
        phase = 'diving';
        break;
      case 'brink': // live dive ~0.8 s before a 3.50x crash: motion evidence for the crush and implosion
        dive(3.27, 3.5);
        phase = 'diving';
        settle = 0.1;
        break;
      case 'imploded':
        dive(3.46, 3.47);
        this.handle(this.state.debugJump('imploded', 3.47, 3.47));
        phase = 'imploded';
        settle = 0.55;
        break;
      case 'cashout':
        dive(2.6, 6);
        this.handle(this.state.cashOut());
        phase = 'diving';
        settle = 0.55;
        break;
    }
    void phase;
    document.querySelector('#flash')?.classList.remove('go'); // a CSS flash would not freeze for a capture
    // Let the visuals catch up (camera, effects) without advancing the round.
    for (let i = 0; i < Math.round(settle * 60); i++) this.step(1 / 60);
    this.cameraRig.snapTo(this.sub.root.position);
    this.step(1 / 60);
    this.hud.update();
    this.render();
    this.publishDiagnostics();
  }

  private publishDiagnostics(): void {
    const info = this.renderer.info;
    window.__THREE_GAME_DIAGNOSTICS__ = {
      frame: this.frame,
      elapsed: this.time,
      phase: this.state.phase,
      multiplier: this.state.shownMultiplier,
      depth: this.renderDepth,
      balanceCents: this.state.balanceCents,
      round: this.state.round,
      renderer: {
        calls: info.render.calls,
        triangles: info.render.triangles,
        geometries: info.memory.geometries,
        textures: info.memory.textures,
      },
      canvas: {
        clientWidth: this.canvas.clientWidth,
        clientHeight: this.canvas.clientHeight,
        width: this.canvas.width,
        height: this.canvas.height,
        dpr: Math.min(window.devicePixelRatio || 1, this.pipeline.maxDpr),
      },
    };
  }
}
