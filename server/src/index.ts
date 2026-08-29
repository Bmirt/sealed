/**
 * SEALED game server — Fastify. Players never need a wallet; the server is the program authority.
 *   POST /bet                    play one round on the active cycle
 *   POST /cycle/rotate           close + honest reveal + new commitment
 *   POST /cycle/rotate-dishonest same, but first tries a WRONG reveal (on-chain HashMismatch)
 *   GET  /rounds?cycle=N         records + Merkle proofs (+ seed once revealed)
 *   GET  /state                  active cycle, commitment, PDAs, RTP stats
 *   GET  /cheats                 every failed on-chain reveal we provoked
 */
import cors from "@fastify/cors";
import Fastify from "fastify";
import { randomBytes } from "node:crypto";
import { resolve } from "node:path";
import { Chain } from "./chain.js";
import { CycleService } from "./cycles.js";
import { DECLARED_RTP, playRound, validateBet } from "./game.js";
import { leafHash, merkleProof, merkleRoot } from "./merkle.js";
import { SLOT_CONFIG, playSlotRound, validateSlotBet } from "./slot.js";
import { Store } from "./store.js";

const PORT = Number(process.env["PORT"] ?? 4000);
/** "localnet" (default) or "devnet". Selects the RPC and keeps a separate store per cluster. */
const CLUSTER = process.env["SEALED_CLUSTER"] ?? "localnet";
const RPC = process.env["SOLANA_RPC"] ?? (CLUSTER === "devnet" ? "https://api.devnet.solana.com" : "http://127.0.0.1:8899");
const WALLET = process.env["SEALED_WALLET"] ?? "~/.config/solana/id.json";
const IDL = process.env["SEALED_IDL"] ?? resolve(process.cwd(), "../target/idl/sealed_engine.json");
const DATA = process.env["SEALED_DATA"] ?? resolve(process.cwd(), `data/store.${CLUSTER}.json`);

// A public RPC can 429 at any moment; a stray rejection must never take the game server down.
process.on("unhandledRejection", (reason) => console.error("unhandled rejection (kept running):", reason));
process.on("uncaughtException", (err) => console.error("uncaught exception (kept running):", err));

