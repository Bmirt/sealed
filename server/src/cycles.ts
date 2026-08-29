/**
 * Cycle lifecycle: fresh seed → on-chain commitment → rounds → close (Merkle root + totals) →
 * reveal. `rotate` does it honestly; `rotateDishonest` first tries to reveal a WRONG seed so the
 * chain rejects it with HashMismatch, then reveals honestly.
 */
import { commitmentHex, newServerSeed, seedBytes } from "./crypto.js";
import type { RoundRecord } from "./game.js";
import { leafHash, merkleRoot } from "./merkle.js";
import type { Chain } from "./chain.js";
import type { CycleData, Store } from "./store.js";

export interface RotateResult {
  closedCycle: number;
  newCycle: number;
  merkleRoot: string;
  txs: { close: string; reveal: string; commit: string; cheatAttempt?: { signature: string; error: string } };
}

export type StepStatus = "pending" | "running" | "done" | "rejected" | "failed" | "skipped";
export interface RotationStep {
  key: "close" | "fake" | "reveal" | "commit";
  label: string;
  status: StepStatus;
  detail?: string;
  signature?: string;
}
/** Live view of the rotation in progress (polled by both games' admin corners). */
export interface RotationStatus {
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

export class CycleService {
  private rotation: RotationStatus | null = null;
  private rotationSeq = 0;

  constructor(
    private readonly store: Store,
    private readonly chain: Chain,
  ) {}

  /** The current (or most recent) rotation, step by step. */
  get rotationStatus(): RotationStatus | null {
    return this.rotation;
  }

  private step(key: RotationStep["key"], patch: Partial<RotationStep>): void {
    const st = this.rotation?.steps.find((x) => x.key === key);
    if (st) Object.assign(st, patch);
  }

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

  /** Fill in reveal / cheat-attempt signatures from chain history (after a crash mid-rotation). */
  async syncHistory(cycle: CycleData): Promise<void> {
    const h = await this.chain.revealHistory(cycle.cycle_id, cycle.txs);
    if (h.reveal && !cycle.txs.reveal) cycle.txs.reveal = h.reveal;
    for (const f of h.failed) {
      if (!cycle.cheat_attempts.some((a) => a.signature === f.signature)) {
        cycle.cheat_attempts.push({ signature: f.signature, error: f.error, at: (f.blockTime ?? Math.floor(Date.now() / 1000)) * 1000 });
      }
    }
    this.store.save();
  }

