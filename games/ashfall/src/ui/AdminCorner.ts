import type { GameStore } from '@/state/GameStore';
import type { SealedOutcomeSource } from '@/state/OutcomeSource';
import { button, el } from './dom';

interface RotateResult {
  closedCycle: number;
  newCycle: number;
  merkleRoot: string;
  txs: { close: string; reveal: string; commit: string; cheatAttempt?: { signature: string; error: string } };
}

interface SealedState {
  cluster?: string;
  rtp: { totalRounds: number; rtp: number | null };
  games?: Record<string, { rounds: number; rtp: number | null; declared: number }>;
}

/**
 * Admin corner (sealed mode only): rotate the cycle honestly, or with a fake reveal first so the
 * chain rejects it with HashMismatch — the demo's "even we can't cheat" artifact. Mirrors the
 * dice page's admin corner. Collapsed behind a small toggle so it never competes with the game.
 */
export class AdminCorner {
  readonly root: HTMLElement;
  private readonly panel: HTMLElement;
  private readonly statusEl: HTMLElement;
  private readonly rtpEl: HTMLElement;
  private readonly honestBtn: HTMLButtonElement;
  private readonly fakeBtn: HTMLButtonElement;
  private busy = false;

  constructor(host: HTMLElement, source: SealedOutcomeSource, store: GameStore, onRotated: () => void) {
    const explorerTx = (sig: string, cluster: string | undefined): string =>
      `https://explorer.solana.com/tx/${sig}?${cluster === 'devnet' ? 'cluster=devnet' : 'cluster=custom&customUrl=http%3A%2F%2Flocalhost%3A8899'}`;
    let cluster: string | undefined;

    this.statusEl = el('div', { class: 'admin-status', text: 'Rotating closes this cycle on-chain (Merkle root + totals), reveals the seed, and seals a new one.' });
    this.rtpEl = el('div', { class: 'admin-rtp', text: '' });

    const rotate = async (dishonest: boolean): Promise<void> => {
      if (this.busy || store.get().phase !== 'idle') return;
      this.busy = true;
      this.render(store.get().phase);
      this.statusEl.textContent = dishonest ? 'rotating — sending a WRONG reveal first…' : 'rotating…';
      try {
        const res = await fetch(`${source.serverUrl}/cycle/${dishonest ? 'rotate-dishonest' : 'rotate'}`, { method: 'POST' });
        if (!res.ok) throw new Error(`${res.status} ${await res.text()}`);
        const r = (await res.json()) as RotateResult;
        this.statusEl.replaceChildren(
          el('span', { text: `cycle #${r.closedCycle} closed + revealed · cycle #${r.newCycle} sealed ` }),
          el('a', { href: explorerTx(r.txs.reveal, cluster), target: '_blank', rel: 'noreferrer', text: 'reveal tx ↗' }),
        );
        if (r.txs.cheatAttempt) {
          this.statusEl.append(
            el('br'),
            el('span', { class: 'admin-rejected', text: 'REJECTED' }),
            el('span', { text: ` fake reveal on-chain (${r.txs.cheatAttempt.error}) ` }),
            el('a', { href: explorerTx(r.txs.cheatAttempt.signature, cluster), target: '_blank', rel: 'noreferrer', text: 'see the failed tx ↗' }),
          );
        }
        onRotated();
        void this.loadRtp();
      } catch (e) {
        this.statusEl.textContent = `rotate failed: ${(e as Error).message} — if the public RPC rate-limited us, press again; rotation resumes where it stopped.`;
      } finally {
        this.busy = false;
        this.render(store.get().phase);
      }
    };

    this.honestBtn = button('Rotate cycle (honest)', 'btn btn-admin', () => void rotate(false));
    this.fakeBtn = button('Rotate with a fake reveal first', 'btn btn-admin btn-admin-danger', () => void rotate(true));
    this.panel = el('div', { class: 'admin-panel', hidden: true }, [
      el('div', { class: 'admin-title', text: 'Admin corner' }),
      el('div', { class: 'admin-buttons' }, [this.honestBtn, this.fakeBtn]),
      this.statusEl,
      this.rtpEl,
    ]);
    const toggle = button('⚙ Admin', 'btn btn-admin-toggle', () => {
      this.panel.hidden = !this.panel.hidden;
      if (!this.panel.hidden) void this.loadRtp();
    }, { 'aria-label': 'Admin corner' });
    this.root = el('div', { class: 'admin-corner' }, [toggle, this.panel]);
    host.appendChild(this.root);

    this.loadRtp = async (): Promise<void> => {
      try {
        const s = (await (await fetch(`${source.serverUrl}/state`)).json()) as SealedState;
        cluster = s.cluster;
        const slot = s.games?.['ashfall'];
        const pct = (v: number | null | undefined): string => (v === null || v === undefined ? 'n/a' : `${(v * 100).toFixed(2)}%`);
        this.rtpEl.textContent = `on-chain RTP so far: ${pct(s.rtp.rtp)} over ${s.rtp.totalRounds} rounds (all games) · Ashfall ${pct(slot?.rtp)} over ${slot?.rounds ?? 0} spins · declared ${slot ? pct(slot.declared) : '96.56%'}`;
      } catch {
        this.rtpEl.textContent = 'server offline';
      }
    };
    store.subscribe((st) => this.render(st.phase));
    this.render(store.get().phase);
  }

  private readonly loadRtp: () => Promise<void>;

  private render(phase: string): void {
    const enabled = phase === 'idle' && !this.busy;
    this.honestBtn.disabled = !enabled;
    this.fakeBtn.disabled = !enabled;
  }
}
