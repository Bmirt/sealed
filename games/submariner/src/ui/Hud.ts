import { ZONES, depthFor, zoneFor } from '../game/crash';
import { BOARDING_SECONDS, MAX_STAKE_CENTS, MIN_STAKE_CENTS, type BetSlip, type RoundState } from '../game/RoundState';

export interface HudIntents {
  bet(slip: BetSlip): void;
  cancel(): void;
  cashOut(): void;
  autoBet(on: boolean): void;
  toggleSound(): void;
  refill(): void;
  /** Any UI press (for the click sound). */
  press(): void;
}

const usd = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' });
export const money = (cents: number): string => usd.format(cents / 100);
const mult = (m: number): string => `${m.toFixed(2)}×`;
const PREFS = 'submariner.prefs';
const GAUGE_MAX = 2000;
const gaugePos = (depth: number): number => Math.sqrt(Math.min(depth, GAUGE_MAX) / GAUGE_MAX);

function el<T extends HTMLElement>(sel: string): T {
  const node = document.querySelector<T>(sel);
  if (!node) throw new Error(`Missing ${sel}`);
  return node;
}

/**
 * DOM HUD. Reads the RoundState (single source of truth) every frame and dispatches intents;
 * it never changes game rules itself. Numbers use tabular figures and fixed slots so nothing
 * shifts while values tick.
 */
export class Hud {
  private readonly readout = el<HTMLElement>('#readout');
  private readonly phaseLabel = el<HTMLElement>('#phase-label');
  private readonly multiplier = el<HTMLElement>('#multiplier');
  private readonly depth = el<HTMLElement>('#depth');
  private readonly zone = el<HTMLElement>('#zone');
  private readonly countdownBar = el<HTMLElement>('#countdown i');
  private readonly balance = el<HTMLElement>('#balance');
  private readonly refillBtn = el<HTMLButtonElement>('#refill');
  private readonly history = el<HTMLOListElement>('#history');
  private readonly stake = el<HTMLInputElement>('#stake');
  private readonly autoOn = el<HTMLInputElement>('#auto-cashout-on');
  private readonly autoValue = el<HTMLInputElement>('#auto-cashout');
  private readonly autoBet = el<HTMLInputElement>('#auto-bet');
  private readonly action = el<HTMLButtonElement>('#action');
  private readonly actionVerb = el<HTMLElement>('#action .verb');
  private readonly actionSub = el<HTMLElement>('#action .sub');
  private readonly sound = el<HTMLButtonElement>('#sound');
  private readonly toasts = el<HTMLElement>('#toasts');
  private readonly flashEl = el<HTMLElement>('#flash');
  private readonly fadeEl = el<HTMLElement>('#fade');
  private readonly gaugeMarker = el<HTMLElement>('#gauge-marker');
  private readonly gaugeDepth = el<HTMLElement>('#gauge-depth');
  private readonly panel = el<HTMLElement>('#bet-panel');
  private historyKey = '';
  private lastText = '';
  private actionMode = '';

  constructor(
    private readonly state: RoundState,
    private readonly intents: HudIntents,
  ) {
    this.restorePrefs();
    this.buildGauge();
    const lobby = el<HTMLAnchorElement>('#lobby');
    lobby.href = (import.meta.env['VITE_LOBBY_URL'] as string | undefined) ?? (import.meta.env.PROD ? '/' : 'http://localhost:5173/');

    this.action.addEventListener('click', () => this.primary());
    el('#bet-panel').addEventListener('click', (e) => {
      const t = e.target as HTMLElement;
      const btn = t.closest('button');
      if (btn) intents.press();
      const step = btn?.getAttribute('data-step');
      const quick = btn?.getAttribute('data-quick');
      if (step) this.setStake(step === 'up' ? this.stakeCents * 2 : Math.floor(this.stakeCents / 2));
      if (quick) this.setStake(Number(quick));
    });
    this.stake.addEventListener('change', () => this.setStake(this.stakeCents));
    this.autoValue.addEventListener('change', () => {
      const v = Math.max(1.01, Math.min(10_000, Number(this.autoValue.value.replace(/[×x,\s]/gi, '')) || 2));
      this.autoValue.value = v.toFixed(2);
      this.savePrefs();
    });
    this.autoOn.addEventListener('change', () => {
      intents.press();
      this.savePrefs();
    });
    this.autoBet.addEventListener('change', () => {
      intents.press();
      intents.autoBet(this.autoBet.checked);
    });
    this.sound.addEventListener('click', () => intents.toggleSound());
    this.refillBtn.addEventListener('click', () => intents.refill());
    window.addEventListener('keydown', (e) => {
      if (e.code !== 'Space' || e.repeat) return;
      if (e.target instanceof HTMLInputElement && e.target.type !== 'checkbox') return;
      e.preventDefault();
      this.primary();
    });
    new ResizeObserver(() => this.syncPanelHeight()).observe(this.panel);
    this.syncPanelHeight();
  }

