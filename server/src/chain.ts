/**
 * Anchor client for `sealed_engine`. The server is the program authority: it commits, closes and
 * reveals; players never touch a wallet. The dishonest reveal is sent with `skipPreflight` so the
 * failing transaction actually lands in history — that failed signature is the demo artifact.
 */
import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
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

  constructor(opts: { rpcUrl: string; walletPath: string; idlPath: string }) {
    this.connection = new Connection(opts.rpcUrl, "confirmed");
    const secret = JSON.parse(readFileSync(opts.walletPath.replace(/^~/, homedir()), "utf8")) as number[];
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
    return client.fetch(address);
  }

  /** Airdrop to the authority on localnet if it is running low (server pays all fees). */
  async ensureFunded(): Promise<void> {
    const bal = await this.connection.getBalance(this.authority.publicKey);
    if (bal < 2e9) {
      const sig = await this.connection.requestAirdrop(this.authority.publicKey, 10e9);
      await this.connection.confirmTransaction(sig, "confirmed");
    }
  }

  async ensureInitialized(): Promise<{ initialized: boolean; signature?: string }> {
    const info = await this.connection.getAccountInfo(this.configPda);
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
    const info = await this.connection.getAccountInfo(this.cyclePda(cycleId));
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
    return this.method("commitSeed", [...seedHash]).accounts({ authority: this.authority.publicKey }).rpc();
  }

  async closeCycle(cycleId: number, merkleRoot: Buffer, rounds: number, wageredMicros: number, paidMicros: number): Promise<string> {
    return this.method("closeCycle", new anchor.BN(cycleId), [...merkleRoot], new anchor.BN(rounds), new anchor.BN(wageredMicros), new anchor.BN(paidMicros))
      .accounts({ authority: this.authority.publicKey })
      .rpc();
  }

  /**
   * Reveal. Sent WITHOUT preflight so a wrong seed produces a real, failed, on-chain transaction
   * (with preflight the RPC would reject it locally and nothing would be recorded).
   */
  async revealSeed(cycleId: number, seed: Buffer): Promise<RevealResult> {
    const ix = await this.method("revealSeed", new anchor.BN(cycleId), seed)
      .accounts({ authority: this.authority.publicKey })
      .instruction();
    const tx = new Transaction().add(ix);
    const { blockhash, lastValidBlockHeight } = await this.connection.getLatestBlockhash("confirmed");
    tx.recentBlockhash = blockhash;
    tx.feePayer = this.authority.publicKey;
    tx.sign(this.authority);
    const signature = await this.connection.sendRawTransaction(tx.serialize(), { skipPreflight: true });
    await this.connection.confirmTransaction({ signature, blockhash, lastValidBlockHeight }, "confirmed").catch(() => undefined);
    const info = await this.connection.getTransaction(signature, { commitment: "confirmed", maxSupportedTransactionVersion: 0 });
    const err = info?.meta?.err ?? null;
    if (!err) return { signature, ok: true, logs: info?.meta?.logMessages ?? [] };
    return { signature, ok: false, error: this.errorName(err), logs: info?.meta?.logMessages ?? [] };
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
