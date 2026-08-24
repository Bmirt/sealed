import { spin } from '@math/spin';
import type { GameConfig, SpinOutcome } from '@math/types';
import { SYMBOL_IDS } from '@/assets/textures';
import type { GameScene } from '@/game/GameScene';
import type { GameController } from '@/state/GameController';
import type { GameStore } from '@/state/GameStore';
import { button, el } from './dom';

/**
 * Dev overlay (`?dev`): FPS, seed/nonce entry and "find me an outcome" buttons.
 * Everything here still goes through the maths — it only picks seeds.
 */
export class DevPanel {
  readonly root: HTMLElement;
  private readonly fpsEl: HTMLElement;
  private readonly seedInput: HTMLInputElement;
  private readonly nonceInput: HTMLInputElement;
  private readonly infoEl: HTMLElement;
  private frames = 0;
  private last = performance.now();

  constructor(host: HTMLElement, config: GameConfig, store: GameStore, controller: GameController, scene: GameScene) {
    this.fpsEl = el('span', { class: 'dev-fps', text: '— fps' });
    this.seedInput = el('input', { type: 'text', value: store.get().seed, 'aria-label': 'seed' });
    this.nonceInput = el('input', { type: 'number', value: String(store.get().nonce), 'aria-label': 'nonce', min: '0' });
    this.infoEl = el('pre', { class: 'dev-info' });

    const find = (label: string, pred: (o: SpinOutcome) => boolean): HTMLButtonElement =>
      button(label, 'btn btn-dev', () => {
        const seed = this.seedInput.value || store.get().seed;
        let nonce = Number.parseInt(this.nonceInput.value, 10) || 0;
        for (let i = 0; i < 200_000; i++, nonce++) {
          const o = spin(config, seed, nonce);
          if (pred(o)) {
            store.setSeed(seed, nonce);
            this.nonceInput.value = String(nonce);
            void controller.spin();
            return;
          }
        }
        this.infoEl.textContent = 'not found in 200k nonces';
      });

    const spinSeed = button('Spin seed/nonce', 'btn btn-dev', () => {
      store.setSeed(this.seedInput.value || store.get().seed, Number.parseInt(this.nonceInput.value, 10) || 0);
      void controller.spin();
    });
    const showAll = button('All symbols', 'btn btn-dev', () => {
      // Temporarily point each reel at a mini strip so every symbol is visible at once.
      scene.reels.reels.forEach((reel, r) => {
        const ids = SYMBOL_IDS.slice(r * 3, r * 3 + 3);
        while (ids.length < 3) ids.push(SYMBOL_IDS[ids.length] ?? 'L1');
        reel.setStrip(ids);
        reel.setStop(0);
      });
    });
    let night = false;
    const bgToggle = button('Toggle bg', 'btn btn-dev', () => {
      night = !night;
      scene.setBackground(night ? 'free' : 'base');
    });
    const addBalance = button('+€1000', 'btn btn-dev', () => store.credit(100_000));

    this.root = el('div', { class: 'dev-panel' }, [
      el('div', { class: 'dev-row' }, [this.fpsEl, el('span', { text: ' seed ' }), this.seedInput, el('span', { text: ' nonce ' }), this.nonceInput]),
      el('div', { class: 'dev-row' }, [
        spinSeed,
        find('Find scatter×3+', (o) => o.base.scatter.count >= 3),
        find('Find scatter×2 (tease)', (o) => o.base.scatter.count === 2 && (o.base.scatter.positions[0]?.[0] ?? 9) <= 1 && (o.base.scatter.positions[1]?.[0] ?? 9) <= 1),
        find('Find wild', (o) => o.base.grid.some((col) => col.includes(config.symbols.W.code))),
        find('Find win ≥15×', (o) => o.base.totalWinCoins >= 15 * config.coinsPerBet),
        find('Find win ≥50×', (o) => o.totalWinCoins >= 50 * config.coinsPerBet),
        showAll,
        bgToggle,
        addBalance,
      ]),
      this.infoEl,
    ]);
    host.append(this.root);

    scene.app.ticker.add(() => {
      this.frames++;
      const now = performance.now();
      if (now - this.last >= 1000) {
        this.fpsEl.textContent = `${Math.round((this.frames * 1000) / (now - this.last))} fps`;
        this.frames = 0;
        this.last = now;
      }
    });

    store.subscribe((s) => {
      this.seedInput.value = s.seed;
      this.nonceInput.value = String(s.nonce);
      const o = controller.outcome;
      if (o && s.phase === 'idle') {
        this.infoEl.textContent = `nonce ${o.nonce}  win ${o.totalWinCoins / config.coinsPerBet}× ` +
          `${o.base.wins.map((w) => `${w.symbol}×${w.length}(${w.ways}w)`).join(' ')}` +
          `${o.base.scatter.count >= 3 ? `  FEATURE ${o.feature?.spins.length ?? 0} spins, ${(o.feature?.totalWinCoins ?? 0) / config.coinsPerBet}×` : ''}`;
      }
    });
  }
}
