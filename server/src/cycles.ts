/**
 * Cycle lifecycle: fresh seed → on-chain commitment → rounds → close (Merkle root + totals) →
 * reveal. `rotate` does it honestly; `rotateDishonest` first tries to reveal a WRONG seed so the
 * chain rejects it with HashMismatch, then reveals honestly.
 */
import { commitmentHex, newServerSeed, seedBytes } from "./crypto.js";
import { leafHash, merkleRoot } from "./merkle.js";
import type { Chain } from "./chain.js";
import type { CycleData, Store } from "./store.js";

export interface RotateResult {
  closedCycle: number;
  newCycle: number;
  merkleRoot: string;
  txs: { close: string; reveal: string; commit: string; cheatAttempt?: { signature: string; error: string } };
}

export class CycleService {
  constructor(
    private readonly store: Store,
    private readonly chain: Chain,
  ) {}

  /** Start a cycle: generate the seed, commit its hash on-chain, record everything. */
  async startCycle(): Promise<CycleData> {
    const config = await this.chain.fetchConfig();
    if (config.hasActive) {
      // The chain already has an active cycle (e.g. server restarted) — adopt it if we know it.
      const known = this.store.cycle(config.activeCycle);
      if (known) {
        this.store.data.active_cycle = known.cycle_id;
        this.store.save();
        return known;
      }
      throw new Error(`chain has active cycle ${config.activeCycle} but the store does not know its seed — reset the ledger or the store`);
    }
    const serverSeed = newServerSeed();
    const seedHash = commitmentHex(serverSeed);
    const cycleId = config.cycleCounter;
    const commit = await this.chain.commitSeed(Buffer.from(seedHash, "hex"));
    const onChain = await this.chain.fetchCycle(cycleId);
    const cycle: CycleData = {
      cycle_id: cycleId,
      server_seed: serverSeed,
      seed_hash: seedHash,
      status: "active",
      records: [],
      txs: { commit },
      cheat_attempts: [],
      committed_at: onChain?.committedAt,
    };
    this.store.data.cycles[String(cycleId)] = cycle;
    this.store.data.active_cycle = cycleId;
    this.store.save();
    return cycle;
  }

  totals(cycle: CycleData): { rounds: number; wagered: number; paid: number; root: Buffer } {
    const leaves = cycle.records.map(leafHash);
    return {
      rounds: cycle.records.length,
      wagered: cycle.records.reduce((a, r) => a + r.wager_micros, 0),
      paid: cycle.records.reduce((a, r) => a + r.payout_micros, 0),
      root: merkleRoot(leaves),
    };
  }

  async rotate(dishonest: boolean): Promise<RotateResult> {
    const cycle = this.store.activeCycle();
    if (!cycle) throw new Error("no active cycle");
    const t = this.totals(cycle);

    const close = await this.chain.closeCycle(cycle.cycle_id, t.root, t.rounds, t.wagered, t.paid);
    cycle.merkle_root = t.root.toString("hex");
    cycle.txs.close = close;
    this.store.save();

    let cheatAttempt: RotateResult["txs"]["cheatAttempt"];
    if (dishonest) {
      // Flip one hex digit of the real seed — the on-chain sha256 check must reject it.
      const fake = flipOneHexDigit(cycle.server_seed);
      const res = await this.chain.revealSeed(cycle.cycle_id, seedBytes(fake));
      if (res.ok) throw new Error("dishonest reveal unexpectedly succeeded — the program is broken");
      cheatAttempt = { signature: res.signature, error: res.error ?? "unknown" };
      cycle.cheat_attempts.push({ signature: res.signature, error: res.error ?? "unknown", at: Date.now() });
      this.store.save();
    }

    const reveal = await this.chain.revealSeed(cycle.cycle_id, seedBytes(cycle.server_seed));
    if (!reveal.ok) throw new Error(`honest reveal failed: ${reveal.error}`);
    const onChain = await this.chain.fetchCycle(cycle.cycle_id);
    cycle.status = "revealed";
    cycle.txs.reveal = reveal.signature;
    cycle.revealed_at = onChain?.revealedAt;
    this.store.data.active_cycle = null;
    this.store.save();

    const next = await this.startCycle();
    return {
      closedCycle: cycle.cycle_id,
      newCycle: next.cycle_id,
      merkleRoot: cycle.merkle_root ?? "",
      txs: { close, reveal: reveal.signature, commit: next.txs.commit ?? "", ...(cheatAttempt ? { cheatAttempt } : {}) },
    };
  }
}

export function flipOneHexDigit(hex: string): string {
  const i = Math.floor(hex.length / 2);
  const c = hex[i] ?? "0";
  const flipped = c === "f" ? "0" : (parseInt(c, 16) + 1).toString(16);
  return hex.slice(0, i) + flipped + hex.slice(i + 1);
}
