import type { GameConfig } from '@math/types';
import type { GameStore, TurboMode } from '@/state/GameStore';
import { button, el } from './dom';
import { Modal } from './Modal';

const SPEEDS: readonly { mode: TurboMode; label: string; blurb: string }[] = [
  { mode: 'normal', label: 'Normal', blurb: 'Full spin and win presentation' },
  { mode: 'turbo', label: 'Turbo', blurb: 'Fast reels, shortened wins' },
  { mode: 'quick', label: 'Quick Spin', blurb: 'Near-instant results' },
];

/** Settings: speed, sound, balance reset, build info. */
export function openSettingsModal(host: HTMLElement, config: GameConfig, store: GameStore): Modal {
  const modal = new Modal(host, 'Settings', 'modal-settings');

  const speedRow = el('div', { class: 'settings-speeds' });
  const renderSpeeds = (): void => {
    speedRow.replaceChildren(
      ...SPEEDS.map(({ mode, label, blurb }) => {
        const b = button(`<strong>${label}</strong><small>${blurb}</small>`, 'btn btn-speed', () => {
          store.set({ turboMode: mode });
          renderSpeeds();
        }, { 'data-speed': mode });
        if (store.get().turboMode === mode) b.classList.add('is-selected');
        return b;
      }),
    );
  };
  renderSpeeds();

  const soundToggle = el('input', { type: 'checkbox', id: 'set-sound', checked: store.get().soundOn ? true : undefined });
  soundToggle.addEventListener('change', () => store.set({ soundOn: soundToggle.checked }));

  const resetBtn = button('Reset balance to $1,000', 'btn btn-confirm btn-reset', () => {
    store.resetBalance();
    modal.close();
  });

  modal.body.append(
    el('h3', { class: 'settings-h', text: 'Spin speed' }),
    speedRow,
    el('label', { class: 'autoplay-flag', for: 'set-sound' }, [soundToggle, el('span', { text: ' Sound' })]),
    el('h3', { class: 'settings-h', text: 'Demo balance' }),
    resetBtn,
    el('p', { class: 'modal-note', text: `Ashfall Dynasty · config v${config.version} · RTP ${(config.rtp.declaredBase * 100).toFixed(2)}% · max win ${config.maxWinX.toLocaleString()}×` }),
  );
  modal.open();
  return modal;
}
