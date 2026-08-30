import type { GameStore } from '@/state/GameStore';
import type { SealedOutcomeSource } from '@/state/OutcomeSource';
import { button, el } from './dom';

type StepStatus = 'pending' | 'running' | 'done' | 'rejected' | 'failed' | 'skipped';
interface RotationStep {
  key: string;
  label: string;
  status: StepStatus;
  detail?: string;
  signature?: string;
}
interface RotationStatus {
  id: number;
  cycleId: number;
  dishonest: boolean;
  startedAt: number;
  finishedAt?: number;
  ok?: boolean;
  error?: string;
  newCycle?: number;
  steps: RotationStep[];
}
const STEP_ICON: Record<StepStatus, string> = { pending: '○', running: '◌', done: '✓', rejected: '✗', failed: '!', skipped: '–' };

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

    this.statusEl = el('div', { class: 'admin-status', text: 'Rotating ends this cycle: its Merkle root + totals go on-chain, the seed is revealed and hash-checked by the program, then a new cycle is sealed. The second button first tries a WRONG seed so you can watch the chain refuse it.' });
    this.rtpEl = el('div', { class: 'admin-rtp', text: '' });

    const verifyUrl = (import.meta.env['VITE_SEALED_VERIFY_URL'] as string | undefined) ?? (import.meta.env.PROD ? '/verify' : 'http://localhost:5173/verify');

    /** Render the server's step-by-step rotation status (polled live, then final). */
    const renderTimeline = (r: RotationStatus): void => {
      const elapsed = ((r.finishedAt ?? Date.now()) - r.startedAt) / 1000;
      const list = el('ol', { class: 'rot-steps' }, r.steps.map((st) => {
        const body: (Node | string)[] = [el('span', { class: 'rot-label', text: st.label })];
        if (st.detail) {
          const d = el('span', { class: 'rot-detail' });
          if (st.status === 'rejected') d.append(el('span', { class: 'admin-rejected', text: 'REJECTED' }), ' ');
          d.append(st.detail);
          body.push(d);
        }
        if (st.signature) body.push(el('a', { class: 'rot-tx', href: explorerTx(st.signature, cluster), target: '_blank', rel: 'noreferrer', text: st.status === 'rejected' ? 'see the failed transaction ↗' : 'transaction ↗' }));
        return el('li', { class: `rot-step ${st.status}` }, [el('span', { class: 'rot-icon', text: STEP_ICON[st.status] }), el('span', { class: 'rot-body' }, body)]);
      }));
      const foot: (Node | string)[] = [];
      if (r.finishedAt && r.ok) {
        foot.push(el('p', { class: 'rot-foot' }, [
          `Cycle #${r.cycleId} is now public — every round verifiable. `,
          el('a', { href: `${verifyUrl}?cycle=${r.cycleId}`, target: '_blank', rel: 'noreferrer', text: `Verify cycle #${r.cycleId} ↗` }),
          ` Cycle #${r.newCycle} is sealed and live.`,
        ]));
      } else if (r.finishedAt && !r.ok) {
        foot.push(el('p', { class: 'rot-foot rot-err', text: `${r.error ?? 'failed'} — press again; rotation resumes from on-chain state.` }));
      }
      this.statusEl.replaceChildren(
        el('div', { class: `rotation ${r.finishedAt ? (r.ok ? 'finished' : 'errored') : 'live'}` }, [
          el('div', { class: 'rot-head' }, [
            el('strong', { text: `${r.dishonest ? 'Rotate with a fake reveal' : 'Rotate cycle'} — cycle #${r.cycleId}` }),
            el('span', { class: 'rot-time', text: r.finishedAt ? `${elapsed.toFixed(1)} s` : 'in progress…' }),
          ]),
          list,
          ...foot,
        ]),
      );
    };
    const pollRotation = async (): Promise<void> => {
      try {
        const r = (await (await fetch(`${source.serverUrl}/cycle/rotation`)).json()) as RotationStatus;
        if (r.steps?.length) renderTimeline(r);
      } catch {
        /* keep the last render */
      }
    };

    const rotate = async (dishonest: boolean): Promise<void> => {
      if (this.busy || store.get().phase !== 'idle') return;
      this.busy = true;
      this.render(store.get().phase);
      this.statusEl.textContent = dishonest ? 'rotating — sending a WRONG reveal first…' : 'rotating…';
      const poll = window.setInterval(() => void pollRotation(), 500);
      try {
        const res = await fetch(`${source.serverUrl}/cycle/${dishonest ? 'rotate-dishonest' : 'rotate'}`, { method: 'POST' });
        if (!res.ok) throw new Error(`${res.status} ${await res.text()}`);
        onRotated();
        void this.loadRtp();
      } catch {
        /* the timeline carries the failure */
      } finally {
        window.clearInterval(poll);
        await pollRotation();
        this.busy = false;
        this.render(store.get().phase);
      }
    };

    this.honestBtn = button('Rotate cycle (honest)', 'btn btn-admin', () => void rotate(false));
    this.fakeBtn = button('Rotate with a fake reveal first', 'btn btn-admin btn-admin-danger', () => void rotate(true));
    const collapse = button('hide', 'btn btn-admin-collapse', () => {
      this.root.classList.toggle('collapsed');
      collapse.textContent = this.root.classList.contains('collapsed') ? 'show' : 'hide';
    }, { 'aria-label': 'Collapse admin corner' });
    this.panel = el('div', { class: 'admin-panel' }, [
      el('div', { class: 'admin-title' }, [el('span', { text: '⚙ Admin corner' }), collapse]),
      el('div', { class: 'admin-sub', text: 'Provably-fair cycle controls (the same ones the dice page has).' }),
      el('div', { class: 'admin-buttons' }, [this.honestBtn, this.fakeBtn]),
      this.statusEl,
      this.rtpEl,
    ]);
    this.root = el('div', { class: 'admin-corner' }, [this.panel]);
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
    void this.loadRtp();
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
