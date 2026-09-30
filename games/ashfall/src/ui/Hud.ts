import type { GameConfig } from "@math/types";
import { buyCostCoins } from "@math/buy";
import type { GameState, GameStore, TurboMode } from "@/state/GameStore";
import { coinsToCents, formatCents } from "@/state/money";
import { button, el, icon } from "./dom";
import { ICONS } from "./icons";

export interface HudActions {
  spin: () => void;
  spinPressStart?: () => void;
  spinPressEnd?: () => void;
  betUp: () => void;
  betDown: () => void;
  cycleTurbo: () => void;
  toggleSound: () => void;
  openBuy: () => void;
  openAutoplay: () => void;
  stopAutoplay: () => void;
  openInfo: () => void;
  openSettings: () => void;
}

const TURBO_LABEL: Record<TurboMode, { icon: string; label: string }> = {
  normal: { icon: ICONS.bolt, label: "Normal" },
  turbo: { icon: ICONS.bolt2, label: "Turbo" },
  quick: { icon: ICONS.bolt3, label: "Quick" },
};

/**
 * DOM chrome: balance, bet, win, spin, turbo, buy bonus, autoplay, info, sound, settings.
 * Pure view: reflects the store; dispatches actions.
 */
export class Hud {
  readonly root: HTMLElement;
  private readonly balanceEl: HTMLElement;
  private readonly betEl: HTMLElement;
  private readonly winEl: HTMLElement;
  private readonly winLabelEl: HTMLElement;
  private readonly spinBtn: HTMLButtonElement;
  private readonly turboBtn: HTMLButtonElement;
  private readonly soundBtn: HTMLButtonElement;
  private readonly buyBtn: HTMLButtonElement;
  private readonly autoBtn: HTMLButtonElement;
  private readonly betUpBtn: HTMLButtonElement;
  private readonly betDownBtn: HTMLButtonElement;
  private readonly buyCostEl: HTMLElement;
  private readonly messageEl: HTMLElement;
  private readonly config: GameConfig;
  private readonly store: GameStore;
  private messageTimer: number | null = null;

  constructor(
    host: HTMLElement,
    config: GameConfig,
    store: GameStore,
    actions: HudActions,
  ) {
    this.config = config;
    this.store = store;

    this.balanceEl = el("div", { class: "hud-value", "aria-live": "polite" });
    this.betEl = el("div", { class: "hud-value" });
    this.winEl = el("div", {
      class: "hud-value hud-win-value",
      "aria-live": "polite",
    });
    this.winLabelEl = el("div", { class: "hud-label", text: "Win" });
    this.messageEl = el("div", { class: "hud-message", role: "status" });
    this.buyCostEl = el("span", { class: "buy-cost" });

    this.betDownBtn = button(
      icon(ICONS.minus, 18),
      "btn btn-round btn-small",
      () => actions.betDown(),
      { "aria-label": "Decrease bet" },
    );
    this.betUpBtn = button(
      icon(ICONS.plus, 18),
      "btn btn-round btn-small",
      () => actions.betUp(),
      { "aria-label": "Increase bet" },
    );

    this.spinBtn = button(
      `<span class="spin-face">${icon(ICONS.spin, 34)}<span class="spin-word">SPIN</span></span>`,
      "btn btn-spin",
      () => actions.spin(),
      { "aria-label": "Spin", "data-action": "spin" },
    );
    this.spinBtn.addEventListener("pointerdown", () =>
      actions.spinPressStart?.(),
    );
    this.spinBtn.addEventListener("pointerup", () => actions.spinPressEnd?.());
    this.spinBtn.addEventListener("pointerleave", () =>
      actions.spinPressEnd?.(),
    );
    this.spinBtn.addEventListener("pointercancel", () =>
      actions.spinPressEnd?.(),
    );

    this.turboBtn = button("", "btn btn-round", () => actions.cycleTurbo(), {
      "aria-label": "Turbo mode",
      "data-action": "turbo",
    });
    this.soundBtn = button("", "btn btn-round", () => actions.toggleSound(), {
      "aria-label": "Sound",
      "data-action": "sound",
    });
    this.autoBtn = button(
      icon(ICONS.auto, 26),
      "btn btn-round",
      () => {
        if (this.store.get().autoplayRemaining > 0) actions.stopAutoplay();
        else actions.openAutoplay();
      },
      { "aria-label": "Autoplay", "data-action": "autoplay" },
    );
    const infoBtn = button(
      icon(ICONS.info, 22),
      "btn btn-round btn-small",
      () => actions.openInfo(),
      { "aria-label": "Paytable and rules", "data-action": "info" },
    );
    const settingsBtn = button(
      icon(ICONS.gear, 22),
      "btn btn-round btn-small",
      () => actions.openSettings(),
      { "aria-label": "Settings", "data-action": "settings" },
    );

    this.buyBtn = button("", "btn btn-buy", () => actions.openBuy(), {
      "aria-label": "Buy bonus",
      "data-action": "buy",
    });
    this.buyBtn.append(
      el("span", { class: "buy-icon", html: icon(ICONS.egg, 28) }),
      el("span", { class: "buy-title", text: "Buy bonus" }),
      this.buyCostEl,
    );
    if (!config.features.bonusBuy.enabled) this.buyBtn.hidden = true;

    const left = el("div", { class: "hud-group hud-left" }, [
      el("div", { class: "hud-stat" }, [
        el("div", { class: "hud-label", text: "Balance" }),
        this.balanceEl,
      ]),
      el("div", { class: "hud-stat hud-bet" }, [
        el("div", { class: "hud-label", text: "Bet" }),
        el("div", { class: "hud-bet-row" }, [
          this.betDownBtn,
          this.betEl,
          this.betUpBtn,
        ]),
      ]),
    ]);
    const centre = el("div", { class: "hud-group hud-centre" }, [
      this.autoBtn,
      this.spinBtn,
      this.turboBtn,
    ]);
    const right = el("div", { class: "hud-group hud-right" }, [
      el("div", { class: "hud-stat hud-win" }, [this.winLabelEl, this.winEl]),
      el("div", { class: "hud-icons" }, [infoBtn, this.soundBtn, settingsBtn]),
    ]);

    this.root = el(
      "div",
      { class: "hud", role: "toolbar", "aria-label": "Game controls" },
      [left, centre, right],
    );
    host.append(this.buyBtn, this.messageEl, this.root);

    store.subscribe((s) => this.render(s));
    this.render(store.get());
  }

