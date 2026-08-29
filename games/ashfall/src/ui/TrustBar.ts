import type { GameStore } from '@/state/GameStore';
import type { SealedOutcomeSource } from '@/state/OutcomeSource';
import { el } from './dom';

interface SealedState {
  cluster?: string;
  active_cycle: { cycle_id: number; seed_hash: string; pda: string; rounds: number } | null;
}

/**
 * The trust ritual, always visible: which sealed cycle this spin belongs to, the on-chain
 * commitment, the player's editable client seed, and a link to the public verifier.
 */
export class TrustBar {
  readonly root: HTMLElement;
  private readonly hashEl: HTMLElement;
  private readonly linkEl: HTMLAnchorElement;
  private readonly seedInput: HTMLInputElement;
  private readonly cycleEl: HTMLElement;
  private readonly roundsEl: HTMLElement;
  /** Re-read the sealed cycle from the server (the admin corner calls this after a rotation). */
  readonly refresh: () => Promise<void>;

  constructor(host: HTMLElement, source: SealedOutcomeSource, clientSeedKey: string, store: GameStore) {
    const verifyUrl = (import.meta.env['VITE_SEALED_VERIFY_URL'] as string | undefined) ?? 'http://localhost:5173/verify';
    this.cycleEl = el('span', { class: 'trust-cycle', text: 'cycle —' });
    this.hashEl = el('code', { class: 'trust-hash', text: '…' });
    this.linkEl = el('a', { class: 'trust-link', href: '#', target: '_blank', rel: 'noreferrer', text: 'view on chain' }) as HTMLAnchorElement;
    this.seedInput = el('input', { class: 'trust-seed', value: localStorage.getItem(clientSeedKey) ?? '', 'aria-label': 'client seed', spellcheck: 'false' }) as HTMLInputElement;
    this.seedInput.addEventListener('change', () => {
      localStorage.setItem(clientSeedKey, this.seedInput.value.slice(0, 64) || 'seed');
    });
    this.roundsEl = el('span', { class: 'trust-rounds', text: '', title: 'Spins are recorded off-chain and sealed by a Merkle root when the cycle closes — nothing is written per spin.' });
    this.root = el('div', { class: 'trust-bar' }, [
      el('span', { class: 'trust-lock', text: '🔒' }),
      this.cycleEl,
      el('span', { class: 'trust-label', text: 'committed ✓' }),
      this.hashEl,
      this.linkEl,
      el('span', { class: 'trust-sep', text: '·' }),
      this.roundsEl,
      el('span', { class: 'trust-sep', text: '·' }),
      el('label', { class: 'trust-seed-label', text: 'client seed ' }, [this.seedInput]),
      el('span', { class: 'trust-sep', text: '·' }),
      el('a', { class: 'trust-link', href: verifyUrl, target: '_blank', rel: 'noreferrer', text: 'verify ↗' }),
    ]);
    host.appendChild(this.root);

    const refresh = async (): Promise<void> => {
      try {
        const s = (await (await fetch(`${source.serverUrl}/state`)).json()) as SealedState;
        if (s.active_cycle) {
          const h = s.active_cycle.seed_hash;
          this.cycleEl.textContent = `cycle #${s.active_cycle.cycle_id}`;
          this.hashEl.textContent = `${h.slice(0, 10)}…${h.slice(-6)}`;
          this.hashEl.title = h;
          const n = s.active_cycle.rounds;
          this.roundsEl.textContent = `${n} round${n === 1 ? '' : 's'} recorded · sealed at rotate`;
          const q = s.cluster === 'devnet' ? 'cluster=devnet' : 'cluster=custom&customUrl=http%3A%2F%2Flocalhost%3A8899';
          this.linkEl.href = `https://explorer.solana.com/address/${s.active_cycle.pda}/history?${q}`;
        }
      } catch {
        this.hashEl.textContent = 'server offline';
      }
    };
    this.refresh = refresh;
    void refresh();
    window.setInterval(() => void refresh(), 10_000);
    store.subscribe((st, prev) => {
      if (st.phase === 'idle' && prev.phase !== 'idle') void refresh();
    });
  }
}
