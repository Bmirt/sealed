import type { GameConfig, PayingSymbolId, SymbolId } from '@math/types';
import { SYMBOL_COPY } from '@/assets/manifest';
import type { TextureBank } from '@/assets/textures';
import type { GameStore } from '@/state/GameStore';
import { betCents, coinsToCents, formatCents } from '@/state/money';
import { el } from './dom';
import { Modal } from './Modal';

const PAY_ORDER: readonly PayingSymbolId[] = ['H1', 'H2', 'H3', 'M1', 'M2', 'L1', 'L2', 'L3', 'L4'];

/** Paytable & rules. Pays shown in currency at the CURRENT bet, per way. */
export function openPaytableModal(host: HTMLElement, config: GameConfig, store: GameStore, bank: TextureBank): Modal {
  const modal = new Modal(host, 'Paytable & Rules', 'modal-paytable');
  const bet = store.bet;
  const pay = (coins: number): string => formatCents(coinsToCents(coins, bet, config.coinsPerBet));

  const symbolRow = (id: SymbolId, pays: string[]): HTMLElement =>
    el('div', { class: 'pt-row' }, [
      el('img', { class: 'pt-img', src: bank.symbolDataUrl(id), alt: SYMBOL_COPY[id].title, width: '86', height: '77' }),
      el('div', { class: 'pt-info' }, [
        el('div', { class: 'pt-name', text: SYMBOL_COPY[id].title }),
        el('div', { class: 'pt-blurb', text: SYMBOL_COPY[id].blurb }),
        el('div', { class: 'pt-pays' }, pays.map((p) => el('span', { class: 'pt-pay', text: p }))),
      ]),
    ]);

  const rows: HTMLElement[] = [];
  rows.push(symbolRow('W', ['Appears on reels 2–5', 'No pay of its own']));
  rows.push(
    symbolRow('S', [
      `3× — ${pay(config.scatterPays[0])} + ${config.freeSpins.awards[3]} free spins`,
      `4× — ${pay(config.scatterPays[1])} + ${config.freeSpins.awards[4]} free spins`,
      `5× — ${pay(config.scatterPays[2])} + ${config.freeSpins.awards[5]} free spins`,
    ]),
  );
  for (const id of PAY_ORDER) {
    const line = config.paytable[id];
    rows.push(symbolRow(id, [`3× — ${pay(line[0])}`, `4× — ${pay(line[1])}`, `5× — ${pay(line[2])}`]));
  }

  const rules: [string, string][] = [
    ['243 ways', 'Symbols pay on adjacent reels from the leftmost reel, on any row. Ways = the product of matching symbols per reel. Pays shown are per way at the current bet of ' + formatCents(betCents(bet)) + '.'],
    ['Dragonfire Free Spins', `3, 4 or 5 Dragon Eggs award ${config.freeSpins.awards[3]}, ${config.freeSpins.awards[4]} or ${config.freeSpins.awards[5]} free spins on hotter reels. The Dragonfire Meter multiplies every free-spin win: it starts at ×${config.freeSpins.meter.start} and rises +${config.freeSpins.meter.step} every ${config.freeSpins.meter.winsPerStep}rd winning spin, up to ×${config.freeSpins.meter.cap}. Scatters during the feature retrigger.`],
    ['Max win', `${config.maxWinX.toLocaleString()}× bet per round (base spin + its feature). The feature ends if the cap is reached.`],
    ['RTP', `${(config.rtp.declaredBase * 100).toFixed(2)}% (base game).` + (config.features.bonusBuy.enabled ? ` Bought feature ${(config.rtp.declaredBuyFree * 100).toFixed(1)}%` + (config.features.bonusBuy.superTier ? `, super ${(config.rtp.declaredBuySuper * 100).toFixed(1)}%.` : '.') : '') + ' High volatility.'],
  ];
  if (config.features.bonusBuy.enabled) {
    rules.splice(2, 0, [
      'Buy Feature',
      `Summon the Dragons (${config.buy.free.costX}× bet) guarantees ≥ ${config.buy.free.minScatters} Dragon Eggs.` +
        (config.features.bonusBuy.superTier
          ? ` Wake the Elder (${config.buy.super.costX}× bet) awards ${config.buy.super.spins} spins with the meter starting ×${config.buy.super.meter.start} and rising +${config.buy.super.meter.step} on every win.`
          : ''),
    ]);
  }

  modal.body.append(
    el('div', { class: 'pt-rows' }, rows),
    el('div', { class: 'pt-rules' }, rules.map(([t, b]) => el('div', { class: 'pt-rule' }, [el('h3', { text: t }), el('p', { text: b })]))),
    el('p', { class: 'modal-note', text: 'Demo build with a mock balance — no real-money play. Malfunction voids all plays.' }),
  );
  modal.open();
  return modal;
}
