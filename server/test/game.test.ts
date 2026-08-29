import { describe, expect, it } from "vitest";
import { payoutFor, playRound, validateBet } from "../src/game.js";

describe("dice", () => {
  it("validates targets 2–98 and positive integer wagers", () => {
    expect(() => validateBet(1, 100)).toThrow();
    expect(() => validateBet(99, 100)).toThrow();
    expect(() => validateBet(50, 0)).toThrow();
    expect(() => validateBet(50.5, 100)).toThrow();
    expect(validateBet(50, 1_000_000)).toEqual({ target: 50, wagerMicros: 1_000_000 });
  });
  it("pays wager × 99 / target on a win (1 % house edge), floored", () => {
    expect(payoutFor(true, 1_000_000, 50)).toBe(1_980_000);
    expect(payoutFor(true, 1_000_000, 98)).toBe(1_010_204);
    expect(payoutFor(false, 1_000_000, 50)).toBe(0);
  });
  it("win iff roll < target", () => {
    const seed = "a".repeat(64);
    // Find nonces whose rolls straddle the target so both branches are exercised.
    let wins = 0;
    let losses = 0;
    for (let n = 0; n < 200; n++) {
      const r = playRound(seed, { cycleId: 0, roundIndex: n, playerId: "p", clientSeed: "c", nonce: n, target: 50, wagerMicros: 100, ts: 0 });
      if (r.roll < 50) {
        wins++;
        expect(r.payout_micros).toBe(198);
      } else {
        losses++;
        expect(r.payout_micros).toBe(0);
      }
    }
    expect(wins).toBeGreaterThan(50);
    expect(losses).toBeGreaterThan(50);
  });
});
