import './styles/app.css';
import { GAME_CONFIG } from '@config/game.config';
import { paletteCssVars } from '@config/palette';
import { assertValidConfig } from '@math/validate';
import { AudioEngine } from './audio/AudioEngine';
import { audioBus } from './audio/bus';
import { AmbientLife, fxBus } from './game/Ambient';
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
import { AdminCorner } from './ui/AdminCorner';
import { TrustBar } from './ui/TrustBar';
import { SealedOutcomeSource } from './state/OutcomeSource';
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

  const particles = new ParticleSystem(scene.app.renderer, 420);
  scene.overlay.addChild(particles.view);
  scene.app.ticker.add(particles.update);

  // Ambient life: embers, firelight flicker, the distant dragon.
  const ambient = new AmbientLife(scene, particles, scene.app.renderer);
  fxBus.ambient = ambient;

  // Audio: synthesised at the first user gesture (autoplay policy), then cued from the views.
  const initAudio = (): void => {
    window.removeEventListener('pointerdown', initAudio);
    window.removeEventListener('keydown', initAudio);
    void AudioEngine.create().then((engine) => {
      audioBus.engine = engine;
      engine.setMuted(!store.get().soundOn);
      engine.music(store.get().phase === 'feature' ? 'feature' : 'base');
      engine.loopStart('ambientFire', 1.5);
    });
  };
  window.addEventListener('pointerdown', initAudio);
  window.addEventListener('keydown', initAudio);

  // Music follows the game phase; mute follows the sound toggle; ambience heats up in features.
  store.subscribe((s, prev) => {
    if (s.soundOn !== prev.soundOn) audioBus.engine?.setMuted(!s.soundOn);
    if (s.phase !== prev.phase) {
      if (s.phase === 'feature') {
        audioBus.engine?.music('feature');
        ambient.setIntensity(1.8);
      } else if (prev.phase === 'feature') {
        audioBus.engine?.music('base');
        ambient.setIntensity(1);
      }
    }
  });

  // UI click sound (event delegation over the DOM chrome).
  uiHost.addEventListener('pointerdown', (e) => {
    if (e.target instanceof Element && e.target.closest('.btn')) audioBus.engine?.play('ui');
  });

  const presenter = new AnimatedPresenter(new PixiPresenterDeps(scene, particles), store, GAME_CONFIG);

  let hud: Hud | null = null;
  // Provably fair mode: outcomes come from the SEALED server (seed committed on Solana before play).
  const sealedUrl = (import.meta.env['VITE_SEALED_SERVER'] as string | undefined) ?? '';
  const playerId = localStorage.getItem('ashfall.player') ?? `player-${Math.random().toString(36).slice(2, 8)}`;
  localStorage.setItem('ashfall.player', playerId);
  const clientSeedKey = 'ashfall.clientSeed';
  if (!localStorage.getItem(clientSeedKey)) localStorage.setItem(clientSeedKey, Math.random().toString(16).slice(2, 12));
  // A deployed slot must never be un-spinnable: if the server is configured but unreachable, play
  // locally (same maths, but NOT provable) and say so instead of failing every spin.
  let sealed = sealedUrl ? new SealedOutcomeSource(sealedUrl, playerId, () => localStorage.getItem(clientSeedKey) ?? 'seed') : null;
  let fallbackNote: string | null = null;
  if (sealed) {
    try {
      const res = await fetch(`${sealedUrl}/state`, { signal: AbortSignal.timeout(6000) });
      if (!res.ok) throw new Error(`${res.status}`);
    } catch (e) {
      sealed = null;
      fallbackNote = `Provably-fair server unreachable (${sealedUrl}) — playing locally; spins are NOT sealed on-chain.`;
      console.warn(fallbackNote, e);
    }
  }
  const controller = new GameController(
    GAME_CONFIG,
    store,
    presenter,
    {
      onInsufficientBalance: (needed) => hud?.showMessage(`Insufficient balance — need ${formatCents(needed)}`),
      onSourceError: (e) => hud?.showMessage(`Provably-fair server unavailable: ${e.message}`, 5000),
    },
    sealed ?? undefined,
  );

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

  if (fallbackNote) hud.showMessage(fallbackNote, 8000);

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

  if (sealed) {
    const trust = new TrustBar(uiHost, sealed, clientSeedKey, store);
    new AdminCorner(uiHost, sealed, store, () => void trust.refresh());
  }

  if (new URLSearchParams(location.search).has('dev')) {
    new DevPanel(uiHost, GAME_CONFIG, store, controller, scene);
    (window as unknown as { __ashfall: unknown }).__ashfall = { scene, store, controller, presenter, particles, ambient, config: GAME_CONFIG };
  }
}

boot().catch((err: unknown) => {
  console.error(err);
  const msg = document.createElement('pre');
  msg.style.cssText = 'color:#f88;padding:16px;font:14px monospace;white-space:pre-wrap';
  msg.textContent = `Failed to start: ${err instanceof Error ? err.stack ?? err.message : String(err)}`;
  document.body.appendChild(msg);
});
