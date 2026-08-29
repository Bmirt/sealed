import * as anchor from "@coral-xyz/anchor";
import anchorCjs from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";

// Node's ESM view of the CJS package hides the re-exported BN; the default import is module.exports.
const BN = (anchorCjs as unknown as { BN: typeof anchor.BN }).BN;
import { Keypair, PublicKey, SystemProgram } from "@solana/web3.js";
import { createHash } from "crypto";
import { expect } from "chai";
import type { SealedEngine } from "../target/types/sealed_engine";

const sha256 = (b: Buffer | string): Buffer => createHash("sha256").update(b).digest();
const le64 = (n: number | bigint): Buffer => {
  const b = Buffer.alloc(8);
  b.writeBigUInt64LE(BigInt(n));
  return b;
};

describe("sealed_engine", () => {
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);
  const program = anchor.workspace.SealedEngine as Program<SealedEngine>;
  const authority = provider.wallet;

  const [configPda] = PublicKey.findProgramAddressSync([Buffer.from("config")], program.programId);
  const [rtpPda] = PublicKey.findProgramAddressSync([Buffer.from("rtp")], program.programId);
  const cyclePda = (id: number): PublicKey =>
    PublicKey.findProgramAddressSync([Buffer.from("cycle"), le64(id)], program.programId)[0];

  const seed = Buffer.from("a".repeat(64)); // 64-byte hex-string seed, as the server uses
  const seedHash = sha256(seed);

  /** Expect an Anchor error with the given name (works for custom + constraint errors). */
  async function expectError(p: Promise<unknown>, name: string): Promise<void> {
    try {
      await p;
    } catch (e) {
      const err = e as anchor.AnchorError & { error?: { errorCode?: { code?: string } } };
      const code = err.error?.errorCode?.code ?? (err as Error).message;
      expect(String(code)).to.include(name);
      return;
    }
    expect.fail(`expected ${name} but the transaction succeeded`);
  }

  it("initializes config + rtp stats", async () => {
    await program.methods
      .initialize()
      .accounts({ authority: authority.publicKey })
      .rpc();
    const config = await program.account.config.fetch(configPda);
    expect(config.authority.toBase58()).to.eq(authority.publicKey.toBase58());
    expect(config.cycleCounter.toNumber()).to.eq(0);
    expect(config.hasActive).to.eq(false);
    const rtp = await program.account.rtpStats.fetch(rtpPda);
    expect(rtp.totalRounds.toNumber()).to.eq(0);
  });

  it("happy path: commit → close → reveal, all fields and RTP math", async () => {
    await program.methods.commitSeed([...seedHash]).accounts({ authority: authority.publicKey }).rpc();
    let cycle = await program.account.seedCycle.fetch(cyclePda(0));
    expect(Buffer.from(cycle.seedHash).equals(seedHash)).to.eq(true);
    expect(cycle.status).to.deep.eq({ active: {} });
    expect(cycle.committedAt.toNumber()).to.be.greaterThan(1_600_000_000);
    expect(cycle.closed).to.eq(false);

    // Reveal before close must fail.
    await expectError(
      program.methods.revealSeed(new BN(0), seed).accounts({ authority: authority.publicKey }).rpc(),
      "CycleNotClosed",
    );
    // Second commit while active must fail.
    await expectError(
      program.methods.commitSeed([...sha256("other")]).accounts({ authority: authority.publicKey }).rpc(),
      "CycleStillActive",
    );

    const root = sha256("merkle-root-of-rounds");
    await program.methods
      .closeCycle(new BN(0), [...root], new BN(120), new BN(120_000_000), new BN(118_800_000))
      .accounts({ authority: authority.publicKey })
      .rpc();
    cycle = await program.account.seedCycle.fetch(cyclePda(0));
    expect(cycle.closed).to.eq(true);
    expect(Buffer.from(cycle.merkleRoot).equals(root)).to.eq(true);
    expect(cycle.rounds.toNumber()).to.eq(120);

    // Wrong seed → HashMismatch, on-chain.
    await expectError(
      program.methods.revealSeed(new BN(0), Buffer.from("b".repeat(64))).accounts({ authority: authority.publicKey }).rpc(),
      "HashMismatch",
    );

    await program.methods.revealSeed(new BN(0), seed).accounts({ authority: authority.publicKey }).rpc();
    cycle = await program.account.seedCycle.fetch(cyclePda(0));
    expect(cycle.status).to.deep.eq({ revealed: {} });
    expect(Buffer.from(cycle.revealedSeed).equals(seed)).to.eq(true);
    expect(cycle.revealedAt.toNumber()).to.be.at.least(cycle.committedAt.toNumber());

    const rtp = await program.account.rtpStats.fetch(rtpPda);
    expect(rtp.totalRounds.toNumber()).to.eq(120);
    expect(rtp.totalWageredMicros.toNumber()).to.eq(120_000_000);
    expect(rtp.totalPaidMicros.toNumber()).to.eq(118_800_000);
    // RTP derived off-chain: 118.8 / 120 = 0.99.
    expect(rtp.totalPaidMicros.toNumber() / rtp.totalWageredMicros.toNumber()).to.be.closeTo(0.99, 1e-9);

    const config = await program.account.config.fetch(configPda);
    expect(config.hasActive).to.eq(false);
    expect(config.cycleCounter.toNumber()).to.eq(1);
  });

  it("a second cycle can start after the reveal; closing twice fails", async () => {
    const seed2 = Buffer.from("c".repeat(64));
    await program.methods.commitSeed([...sha256(seed2)]).accounts({ authority: authority.publicKey }).rpc();
    await program.methods
      .closeCycle(new BN(1), [...sha256("r2")], new BN(1), new BN(10), new BN(0))
      .accounts({ authority: authority.publicKey })
      .rpc();
    await expectError(
      program.methods
        .closeCycle(new BN(1), [...sha256("r2")], new BN(1), new BN(10), new BN(0))
        .accounts({ authority: authority.publicKey })
        .rpc(),
      "CycleAlreadyClosed",
    );
    await program.methods.revealSeed(new BN(1), seed2).accounts({ authority: authority.publicKey }).rpc();
    const cycle = await program.account.seedCycle.fetch(cyclePda(1));
    expect(cycle.status).to.deep.eq({ revealed: {} });
    // Revealed cycles are final.
    await expectError(
      program.methods.revealSeed(new BN(1), seed2).accounts({ authority: authority.publicKey }).rpc(),
      "CycleNotActive",
    );
  });

  it("non-authority calls fail", async () => {
    const intruder = Keypair.generate();
    const sig = await provider.connection.requestAirdrop(intruder.publicKey, 1_000_000_000);
    await provider.connection.confirmTransaction(sig, "confirmed");
    await expectError(
      program.methods
        .commitSeed([...sha256("x")])
        .accounts({ authority: intruder.publicKey })
        .signers([intruder])
        .rpc(),
      "Unauthorized",
    );
  });
});