async function main(): Promise<void> {
  const store = new Store(DATA);
  const chain = new Chain({ rpcUrl: RPC, walletPath: WALLET, idlPath: IDL });
  await chain.ensureFunded(CLUSTER === "localnet");
  const init = await chain.ensureInitialized();
  const cycles = new CycleService(store, chain);
  const repaired = await cycles.repairFromChain();
  if (repaired) console.log(`repaired ${repaired} cycle record(s) from chain history`);
  if (!store.activeCycle()) await cycles.startCycle();

  const app = Fastify({ logger: { level: "info" } });
  await app.register(cors, { origin: true });

  // /state is polled by every open tab — serve chain stats from a short cache to spare the RPC.
  let rtpCache: { at: number; value: Awaited<ReturnType<typeof chain.fetchRtp>> } | null = null;
  const cachedRtp = async (): Promise<Awaited<ReturnType<typeof chain.fetchRtp>>> => {
    if (rtpCache && Date.now() - rtpCache.at < 10_000) return rtpCache.value;
    try {
      rtpCache = { at: Date.now(), value: await chain.fetchRtp() };
    } catch (e) {
      if (!rtpCache) throw e;
      app.log.warn(`rtp fetch failed, serving cached: ${(e as Error).message}`);
    }
    return rtpCache.value;
  };
  const invalidateRtp = (): void => {
    rtpCache = null;
  };

  app.get("/state", async () => {
    const active = store.activeCycle();
    const rtp = await cachedRtp();
    return {
      program_id: chain.programId.toBase58(),
      cluster: CLUSTER,
      rpc: RPC,
      rotating: Boolean(cycles.rotationStatus && !cycles.rotationStatus.finishedAt),
      config_pda: chain.configPda.toBase58(),
      rtp_pda: chain.rtpPda.toBase58(),
      active_cycle: active
        ? { cycle_id: active.cycle_id, seed_hash: active.seed_hash, pda: chain.cyclePda(active.cycle_id).toBase58(), committed_at: active.committed_at, rounds: active.records.length, commit_tx: active.txs.commit }
        : null,
      cycles: Object.values(store.data.cycles)
        .sort((a, b) => a.cycle_id - b.cycle_id)
        .map((c) => ({ cycle_id: c.cycle_id, status: c.status, rounds: c.records.length, pda: chain.cyclePda(c.cycle_id).toBase58(), cheat_attempts: c.cheat_attempts.length })),
      rtp: { ...rtp, rtp: rtp.totalWageredMicros > 0 ? rtp.totalPaidMicros / rtp.totalWageredMicros : null, declared: DECLARED_RTP },
      games: perGameStats(),
      initialized_this_boot: init.initialized,
    };
  });

  /** Local (off-chain) per-game totals: on-chain RtpStats is one global counter. */
  const perGameStats = (): Record<string, { rounds: number; wagered_micros: number; paid_micros: number; rtp: number | null; declared: number }> => {
    const acc: Record<string, { rounds: number; wagered_micros: number; paid_micros: number }> = { dice: { rounds: 0, wagered_micros: 0, paid_micros: 0 }, ashfall: { rounds: 0, wagered_micros: 0, paid_micros: 0 } };
    for (const c of Object.values(store.data.cycles)) {
      for (const r of c.records) {
        const g = r.game ?? "dice";
        const a = acc[g] ?? (acc[g] = { rounds: 0, wagered_micros: 0, paid_micros: 0 });
        a.rounds++;
        a.wagered_micros += r.wager_micros;
        a.paid_micros += r.payout_micros;
      }
    }
    return Object.fromEntries(
      Object.entries(acc).map(([g, a]) => [g, { ...a, rtp: a.wagered_micros ? a.paid_micros / a.wagered_micros : null, declared: g === "ashfall" ? SLOT_CONFIG.rtp.declaredBase : DECLARED_RTP }]),
    );
  };

  /** Ashfall Dynasty spin on the sealed seed. Returns the full outcome for the client to present. */
  app.post<{ Body: { playerId?: string; clientSeed?: string; bet?: number; buy?: string | null } }>("/slot/spin", async (req, reply) => {
    const cycle = store.activeCycle();
    if (!cycle) return reply.code(409).send({ error: "no active cycle" });
    if (cycle.closing) return reply.code(409).send({ error: "cycle is closing (rotation in progress) — the next cycle opens in a few seconds" });
    const body = req.body ?? {};
    const playerId = String(body.playerId ?? "anon").slice(0, 64);
    let bet;
    try {
      bet = validateSlotBet(body.bet, body.buy);
    } catch (e) {
      return reply.code(400).send({ error: (e as Error).message });
    }
    const player = store.player(playerId, () => randomBytes(8).toString("hex"));
    if (typeof body.clientSeed === "string" && body.clientSeed.length > 0 && body.clientSeed !== player.client_seed) {
      player.client_seed = body.clientSeed.slice(0, 64);
      player.nonce = 0;
    }
    const { record, outcome } = playSlotRound(cycle.server_seed, {
      cycleId: cycle.cycle_id,
      roundIndex: cycle.records.length,
      playerId,
      clientSeed: player.client_seed,
      nonce: player.nonce,
      bet: bet.bet,
      buy: bet.buy,
      ts: Date.now(),
    });
    player.nonce += 1;
    cycle.records.push(record);
    store.save();
    return { outcome, nonce: record.nonce, roundIndex: record.round_index, clientSeed: record.client_seed, cycleId: cycle.cycle_id, seedHash: cycle.seed_hash, cyclePda: chain.cyclePda(cycle.cycle_id).toBase58() };
  });

  app.post<{ Body: { playerId?: string; clientSeed?: string; target?: number; wagerMicros?: number } }>("/bet", async (req, reply) => {
    const cycle = store.activeCycle();
    if (!cycle) return reply.code(409).send({ error: "no active cycle" });
    if (cycle.closing) return reply.code(409).send({ error: "cycle is closing (rotation in progress) — the next cycle opens in a few seconds" });
    const body = req.body ?? {};
    const playerId = String(body.playerId ?? "anon").slice(0, 64);
    let bet;
    try {
      bet = validateBet(body.target, body.wagerMicros);
    } catch (e) {
      return reply.code(400).send({ error: (e as Error).message });
    }
    const player = store.player(playerId, () => randomBytes(8).toString("hex"));
    if (typeof body.clientSeed === "string" && body.clientSeed.length > 0 && body.clientSeed !== player.client_seed) {
      player.client_seed = body.clientSeed.slice(0, 64);
      player.nonce = 0; // a new client seed starts a fresh nonce sequence
    }
    const record = { game: "dice" as const, ...playRound(cycle.server_seed, {
      cycleId: cycle.cycle_id,
      roundIndex: cycle.records.length,
      playerId,
      clientSeed: player.client_seed,
      nonce: player.nonce,
      target: bet.target,
      wagerMicros: bet.wagerMicros,
      ts: Date.now(),
    }) };
    player.nonce += 1;
    cycle.records.push(record);
    store.save();
    return {
      roll: record.roll,
      win: record.payout_micros > 0,
      payoutMicros: record.payout_micros,
      nonce: record.nonce,
      roundIndex: record.round_index,
      clientSeed: record.client_seed,
      cycleId: cycle.cycle_id,
      seedHash: cycle.seed_hash,
    };
  });

  /** Live rotation progress for the admin corners (poll while a rotate request is in flight). */
  app.get("/cycle/rotation", async () => cycles.rotationStatus ?? { steps: [] });

  app.post("/cycle/rotate", async () => {
    const r = await cycles.rotate(false);
    invalidateRtp();
    return r;
  });
  app.post("/cycle/rotate-dishonest", async () => {
    const r = await cycles.rotate(true);
    invalidateRtp();
    return r;
  });

  app.get<{ Querystring: { cycle?: string } }>("/rounds", async (req, reply) => {
    const id = Number(req.query.cycle ?? store.data.active_cycle);
    const cycle = store.cycle(id);
    if (!cycle) return reply.code(404).send({ error: `unknown cycle ${id}` });
    const leaves = cycle.records.map(leafHash);
    const root = merkleRoot(leaves).toString("hex");
    return {
      ...store.publicCycle(cycle),
      pda: chain.cyclePda(cycle.cycle_id).toBase58(),
      merkle_root_local: root,
      proofs: cycle.records.map((_, i) => merkleProof(leaves, i)),
      leaves: leaves.map((l) => l.toString("hex")),
    };
  });

  app.get("/cheats", async () => ({
    attempts: Object.values(store.data.cycles).flatMap((c) => c.cheat_attempts.map((a) => ({ ...a, cycle_id: c.cycle_id }))),
  }));

  await app.listen({ port: PORT, host: "0.0.0.0" });
  app.log.info(`SEALED server on http://localhost:${PORT} — ${CLUSTER} ${RPC} — program ${chain.programId.toBase58()}, active cycle ${store.data.active_cycle}`);
}

main().catch((e: unknown) => {
  console.error(e);
  process.exit(1);
});
