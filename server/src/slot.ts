/**
 * Ashfall Dynasty on SEALED randomness. The slot's maths module is pure and shared
 * (packages/ashfall-math), so the server produces the outcome from the sealed seed and the browser
 * verifier reproduces it byte for byte after the reveal.
 */
import { GAME_CONFIG, buySpin, buyCostCoins, spin } from "ashfall-math";
import type { FeatureTier, SpinOutcome } from "ashfall-math";
import { createHmac } from "node:crypto";
import { canonicalJson, seedBytes, sha256Hex } from "./crypto.js";
import type { SlotRecord } from "./game.js";

export const SLOT_CONFIG = GAME_CONFIG;

/** Per-spin seed: the hex HMAC of client_seed:nonce under the sealed server seed. */
export function spinSeedFor(serverSeedHex: string, clientSeed: string, nonce: number): string {
  return createHmac("sha256", seedBytes(serverSeedHex)).update(`${clientSeed}:${nonce}`).digest("hex");
}

export function outcomeHash(outcome: SpinOutcome): string {
  return sha256Hex(canonicalJson(outcome));
}

export function validateSlotBet(bet: unknown, buy: unknown): { bet: number; buy: FeatureTier | null } {
  const b = Number(bet);
  if (!GAME_CONFIG.betLevels.includes(b)) throw new Error(`bet must be one of ${GAME_CONFIG.betLevels.join(", ")}`);
  if (buy !== undefined && buy !== null && buy !== "free" && buy !== "super") throw new Error("buy must be 'free' or 'super'");
  const tier = (buy as FeatureTier | null | undefined) ?? null;
  if (tier && !GAME_CONFIG.features.bonusBuy.enabled) throw new Error("bonus buy is disabled");
  if (tier === "super" && !GAME_CONFIG.features.bonusBuy.superTier) throw new Error("super tier is disabled");
  return { bet: b, buy: tier };
}

const MICROS = 1_000_000;
const coinsToMicros = (coins: number, bet: number): number => Math.round((coins * bet * MICROS) / GAME_CONFIG.coinsPerBet);

export function playSlotRound(
  serverSeedHex: string,
  input: { cycleId: number; roundIndex: number; playerId: string; clientSeed: string; nonce: number; bet: number; buy: FeatureTier | null; ts: number },
): { record: SlotRecord; outcome: SpinOutcome } {
  const spinSeed = spinSeedFor(serverSeedHex, input.clientSeed, input.nonce);
  const outcome = input.buy ? buySpin(GAME_CONFIG, spinSeed, 0, input.buy) : spin(GAME_CONFIG, spinSeed, 0);
  const wagerCoins = input.buy ? buyCostCoins(GAME_CONFIG, input.buy) : GAME_CONFIG.coinsPerBet;
  const record: SlotRecord = {
    game: "ashfall",
    cycle_id: input.cycleId,
    round_index: input.roundIndex,
    player_id: input.playerId,
    client_seed: input.clientSeed,
    nonce: input.nonce,
    kind: outcome.kind,
    bet_micros: Math.round(input.bet * MICROS),
    wager_micros: coinsToMicros(wagerCoins, input.bet),
    payout_micros: coinsToMicros(outcome.totalWinCoins, input.bet),
    stops: [...outcome.base.stops],
    total_win_coins: outcome.totalWinCoins,
    outcome_hash: outcomeHash(outcome),
    ts: input.ts,
  };
  return { record, outcome };
}