  /** Fraction of the screen height (from the top) where the sub should sit, clear of HUD. */
  subScreenY = 0.5;

  private syncPanelHeight(): void {
    const panelTop = this.panel.getBoundingClientRect().top;
    const readoutBottom = this.readout.getBoundingClientRect().bottom;
    document.documentElement.style.setProperty('--panel-h', `${Math.round(this.panel.offsetHeight)}px`);
    const h = window.innerHeight || 1;
    // Centre the sub in the free band between the readout and the bet panel.
    this.subScreenY = Math.min(0.62, Math.max(0.38, (readoutBottom + panelTop) / 2 / h + 0.02));
  }

  get stakeCents(): number {
    const v = Math.round(Number(this.stake.value.replace(/[$,\s]/g, '')) * 100);
    return Number.isFinite(v) ? v : 0;
  }

  private setStake(cents: number): void {
    const clamped = Math.max(MIN_STAKE_CENTS, Math.min(MAX_STAKE_CENTS, Math.round(cents)));
    this.stake.value = (clamped / 100).toFixed(2);
    this.savePrefs();
  }

  private slip(): BetSlip {
    return { stakeCents: this.stakeCents, autoCashout: this.autoOn.checked ? Number(this.autoValue.value) : null };
  }

  /** The one big button: bet / cancel / cash out, depending on the moment. */
  private primary(): void {
    const s = this.state;
    const mode = this.mode();
    if (mode === 'cashout') this.intents.cashOut();
    else if (mode === 'cancel' || mode === 'queued') this.intents.cancel();
    else this.intents.bet(this.slip());
    void s;
  }

  private mode(): 'bet' | 'bet-next' | 'cancel' | 'queued' | 'cashout' {
    const s = this.state;
    if (s.phase === 'diving' && s.bet && s.bet.cashedAt === null) return 'cashout';
    if (s.queued) return 'queued';
    if (s.phase === 'boarding') return s.bet ? 'cancel' : 'bet';
    return 'bet-next';
  }

  update(): void {
    const s = this.state;
    const m = s.shownMultiplier;
    const depthM = s.phase === 'boarding' ? 0 : depthFor(m);

    // readout
    let label: string;
    let big: string;
    if (s.phase === 'boarding') {
      label = 'Next dive in';
      big = `${s.countdown.toFixed(1)}<small>s</small>`;
      this.countdownBar.style.transform = `scaleX(${(s.countdown / BOARDING_SECONDS).toFixed(3)})`;
    } else if (s.phase === 'diving') {
      label = s.bet?.cashedAt ? `Cashed out at ${mult(s.bet.cashedAt)}` : 'Diving';
      big = mult(m);
    } else {
      label = 'Hull imploded at';
      big = mult(m);
    }
    const text = label + big;
    if (text !== this.lastText) {
      this.phaseLabel.textContent = label;
      this.multiplier.innerHTML = big;
      this.lastText = text;
    }
    this.readout.className = `${s.phase}${s.phase === 'diving' && m >= 2 ? ' hot' : ''}`;
    this.depth.textContent = `${Math.round(depthM).toLocaleString('en-US')} m`;
    this.zone.textContent = zoneFor(depthM).name;
    this.gaugeMarker.style.top = `${(gaugePos(depthM) * 100).toFixed(2)}%`;
    this.gaugeDepth.textContent = `${Math.round(depthM).toLocaleString('en-US')} m`;

    // wallet
    const bal = money(s.balanceCents);
    if (this.balance.textContent !== bal) this.balance.textContent = bal;
    this.refillBtn.hidden = !(s.balanceCents < MIN_STAKE_CENTS && !s.bet);
    this.autoBet.checked = s.autoBet;

    // action button
    const mode = this.mode();
    let verb = 'BET';
    let sub = money(this.stakeCents);
    let cls = 'bet';
    if (mode === 'cashout') {
      verb = 'CASH OUT';
      sub = money(Math.floor(s.bet!.stakeCents * m));
      cls = 'cashout';
    } else if (mode === 'cancel') {
      verb = 'CANCEL';
      sub = `${money(s.bet!.stakeCents)} on this dive`;
      cls = 'cancel';
    } else if (mode === 'queued') {
      verb = 'CANCEL';
      sub = `${money(s.queued!.stakeCents)} queued for next dive`;
      cls = 'queued';
    } else if (mode === 'bet-next') {
      sub = `${money(this.stakeCents)} on next dive`;
    }
    if (this.actionMode !== cls) {
      this.action.className = `action ${cls}`;
      this.actionMode = cls;
    }
    if (this.actionVerb.textContent !== verb) this.actionVerb.textContent = verb;
    if (this.actionSub.textContent !== sub) this.actionSub.textContent = sub;
    const locked = mode === 'cancel' || mode === 'cashout' || mode === 'queued';
    for (const input of [this.stake, this.autoValue, this.autoOn]) input.disabled = locked;
    for (const b of this.panel.querySelectorAll<HTMLButtonElement>('.step, .quick button')) b.disabled = locked;

    // history strip
    const key = s.history.slice(0, 16).join(',');
    if (key !== this.historyKey) {
      const fresh = this.historyKey !== '' && s.history.length > 0;
      this.historyKey = key;
      this.history.replaceChildren(
        ...s.history.slice(0, 16).map((c, i) => {
          const li = document.createElement('li');
          li.textContent = mult(c);
          li.className = `${c >= 10 ? 'high' : c >= 2 ? 'mid' : 'low'}${fresh && i === 0 ? ' fresh' : ''}`;
          return li;
        }),
      );
    }
  }

