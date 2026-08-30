/**
 * Anchor client for `sealed_engine`. The server is the program authority: it commits, closes and
 * reveals; players never touch a wallet. The dishonest reveal is sent with `skipPreflight` so the
 * failing transaction actually lands in history — that failed signature is the demo artifact.
 */
import * as anchor from "@coral-xyz/anchor";
import anchorCjs from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";

// Under ESM the CJS package's re-exported BN is invisible on the namespace; module.exports has it.
const BN = (anchorCjs as unknown as { BN: typeof anchor.BN }).BN;
import type { Idl } from "@coral-xyz/anchor";
import { Connection, Keypair, PublicKey, Transaction } from "@solana/web3.js";
import type { TransactionInstruction } from "@solana/web3.js";
import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { resolve } from "node:path";

export interface ChainCycle {
  cycleId: number;
  seedHash: string;
  status: "active" | "revealed";
  closed: boolean;
  revealedSeed: string; // utf8 of the revealed bytes ('' until revealed)
  committedAt: number;
  revealedAt: number;
  merkleRoot: string;
  rounds: number;
  wageredMicros: number;
  paidMicros: number;
}

export interface RevealResult {
  signature: string;
  ok: boolean;
  /** Anchor error name when the transaction failed on-chain (e.g. HashMismatch). */
  error?: string;
  logs?: string[];
}

interface MethodsBuilderLike {
  accounts(a: Record<string, PublicKey>): MethodsBuilderLike;
  rpc(): Promise<string>;
  instruction(): Promise<TransactionInstruction>;
}

/** Retry an RPC call on rate limiting (public devnet RPCs 429 freely) with exponential backoff. */
async function withRetry<T>(fn: () => Promise<T>, attempts = 6, baseDelayMs = 500): Promise<T> {
  let delay = baseDelayMs;
  for (let i = 0; ; i++) {
    try {
      return await fn();
    } catch (e) {
      const msg = (e as Error).message ?? String(e);
      if (i >= attempts - 1 || !/429|rate limit|Too Many Requests/i.test(msg)) throw e;
      await new Promise((r) => setTimeout(r, delay));
      delay = Math.min(8000, delay * 2);
    }
  }
}

const le64 = (n: number): Buffer => {
  const b = Buffer.alloc(8);
  b.writeBigUInt64LE(BigInt(n));
  return b;
};

export class Chain {
  readonly connection: Connection;
  readonly program: Program<Idl>;
  readonly authority: Keypair;
  readonly programId: PublicKey;
  readonly configPda: PublicKey;
  readonly rtpPda: PublicKey;
  private readonly idl: Idl;

  constructor(opts: { rpcUrl: string; walletPath: string; walletJson?: string; idlPath: string }) {
    this.connection = new Connection(opts.rpcUrl, "confirmed");
    const secret = JSON.parse(opts.walletJson ?? readFileSync(opts.walletPath.replace(/^~/, homedir()), "utf8")) as number[];
    this.authority = Keypair.fromSecretKey(Uint8Array.from(secret));
    this.idl = JSON.parse(readFileSync(resolve(opts.idlPath), "utf8")) as Idl;
    const wallet = new anchor.Wallet(this.authority);
    const provider = new anchor.AnchorProvider(this.connection, wallet, { commitment: "confirmed" });
    this.program = new Program(this.idl, provider);
    this.programId = this.program.programId;
    this.configPda = PublicKey.findProgramAddressSync([Buffer.from("config")], this.programId)[0];
    this.rtpPda = PublicKey.findProgramAddressSync([Buffer.from("rtp")], this.programId)[0];
  }

  cyclePda(cycleId: number): PublicKey {
    return PublicKey.findProgramAddressSync([Buffer.from("cycle"), le64(cycleId)], this.programId)[0];
  }

  /** Untyped method builder (the IDL is loaded at runtime, so instructions are addressed by name). */
  private method(name: string, ...args: unknown[]): MethodsBuilderLike {
    const ns = this.program.methods as unknown as Record<string, ((...a: unknown[]) => MethodsBuilderLike) | undefined>;
    const fn = ns[name];
    if (!fn) throw new Error(`IDL has no instruction named ${name}`);
    return fn(...args);
  }

