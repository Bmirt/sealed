import { button, el, icon } from './dom';
import { ICONS } from './icons';

/**
 * Minimal modal infrastructure: one open at a time, backdrop/Escape/× to close,
 * `Modal.anyOpen` lets the input flow ignore Space while a dialog is up.
 */
export class Modal {
  private static openModal: Modal | null = null;

  static get anyOpen(): boolean {
    return Modal.openModal !== null;
  }

  static closeAll(): void {
    Modal.openModal?.close();
  }

  readonly root: HTMLElement;
  readonly body: HTMLElement;
  private readonly host: HTMLElement;
  private onCloseCb: (() => void) | null = null;
  private readonly keyHandler = (e: KeyboardEvent): void => {
    if (e.key === 'Escape') {
      e.stopPropagation();
      this.close();
    }
  };

  constructor(host: HTMLElement, title: string, cls = '') {
    this.host = host;
    this.body = el('div', { class: 'modal-body' });
    const closeBtn = button(icon(ICONS.close, 20), 'btn btn-round btn-small modal-close', () => this.close(), { 'aria-label': 'Close' });
    const panel = el('div', { class: `modal-panel ${cls}`, role: 'dialog', 'aria-modal': 'true', 'aria-label': title }, [
      el('div', { class: 'modal-header' }, [el('h2', { class: 'modal-title', text: title }), closeBtn]),
      this.body,
    ]);
    panel.addEventListener('click', (e) => e.stopPropagation());
    this.root = el('div', { class: 'modal-backdrop' }, [panel]);
    this.root.addEventListener('click', () => this.close());
  }

  onClose(cb: () => void): this {
    this.onCloseCb = cb;
    return this;
  }

  open(): void {
    Modal.openModal?.close();
    Modal.openModal = this;
    this.host.appendChild(this.root);
    window.addEventListener('keydown', this.keyHandler, { capture: true });
    requestAnimationFrame(() => this.root.classList.add('open'));
  }

  close(): void {
    if (Modal.openModal !== this) return;
    Modal.openModal = null;
    window.removeEventListener('keydown', this.keyHandler, { capture: true });
    this.root.classList.remove('open');
    this.root.remove();
    this.onCloseCb?.();
  }
}
