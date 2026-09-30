import GUI from 'lil-gui';

export type DebugTuning = {
  exposure: number;
  bloom: number;
  maxDpr: number;
};

/** Live tuning panel, only with ?debug in the URL. */
export class DebugTools {
  private gui: GUI | null = null;

  constructor(tuning: DebugTuning, onChange: () => void) {
    if (!new URLSearchParams(window.location.search).has('debug')) return;
    this.gui = new GUI({ title: 'Submariner tuning' });
    this.gui.add(tuning, 'exposure', 0.4, 2, 0.01).onChange(onChange);
    this.gui.add(tuning, 'bloom', 0, 2, 0.01).onChange(onChange);
    this.gui.add(tuning, 'maxDpr', 1, 2, 0.25).onChange(onChange);
  }

  setHidden(hidden: boolean): void {
    if (!this.gui) return;
    if (hidden) this.gui.hide();
    else this.gui.show();
  }

  dispose(): void {
    this.gui?.destroy();
    this.gui = null;
  }
}
