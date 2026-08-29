/**
 * Dice "roll under": pick a target 2–98, win if roll < target, payout = wager × 99 / target.
 * House edge 1 %  → declared RTP 99 %. Money is integer micro-units everywhere.
 */
import { rollFor } from "./crypto.js";

export const MIN_TARGET = 2;
export const MAX_TARGET = 98;
export const DECLARED_RTP = 0.99;

export interface RoundRecord {
  cycle_id: number;
  round_index: number;
  player_id: string;
  client_seed: string;
  nonce: number;
  target: number;
  wager_micros: number;
  roll: number;
  payout_micros: number;
  /** Unix milliseconds when the round was played. */
  ts: number;
}

export function validateBet(target: unknown, wagerMicros: unknown): { target: number; wagerMicros: number } {
  const t = Number(target);
  const w = Number(wagerMicros);
  if (!Number.isInteger(t) || t < MIN_TARGET || t > MAX_TARGET) throw new Error(`target must be an integer ${MIN_TARGET}–${MAX_TARGET}`);
  if (!Number.isInteger(w) || w <= 0 || w > 1_000_000_000_000) throw new Error("wagerMicros must be a positive integer");
  return { target: t, wagerMicros: w };
}

export function payoutFor(win: boolean, wagerMicros: number, target: number): number {
  return win ? Math.floor((wagerMicros * 99) / target) : 0;
}

export function playRound(
  serverSeedHex: string,
  input: { cycleId: number; roundIndex: number; playerId: string; clientSeed: string; nonce: number; target: number; wagerMicros: number; ts: number },
): RoundRecord {
  const roll = rollFor(serverSeedHex, input.clientSeed, input.nonce);
  const win = roll < input.target;
  return {
    cycle_id: input.cycleId,
    round_index: input.roundIndex,
    player_id: input.playerId,
    client_seed: input.clientSeed,
    nonce: input.nonce,
    target: input.target,
    wager_micros: input.wagerMicros,
    roll,
    payout_micros: payoutFor(win, input.wagerMicros, input.target),
    ts: input.ts,
  };
}