  showMessage(text: string, ms = 2400): void {
    this.messageEl.textContent = text;
    this.messageEl.classList.add("visible");
    if (this.messageTimer !== null) window.clearTimeout(this.messageTimer);
    this.messageTimer = window.setTimeout(
      () => this.messageEl.classList.remove("visible"),
      ms,
    );
  }

  private render(s: GameState): void {
    const bet = this.store.bet;
    this.balanceEl.textContent = formatCents(s.balanceCents);
    this.betEl.textContent = formatCents(Math.round(bet * 100));
    this.winEl.textContent =
      s.lastWinCents > 0 ? formatCents(s.lastWinCents) : formatCents(0);
    this.winEl.classList.toggle("has-win", s.lastWinCents > 0);

    const idle = s.phase === "idle";
    this.spinBtn.disabled = s.phase === "booting";
    this.spinBtn.classList.toggle("is-busy", !idle);
    this.betUpBtn.disabled =
      !idle || s.betIndex >= this.config.betLevels.length - 1;
    this.betDownBtn.disabled = !idle || s.betIndex <= 0;
    this.buyBtn.disabled = !idle;
    this.autoBtn.classList.toggle("is-active", s.autoplayRemaining > 0);
    this.autoBtn.innerHTML =
      s.autoplayRemaining > 0
        ? `<span class="auto-count">${s.autoplayRemaining}</span>`
        : icon(ICONS.auto, 24);
    this.autoBtn.setAttribute(
      "aria-label",
      s.autoplayRemaining > 0
        ? `Stop autoplay (${s.autoplayRemaining} left)`
        : "Autoplay",
    );

    const t = TURBO_LABEL[s.turboMode];
    this.turboBtn.innerHTML = icon(t.icon, 24);
    this.turboBtn.setAttribute("aria-label", `Speed: ${t.label}`);
    this.turboBtn.dataset["mode"] = s.turboMode;
    this.turboBtn.title = `Speed: ${t.label}`;

    this.soundBtn.innerHTML = icon(s.soundOn ? ICONS.sound : ICONS.mute, 22);
    this.soundBtn.classList.toggle("is-off", !s.soundOn);

    const cost = coinsToCents(
      buyCostCoins(this.config, "free"),
      bet,
      this.config.coinsPerBet,
    );
    this.buyCostEl.textContent = formatCents(cost);
  }
}
