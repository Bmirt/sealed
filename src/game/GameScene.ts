import { Application, Container } from 'pixi.js';
import type { GameConfig } from '@math/types';
import { PALETTE } from '@config/palette';
import { buildBackground } from '@/assets/procedural/background';
import type { BackgroundLayers, BackgroundVariant } from '@/assets/procedural/background';
import { TextureBank } from '@/assets/textures';
import { DESIGN, computeLayout } from './layout';
import type { Layout, Orientation } from './layout';
import { ReelsView } from './ReelsView';

export interface GameSceneOptions {
  readonly host: HTMLElement;
  readonly config: GameConfig;
  readonly onLayout?: (layout: Layout) => void;
}

type BgKey = `${BackgroundVariant}-${Orientation}`;

/**
 * Root of the Pixi side: application, backdrop, world (design-space box), reels.
 * Owns resize/letterboxing. Knows nothing about outcomes — the controller drives it.
 */
export class GameScene {
  readonly app: Application;
  readonly world: Container;
  readonly backdrop: Container;
  readonly overlay: Container;
  private readonly backgrounds = new Map<BgKey, BackgroundLayers>();
  private bgVariant: BackgroundVariant = 'base';
  private readonly opts: GameSceneOptions;
  private bank: TextureBank | null = null;
  private reelsView: ReelsView | null = null;
  private currentLayout: Layout;
  private resizeObserver: ResizeObserver | null = null;

  private constructor(opts: GameSceneOptions) {
    this.opts = opts;
    this.app = new Application();
    this.world = new Container();
    this.backdrop = new Container();
    this.overlay = new Container();
    this.currentLayout = computeLayout(opts.host.clientWidth || 1, opts.host.clientHeight || 1);
  }

  static async create(opts: GameSceneOptions): Promise<GameScene> {
    const scene = new GameScene(opts);
    await scene.init();
    return scene;
  }

  private async init(): Promise<void> {
    const host = this.opts.host;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    await this.app.init({
      resizeTo: host,
      background: PALETTE.obsidian,
      antialias: true,
      resolution: dpr,
      autoDensity: true,
      preference: 'webgl',
      powerPreference: 'high-performance',
    });
    host.appendChild(this.app.canvas);
    this.app.canvas.style.display = 'block';
    this.app.canvas.setAttribute('aria-label', 'Ashfall Dynasty reels');

    this.app.stage.addChild(this.backdrop, this.world, this.overlay);

    // Bake textures at a resolution that stays crisp at the largest world scale we expect.
    const bakeRes = Math.min(3, Math.max(1.5, dpr * 1.25));
    this.bank = new TextureBank(this.app.renderer, bakeRes);
    await this.bank.load();

    this.reelsView = new ReelsView(this.bank, this.opts.config);
    this.world.addChild(this.reelsView);

    this.resizeObserver = new ResizeObserver(() => this.resize());
    this.resizeObserver.observe(host);
    window.addEventListener('orientationchange', () => setTimeout(() => this.resize(), 50));
    this.resize();
  }

  get reels(): ReelsView {
    if (!this.reelsView) throw new Error('scene not initialised');
    return this.reelsView;
  }

  get textures(): TextureBank {
    if (!this.bank) throw new Error('scene not initialised');
    return this.bank;
  }

  get layout(): Layout {
    return this.currentLayout;
  }

  get backgroundVariant(): BackgroundVariant {
    return this.bgVariant;
  }

  /** The backdrop currently on screen (variant × orientation). Built lazily. */
  get background(): BackgroundLayers {
    return this.backgroundFor(this.bgVariant, this.currentLayout.orientation);
  }

  setBackground(variant: BackgroundVariant): void {
    this.bgVariant = variant;
    this.applyBackground();
  }

  private backgroundFor(variant: BackgroundVariant, orientation: Orientation): BackgroundLayers {
    const key: BgKey = `${variant}-${orientation}`;
    let bg = this.backgrounds.get(key);
    if (!bg) {
      const d = DESIGN[orientation];
      bg = buildBackground(variant, d.w, d.h);
      bg.root.visible = false;
      this.backdrop.addChild(bg.root);
      this.backgrounds.set(key, bg);
    }
    return bg;
  }

  private applyBackground(): void {
    const layout = this.currentLayout;
    const active = this.backgroundFor(this.bgVariant, layout.orientation);
    for (const bg of this.backgrounds.values()) bg.root.visible = bg === active;
    // Cover the viewport.
    const cover = Math.max(layout.viewW / active.width, layout.viewH / active.height);
    active.root.scale.set(cover);
    active.root.position.set((layout.viewW - active.width * cover) / 2, (layout.viewH - active.height * cover) / 2);
  }

  resize(): void {
    const host = this.opts.host;
    const w = host.clientWidth || window.innerWidth;
    const h = host.clientHeight || window.innerHeight;
    this.app.renderer.resize(w, h);
    const layout = computeLayout(w, h);
    this.currentLayout = layout;

    this.world.scale.set(layout.scale);
    this.world.position.set(layout.offsetX, layout.offsetY);
    this.overlay.scale.set(layout.scale);
    this.overlay.position.set(layout.offsetX, layout.offsetY);

    if (this.reelsView) {
      this.reelsView.scale.set(layout.reelsScale);
      this.reelsView.position.set(layout.reelsX, layout.reelsY);
    }
    this.applyBackground();

    const d = DESIGN[layout.orientation];
    host.style.setProperty('--world-scale', String(layout.scale));
    host.style.setProperty('--design-w', String(d.w));
    host.style.setProperty('--design-h', String(d.h));
    this.opts.onLayout?.(layout);
  }

  destroy(): void {
    this.resizeObserver?.disconnect();
    this.bank?.destroy();
    this.app.destroy(true, { children: true });
  }
}
