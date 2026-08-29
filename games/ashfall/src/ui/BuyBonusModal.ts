import { buyCostCoins } from "@math/buy";
import type { FeatureTier, GameConfig } from "@math/types";
import type { GameStore } from "@/state/GameStore";
import { coinsToCents, formatCents } from "@/state/money";
import { button, el, icon } from "./dom";
import { ICONS } from "./icons";
import { Modal } from "./Modal";

/**
 * Buy bonus confirmation: exact cost at the current stake, feature RTP, insufficient-balance
 * state. The super tier is flag-gated. Nothing is bought without an explicit confirm.
 */
export function openBuyModal(
  host: HTMLElement,
  config: GameConfig,
  store: GameStore,
  onBuy: (tier: FeatureTier) => void,
): Modal | null {
  if (!config.features.bonusBuy.enabled) return null;
  const modal = new Modal(host, "Buy bonus", "modal-buy");
  const bet = store.bet;

  const card = (tier: FeatureTier): HTMLElement => {
    const cfg = tier === "free" ? config.buy.free : config.buy.super;
    const cost = coinsToCents(
      buyCostCoins(config, tier),
      bet,
      config.coinsPerBet,
    );
    const rtp =
      tier === "free"
        ? config.rtp.declaredBuyFree
        : config.rtp.declaredBuySuper;
    const afford = store.get().balanceCents >= cost;
    const title = tier === "free" ? "Summon the Dragons" : "Wake the Elder";
    const lines =
      tier === "free"
        ? [
            "10–20 Dragonfire Free Spins",
            "Meter starts ×1, +1 every 3rd win",
            "Retriggers active",
          ]
        : [
            `${config.buy.super.spins} Super Free Spins`,
            `Meter starts ×${config.buy.super.meter.start}, +${config.buy.super.meter.step} on EVERY win`,
            "Retriggers active",
          ];
    const confirm = button(
      `${icon(ICONS.egg, 20)} BUY · ${formatCents(cost)}`,
      "btn btn-confirm",
      () => {
        modal.close();
        onBuy(tier);
      },
      { "data-buy": tier },
    );
    confirm.disabled = !afford;
    return el(
      "div",
      { class: `buy-card ${tier === "super" ? "buy-card-super" : ""}` },
      [
        el("h3", { class: "buy-card-title", text: title }),
        el("div", {
          class: "buy-card-cost",
          text: `${cfg.costX.toFixed(0)}× bet = ${formatCents(cost)}`,
        }),
        el(
          "ul",
          { class: "buy-card-lines" },
          lines.map((l) => el("li", { text: l })),
        ),
        el("div", {
          class: "buy-card-rtp",
          text: `Feature RTP ${(rtp * 100).toFixed(1)}%`,
        }),
        confirm,
        afford
          ? ""
          : el("div", { class: "buy-card-warn", text: "Insufficient balance" }),
      ],
    );
  };

  const cards = [card("free")];
  if (config.features.bonusBuy.superTier) cards.push(card("super"));
  modal.body.append(
    el("div", { class: "buy-cards" }, cards),
    el("p", {
      class: "modal-note",
      text: `Current bet ${formatCents(Math.round(bet * 100))}. The triggering spin's own wins are paid. Max win 5,000× bet.`,
    }),
  );
  modal.open();
  return modal;
}