  /** Untyped account fetch (the IDL is loaded at runtime, so accounts are addressed by name). */
  private async fetchAccount(name: string, address: PublicKey): Promise<Record<string, unknown>> {
    const ns = this.program.account as unknown as Record<string, { fetch(pk: PublicKey): Promise<Record<string, unknown>> } | undefined>;
    const client = ns[name];
    if (!client) throw new Error(`IDL has no account named ${name}`);
    return withRetry(() => client.fetch(address));
  }

  /**
   * The server pays every fee. On localnet it airdrops itself; on devnet airdrops are rate-limited,
   * so it only warns — fund the authority via https://faucet.solana.com if the balance is low.
   */
  async ensureFunded(canAirdrop: boolean): Promise<void> {
    const bal = await this.connection.getBalance(this.authority.publicKey);
    if (bal >= 0.5e9) return;
    if (!canAirdrop) {
      console.warn(`authority ${this.authority.publicKey.toBase58()} has ${bal / 1e9} SOL — fund it (faucet.solana.com) or transactions will fail`);
      return;
    }
    const sig = await this.connection.requestAirdrop(this.authority.publicKey, 10e9);
    await this.connection.confirmTransaction(sig, "confirmed");
  }

  async ensureInitialized(): Promise<{ initialized: boolean; signature?: string }> {
    const info = await withRetry(() => this.connection.getAccountInfo(this.configPda));
    if (info) return { initialized: false };
    const signature = await this.method("initialize").accounts({ authority: this.authority.publicKey }).rpc();
    return { initialized: true, signature };
  }

  async fetchConfig(): Promise<{ authority: string; cycleCounter: number; hasActive: boolean; activeCycle: number }> {
    const c = await this.fetchAccount("config", this.configPda);
    return {
      authority: String(c["authority"]),
      cycleCounter: Number(c["cycleCounter"]),
      hasActive: Boolean(c["hasActive"]),
      activeCycle: Number(c["activeCycle"]),
    };
  }

  async fetchCycle(cycleId: number): Promise<ChainCycle | null> {
    const info = await withRetry(() => this.connection.getAccountInfo(this.cyclePda(cycleId)));
    if (!info) return null;
    const c = await this.fetchAccount("seedCycle", this.cyclePda(cycleId));
    const status = c["status"] as Record<string, unknown>;
    return {
      cycleId: Number(c["cycleId"]),
      seedHash: Buffer.from(c["seedHash"] as number[]).toString("hex"),
      status: "revealed" in status ? "revealed" : "active",
      closed: Boolean(c["closed"]),
      revealedSeed: Buffer.from(c["revealedSeed"] as number[]).toString("utf8"),
      committedAt: Number(c["committedAt"]),
      revealedAt: Number(c["revealedAt"]),
      merkleRoot: Buffer.from(c["merkleRoot"] as number[]).toString("hex"),
      rounds: Number(c["rounds"]),
      wageredMicros: Number(c["wageredMicros"]),
      paidMicros: Number(c["paidMicros"]),
    };
  }

  async fetchRtp(): Promise<{ totalRounds: number; totalWageredMicros: number; totalPaidMicros: number }> {
    const r = await this.fetchAccount("rtpStats", this.rtpPda);
    return {
      totalRounds: Number(r["totalRounds"]),
      totalWageredMicros: Number(r["totalWageredMicros"]),
      totalPaidMicros: Number(r["totalPaidMicros"]),
    };
  }

  async commitSeed(seedHash: Buffer): Promise<string> {
    return withRetry(() => this.method("commitSeed", [...seedHash]).accounts({ authority: this.authority.publicKey }).rpc(), 4, 1000);
  }

  async closeCycle(cycleId: number, merkleRoot: Buffer, rounds: number, wageredMicros: number, paidMicros: number): Promise<string> {
    return withRetry(
      () =>
        this.method("closeCycle", new BN(cycleId), [...merkleRoot], new BN(rounds), new BN(wageredMicros), new BN(paidMicros))
          .accounts({ authority: this.authority.publicKey })
          .rpc(),
      4,
      1000,
    );
  }