  setSoundMuted(muted: boolean): void {
    this.sound.setAttribute('aria-pressed', String(muted));
    this.sound.setAttribute('aria-label', muted ? 'Unmute sound' : 'Mute sound');
  }

  toast(text: string, kind: 'win' | 'loss' | 'info'): void {
    const t = document.createElement('div');
    t.className = `toast ${kind}`;
    t.textContent = text;
    this.toasts.prepend(t);
    while (this.toasts.children.length > 3) this.toasts.lastElementChild?.remove();
    window.setTimeout(() => t.remove(), 3100);
  }

  pulse(): void {
    this.readout.classList.remove('pulse');
    void this.readout.offsetWidth;
    this.readout.classList.add('pulse');
  }

  bumpBalance(): void {
    this.balance.classList.remove('bump');
    void this.balance.offsetWidth;
    this.balance.classList.add('bump');
  }

  flash(): void {
    this.flashEl.classList.remove('go');
    void this.flashEl.offsetWidth;
    this.flashEl.classList.add('go');
  }

  fade(on: boolean): void {
    this.fadeEl.classList.toggle('on', on);
  }

  private buildGauge(): void {
    const ticks = el<HTMLUListElement>('#gauge .ticks');
    const bands = [...document.querySelectorAll<HTMLElement>('#gauge .band')];
    ZONES.forEach((z, i) => {
      const next = ZONES[i + 1];
      const band = bands[i];
      if (band && next) band.style.height = `${((gaugePos(next.from) - gaugePos(z.from)) * 100).toFixed(2)}%`;
    });
    for (const d of [0, 150, 600, 1300, 2000]) {
      const li = document.createElement('li');
      li.style.top = `${(gaugePos(d) * 100).toFixed(2)}%`;
      li.textContent = `${d.toLocaleString('en-US')} m`;
      ticks.append(li);
    }
  }

  private restorePrefs(): void {
    try {
      const p = JSON.parse(localStorage.getItem(PREFS) ?? '{}') as { stake?: number; auto?: boolean; target?: number };
      if (typeof p.stake === 'number') this.stake.value = (p.stake / 100).toFixed(2);
      if (typeof p.auto === 'boolean') this.autoOn.checked = p.auto;
      if (typeof p.target === 'number') this.autoValue.value = p.target.toFixed(2);
    } catch {
      /* first visit or private mode */
    }
  }

  private savePrefs(): void {
    try {
      localStorage.setItem(PREFS, JSON.stringify({ stake: this.stakeCents, auto: this.autoOn.checked, target: Number(this.autoValue.value) }));
    } catch {
      /* private mode */
    }
  }
}