  /** Startup repair: revealed cycles missing their reveal signature get it back from the chain. */
  async repairFromChain(): Promise<number> {
    let repaired = 0;
    for (const cycle of Object.values(this.store.data.cycles)) {
      if (cycle.status === "revealed" && !cycle.txs.reveal) {
        await this.syncHistory(cycle);
        repaired++;
      }
    }
    return repaired;
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

  /**
   * Resumable: every step first looks at the chain, so a crash or RPC hiccup mid-rotation
   * (public devnet RPCs 429 freely) can simply be retried without double-closing.
   */
  async rotate(dishonest: boolean): Promise<RotateResult> {
    if (this.rotation && !this.rotation.finishedAt) throw new Error("a rotation is already in progress");
    const cycle = this.store.activeCycle();
    if (!cycle) throw new Error("no active cycle");
    cycle.closing = true; // from here on /bet and /slot/spin refuse this cycle
    this.store.save();
    const t = this.totals(cycle);
    this.rotation = {
      id: ++this.rotationSeq,
      cycleId: cycle.cycle_id,
      dishonest,
      startedAt: Date.now(),
      steps: [
        { key: "close", label: `Close cycle #${cycle.cycle_id} — Merkle root of ${t.rounds} round${t.rounds === 1 ? "" : "s"} + totals on-chain`, status: "pending" },
        ...(dishonest ? [{ key: "fake" as const, label: "Try to reveal a WRONG seed (one hex digit flipped)", status: "pending" as const }] : []),
        { key: "reveal", label: "Reveal the real seed — the program recomputes sha256 and checks it", status: "pending" },
        { key: "commit", label: "Seal a new cycle — commit the next seed hash before any play", status: "pending" },
      ],
    };
    try {
      const result = await this.rotateInner(cycle, t, dishonest);
      this.rotation.ok = true;
      this.rotation.newCycle = result.newCycle;
      this.rotation.finishedAt = Date.now();
      return result;
    } catch (e) {
      const running = this.rotation.steps.find((x) => x.status === "running");
      if (running) {
        running.status = "failed";
        running.detail = (e as Error).message;
      }
      this.rotation.ok = false;
      this.rotation.error = (e as Error).message;
      this.rotation.finishedAt = Date.now();
      throw e;
    }
  }

  private async rotateInner(cycle: CycleData, t: ReturnType<CycleService["totals"]>, dishonest: boolean): Promise<RotateResult> {
    const onChainBefore = await this.chain.fetchCycle(cycle.cycle_id);
    let rootHex = t.root.toString("hex");
    const money = `wagered ${(t.wagered / 1e6).toFixed(2)} · paid ${(t.paid / 1e6).toFixed(2)}`;

    this.step("close", { status: "running" });
    let close = cycle.txs.close ?? "";
    if (onChainBefore?.closed) {
      if (onChainBefore.merkleRoot !== rootHex) {
        // Rounds were accepted after the close landed (a crash or the old reveal bug). The sealed set
        // is exactly the first `rounds` records — if those reproduce the on-chain root, set the rest
        // aside as orphaned; anything else is real corruption and must stop here.
        const sealed = cycle.records.slice(0, onChainBefore.rounds);
        const sealedRoot = merkleRoot(sealed.map(leafHash)).toString("hex");
        if (sealedRoot !== onChainBefore.merkleRoot) {
          throw new Error(`cycle ${cycle.cycle_id} was closed on-chain with a different Merkle root — records do not reproduce it`);
        }
        const orphans: RoundRecord[] = cycle.records.slice(onChainBefore.rounds);
        cycle.orphaned_records = [...(cycle.orphaned_records ?? []), ...orphans];
        cycle.records = sealed;
        this.store.save();
        console.warn(`cycle ${cycle.cycle_id}: ${orphans.length} round(s) were accepted after the on-chain close — set aside as orphaned`);
        t = this.totals(cycle);
        rootHex = t.root.toString("hex");
        this.step("close", { status: "done", signature: close, detail: `already closed on-chain · root ${rootHex.slice(0, 12)}… · ${orphans.length} round(s) played after close set aside (not sealed)` });
      } else {
        this.step("close", { status: "done", signature: close, detail: `already closed on-chain · root ${rootHex.slice(0, 12)}… · ${money}` });
      }
    } else {
      close = await this.chain.closeCycle(cycle.cycle_id, t.root, t.rounds, t.wagered, t.paid);
      this.step("close", { status: "done", signature: close, detail: `root ${rootHex.slice(0, 12)}… · ${money}` });
    }
    cycle.merkle_root = rootHex;
    cycle.txs.close = close;
    this.store.save();

    let cheatAttempt: RotateResult["txs"]["cheatAttempt"];
    if (dishonest) {
      if (onChainBefore?.status === "revealed") {
        this.step("fake", { status: "skipped", detail: "cycle already revealed on-chain (resumed rotation)" });
      } else {
        this.step("fake", { status: "running" });
        // Flip one hex digit of the real seed — the on-chain sha256 check must reject it.
        const fake = flipOneHexDigit(cycle.server_seed);
        const res = await this.chain.revealSeed(cycle.cycle_id, seedBytes(fake));
        if (res.ok) {
          this.step("fake", { status: "failed", signature: res.signature, detail: "the chain ACCEPTED a wrong seed — the program is broken" });
          throw new Error("dishonest reveal unexpectedly succeeded — the program is broken");
        }
        cheatAttempt = { signature: res.signature, error: res.error ?? "unknown" };
        cycle.cheat_attempts.push({ signature: res.signature, error: res.error ?? "unknown", at: Date.now() });
        this.store.save();
        this.step("fake", { status: "rejected", signature: res.signature, detail: `the program recomputed sha256(seed), it did not match the commitment → ${res.error ?? "unknown"}. The failed transaction stays in history forever.` });
      }
    }

    this.step("reveal", { status: "running" });
    let revealSig = cycle.txs.reveal ?? "";
    if (onChainBefore?.status !== "revealed") {
      const reveal = await this.chain.revealSeed(cycle.cycle_id, seedBytes(cycle.server_seed));
      if (!reveal.ok) throw new Error(`honest reveal failed: ${reveal.error}`);
      revealSig = reveal.signature;
    }
    const onChain = await this.chain.fetchCycle(cycle.cycle_id);
    if (!revealSig || onChainBefore?.status === "revealed") await this.syncHistory(cycle);
    cycle.status = "revealed";
    if (revealSig) cycle.txs.reveal = revealSig;
    cycle.revealed_at = onChain?.revealedAt;
    this.store.data.active_cycle = null;
    this.store.save();
    this.step("reveal", { status: "done", signature: cycle.txs.reveal ?? "", detail: `seed ${cycle.server_seed.slice(0, 12)}… · sha256 matched the commitment · ${t.rounds} round${t.rounds === 1 ? "" : "s"} now publicly verifiable` });

    this.step("commit", { status: "running" });
    const next = await this.startCycle();
    this.step("commit", { status: "done", signature: next.txs.commit ?? "", detail: `cycle #${next.cycle_id} sealed · ${next.seed_hash.slice(0, 12)}…` });
    return {
      closedCycle: cycle.cycle_id,
      newCycle: next.cycle_id,
      merkleRoot: cycle.merkle_root ?? "",
      txs: { close, reveal: revealSig, commit: next.txs.commit ?? "", ...(cheatAttempt ? { cheatAttempt } : {}) },
    };
  }
}

// (continued in class above)
export function flipOneHexDigit(hex: string): string {
  const i = Math.floor(hex.length / 2);
  const c = hex[i] ?? "0";
  const flipped = c === "f" ? "0" : (parseInt(c, 16) + 1).toString(16);
  return hex.slice(0, i) + flipped + hex.slice(i + 1);
}
