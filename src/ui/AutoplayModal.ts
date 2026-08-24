import type { GameConfig } from '@math/types';
import { button, el } from './dom';
import { Modal } from './Modal';

/** Autoplay setup: spin count + stop-on-feature. */
export function openAutoplayModal(host: HTMLElement, config: GameConfig, onStart: (count: number, stopOnFeature: boolean) => void): Modal | null {
  if (!config.features.autoplay.enabled) return null;
  const modal = new Modal(host, 'Autoplay', 'modal-autoplay');
  let stopOnFeature = true;

  const checkbox = el('input', { type: 'checkbox', id: 'ap-stop-feature', checked: true });
  checkbox.addEventListener('change', () => {
    stopOnFeature = checkbox.checked;
  });

  const counts = el(
    'div',
    { class: 'autoplay-counts' },
    config.features.autoplay.options.map((n) =>
      button(String(n), 'btn btn-count', () => {
        modal.close();
        onStart(n, stopOnFeature);
      }, { 'data-count': String(n) }),
    ),
  );

  modal.body.append(
    el('p', { class: 'modal-note', text: 'Spins play at the current bet and speed. Press the autoplay button again to stop at any time.' }),
    counts,
    el('label', { class: 'autoplay-flag', for: 'ap-stop-feature' }, [checkbox, el('span', { text: ' Stop when free spins trigger' })]),
  );
  modal.open();
  return modal;
}