  /**
   * Reveal. Sent WITHOUT preflight so a wrong seed produces a real, failed, on-chain transaction
   * (with preflight the RPC would reject it locally and nothing would be recorded).
   */
  async revealSeed(cycleId: number, seed: Buffer): Promise<RevealResult> {
    const ix = await this.method("revealSeed", new BN(cycleId), seed)
      .accounts({ authority: this.authority.publicKey })
      .instruction();
    const tx = new Transaction().add(ix);
    const { blockhash, lastValidBlockHeight } = await withRetry(() => this.connection.getLatestBlockhash("confirmed"));
    tx.recentBlockhash = blockhash;
    tx.feePayer = this.authority.publicKey;
    tx.sign(this.authority);
    const signature = await withRetry(() => this.connection.sendRawTransaction(tx.serialize(), { skipPreflight: true }));
    await this.connection.confirmTransaction({ signature, blockhash, lastValidBlockHeight }, "confirmed").catch(() => undefined);
    // The verdict comes from the signature STATUS, polled until the cluster has it. A lookup that
    // returns nothing means "not indexed yet", never "succeeded" — the old code conflated the two.
    const err = await this.waitForStatus(signature);
    const info = await this.connection.getTransaction(signature, { commitment: "confirmed", maxSupportedTransactionVersion: 0 }).catch(() => null);
    const logs = info?.meta?.logMessages ?? [];
    if (err === null) return { signature, ok: true, logs };
    return { signature, ok: false, error: this.errorName(err), logs };
  }

  /** Poll getSignatureStatuses until confirmed/finalized; resolves the tx error (null = success). */
  private async waitForStatus(signature: string, timeoutMs = 45_000): Promise<unknown> {
    const started = Date.now();
    let delay = 500;
    for (;;) {
      const res = await this.connection.getSignatureStatuses([signature], { searchTransactionHistory: true }).catch(() => null);
      const st = res?.value[0] ?? null;
      if (st && (st.confirmationStatus === "confirmed" || st.confirmationStatus === "finalized")) return st.err ?? null;
      if (Date.now() - started > timeoutMs) throw new Error(`transaction ${signature.slice(0, 12)}… was not confirmed within ${timeoutMs / 1000}s — check the cluster and retry (rotation resumes)`);
      await new Promise((r) => setTimeout(r, delay));
      delay = Math.min(2500, delay * 1.5);
    }
  }

  /**
   * Reveal history of a cycle straight from the chain: every failed transaction touching the cycle
   * PDA (cheat attempts, with their error name) and the successful transactions that are neither
   * the commit nor the close (i.e. the reveal). Lets a rotation resume after a crash without losing
   * the signatures the demo shows.
   */
  async revealHistory(cycleId: number, known: { commit?: string; close?: string }): Promise<{ reveal?: string; failed: { signature: string; error: string; blockTime: number | null }[] }> {
    const sigs = await this.connection.getSignaturesForAddress(this.cyclePda(cycleId), { limit: 100 }, "confirmed");
    const failed = sigs.filter((x) => x.err).map((x) => ({ signature: x.signature, error: this.errorName(x.err), blockTime: x.blockTime ?? null }));
    const ok = sigs.filter((x) => !x.err && x.signature !== known.commit && x.signature !== known.close);
    // Newest first; the reveal is the most recent successful non-commit/close transaction.
    const reveal = ok[0]?.signature;
    return reveal ? { reveal, failed } : { failed };
  }

  /** Map a transaction error object to the Anchor error name via the IDL. */
  errorName(err: unknown): string {
    const json = JSON.stringify(err);
    const m = /"Custom":(\d+)/.exec(json);
    if (m) {
      const code = Number(m[1]);
      const e = (this.idl.errors ?? []).find((x) => x.code === code);
      if (e) return e.name;
      return `Custom(${code})`;
    }
    return json;
  }
}
