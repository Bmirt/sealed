import './styles/app.css';
import { GAME_CONFIG } from '@config/game.config';
import { paletteCssVars } from '@config/palette';
import { assertValidConfig } from '@math/validate';
import { AnimatedPresenter } from './game/AnimatedPresenter';
import { GameScene } from './game/GameScene';
import { PixiPresenterDeps } from './game/PixiPresenterDeps';
import { ParticleSystem } from './game/Particles';
import { SpinFlow } from './game/SpinFlow';
import { Autoplay } from './state/Autoplay';
import { GameController } from './state/GameController';
import { GameStore, LocalStoragePersistence } from './state/GameStore';
import { formatCents } from './state/money';
import { openAutoplayModal } from './ui/AutoplayModal';
import { openBuyModal } from './ui/BuyBonusModal';
import { DevPanel } from './ui/DevPanel';
import { Hud } from './ui/Hud';
import { Modal } from './ui/Modal';
import { openPaytableModal } from './ui/PaytableModal';
import { openSettingsModal } from './ui/SettingsModal';

async function boot(): Promise<void> {
  assertValidConfig(GAME_CONFIG);

  const style = document.createElement('style');
  style.textContent = `:root{${paletteCssVars()}}`;
  document.head.appendChild(style);

  const stageHost = document.getElementById('stage');
  const uiHost = document.getElementById('ui');
  if (!stageHost || !uiHost) throw new Error('missing #stage / #ui');

  const store = new GameStore(GAME_CONFIG, new LocalStoragePersistence());
  const scene = await GameScene.create({
    host: stageHost,
    config: GAME_CONFIG,
    onLayout: (layout) => {
      uiHost.style.setProperty('--hud-h', `${layout.hudHeight}px`);
    },
  });

  const particles = new ParticleSystem(scene.app.renderer, 320);
  scene.overlay.addChild(particles.view);
  scene.app.ticker.add(particles.update);

  const presenter = new AnimatedPresenter(new PixiPresenterDeps(scene, particles), store, GAME_CONFIG);

  let hud: Hud | null = null;
  const controller = new GameController(GAME_CONFIG, store, presenter, {
    onInsufficientBalance: (needed) => hud?.showMessage(`Insufficient balance — need ${formatCents(needed)}`),
  });

  const flow = new SpinFlow(store, controller, presenter);
  const autoplay = new Autoplay(store, controller);

  hud = new Hud(uiHost, GAME_CONFIG, store, {
    spin: () => flow.spinPressed(),
    spinPressStart: () => flow.holdStart(),
    spinPressEnd: () => flow.holdEnd(),
    betUp: () => store.betUp(),
    betDown: () => store.betDown(),
    cycleTurbo: () => store.cycleTurbo(),
    toggleSound: () => store.toggleSound(),
    openBuy: () => {
      if (controller.canSpin) openBuyModal(uiHost, GAME_CONFIG, store, (tier) => void controller.buy(tier));
    },
    openAutoplay: () => {
      if (controller.canSpin) openAutoplayModal(uiHost, GAME_CONFIG, (count, stopOnFeature) => autoplay.start(count, stopOnFeature));
    },
    stopAutoplay: () => autoplay.stop(),
    openInfo: () => openPaytableModal(uiHost, GAME_CONFIG, store, scene.textures),
    openSettings: () => openSettingsModal(uiHost, GAME_CONFIG, store),
  });

  // Keyboard: Space = the spin button (ignored while a dialog is open).
  window.addEventListener('keydown', (e) => {
    if (e.target instanceof HTMLInputElement || Modal.anyOpen) return;
    if (e.code === 'Space') {
      e.preventDefault();
      if (!e.repeat) {
        flow.holdStart();
        flow.spinPressed();
      }
    }
  });
  window.addEventListener('keyup', (e) => {
    if (e.code === 'Space') flow.holdEnd();
  });
  // Canvas click / tap = skip the current beat (never starts a spin).
  scene.app.canvas.addEventListener('pointerdown', () => flow.skipPressed());

  // Opening screen: a deterministic, win-free stop so the first frame is calm.
  scene.reels.showStops([0, 0, 0, 0, 0], 'base');
  store.set({ phase: 'idle' });

  if (new URLSearchParams(location.search).has('dev')) {
    new DevPanel(uiHost, GAME_CONFIG, store, controller, scene);
    (window as unknown as { __ashfall: unknown }).__ashfall = { scene, store, controller, presenter, config: GAME_CONFIG };
  }
}

boot().catch((err: unknown) => {
  console.error(err);
  const msg = document.createElement('pre');
  msg.style.cssText = 'color:#f88;padding:16px;font:14px monospace;white-space:pre-wrap';
  msg.textContent = `Failed to start: ${err instanceof Error ? err.stack ?? err.message : String(err)}`;
  document.body.appendChild(msg);
});
