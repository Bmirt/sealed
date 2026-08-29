/**
 * Independent verification primitives. Deliberately NOT imported from the server package —
 * the watchdog must re-derive everything on its own from raw chain data + the public records.
 */
import { GAME_CONFIG, buySpin, spin } from "ashfall-math";
import { createHash, createHmac } from "node:crypto";

/** Dice round (no `game` field on records from before the slot existed). */
export interface DiceRecord {
  game?: "dice";
  cycle_id: number;
  round_index: number;
  player_id: string;
  client_seed: string;
  nonce: number;
  target: number;
  wager_micros: number;
  roll: number;
  payout_micros: number;
  ts: number;
}
/** Ashfall Dynasty round — verified by re-running the shared pure slot maths (packages/ashfall-math). */
export interface SlotRecord {
  game: "ashfall";
  cycle_id: number;
  round_index: number;
  player_id: string;
  client_seed: string;
  nonce: number;
  kind: string;
  bet_micros: number;
  wager_micros: number;
  payout_micros: number;
  stops: number[];
  total_win_coins: number;
  outcome_hash: string;
  ts: number;
}
export type RoundRecord = DiceRecord | SlotRecord;

export interface ChainCycle {
  cycleId: number;
  seedHash: string;
  revealed: boolean;
  closed: boolean;
  revealedSeed: string;
  committedAt: number;
  revealedAt: number;
  merkleRoot: string;
  rounds: number;
  wageredMicros: number;
  paidMicros: number;
}

const sha256 = (d: Buffer | string): Buffer => createHash("sha256").update(d).digest();

export function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (value && typeof value === "object") {
    const obj = value as Record<string, unknown>;
    return `{${Object.keys(obj)
      .sort()
      .map((k) => `${JSON.stringify(k)}:${canonicalJson(obj[k])}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
}

export function rollFor(seedHex: string, clientSeed: string, nonce: number): number {
  const mac = createHmac("sha256", Buffer.from(seedHex, "utf8")).update(`${clientSeed}:${nonce}`).digest();
  return (mac.readUInt32BE(0) % 10000) / 100;
}

/** A slot round reproduces iff the re-run maths lands on the same stops, win and outcome hash. */
export function slotReproduces(seedHex: string, r: SlotRecord): boolean {
  const spinSeed = createHmac("sha256", Buffer.from(seedHex, "utf8")).update(`${r.client_seed}:${r.nonce}`).digest("hex");
  const outcome = r.kind === "buyFree" ? buySpin(GAME_CONFIG, spinSeed, 0, "free") : r.kind === "buySuper" ? buySpin(GAME_CONFIG, spinSeed, 0, "super") : spin(GAME_CONFIG, spinSeed, 0);
  const hash = sha256(canonicalJson(outcome)).toString("hex");
  return outcome.base.stops.join(",") === r.stops.join(",") && outcome.totalWinCoins === r.total_win_coins && hash === r.outcome_hash;
}

export function merkleRootHex(records: readonly RoundRecord[]): string {
  if (records.length === 0) return "0".repeat(64);
  let level = records.map((r) => sha256(canonicalJson(r)));
  while (level.length > 1) {
    const next: Buffer[] = [];
    for (let i = 0; i < level.length; i += 2) next.push(sha256(Buffer.concat([level[i] as Buffer, (level[i + 1] ?? level[i]) as Buffer])));
    level = next;
  }
  return (level[0] as Buffer).toString("hex");
}

/**
 * Decode a SeedCycle account from raw bytes (Anchor/Borsh layout — see programs/sealed_engine):
 *   8 disc | u64 cycle_id | [32] seed_hash | u8 status | u8 closed | u32 len + bytes revealed_seed |
 *   i64 committed_at | i64 revealed_at | [32] merkle_root | u64 rounds | u64 wagered | u64 paid | u8 bump
 */
export function decodeSeedCycle(data: Buffer): ChainCycle {
  let o = 8;
  const u64 = (): number => {
    const v = Number(data.readBigUInt64LE(o));
    o += 8;
    return v;
  };
  const i64 = (): number => {
    const v = Number(data.readBigInt64LE(o));
    o += 8;
    return v;
  };
  const cycleId = u64();
  const seedHash = data.subarray(o, o + 32).toString("hex");
  o += 32;
  const status = data.readUInt8(o);
  o += 1;
  const closed = data.readUInt8(o) === 1;
  o += 1;
  const len = data.readUInt32LE(o);
  o += 4;
  const revealedSeed = data.subarray(o, o + len).toString("utf8");
  o += len;
  const committedAt = i64();
  const revealedAt = i64();
  const merkleRoot = data.subarray(o, o + 32).toString("hex");
  o += 32;
  const rounds = u64();
  const wageredMicros = u64();
  const paidMicros = u64();
  return { cycleId, seedHash, revealed: status === 1, closed, revealedSeed, committedAt, revealedAt, merkleRoot, rounds, wageredMicros, paidMicros };
}

export interface CheckResult {
  name: string;
  ok: boolean;
  detail: string;
}

/** Checks 2, 4, 5, 6 of the verifier, on raw data. */
export function verifyCycle(chain: ChainCycle, records: readonly RoundRecord[]): CheckResult[] {
  const out: CheckResult[] = [];
  const seedHash = sha256(Buffer.from(chain.revealedSeed, "utf8")).toString("hex");
  out.push({ name: "seed matches commitment", ok: seedHash === chain.seedHash, detail: `sha256(seed)=${seedHash.slice(0, 16)}… chain=${chain.seedHash.slice(0, 16)}…` });
  const badRolls = records.filter((r) => (r.game === "ashfall" ? !slotReproduces(chain.revealedSeed, r) : rollFor(chain.revealedSeed, r.client_seed, r.nonce) !== r.roll));
  const slots = records.filter((r) => r.game === "ashfall").length;
  out.push({ name: "every outcome re-derives", ok: badRolls.length === 0, detail: badRolls.length ? `rounds ${badRolls.map((r) => r.round_index).join(",")} do not match` : `${records.length} rounds re-derived (${slots} slot spins)` });
  const root = merkleRootHex(records);
  out.push({ name: "merkle root matches chain", ok: root === chain.merkleRoot, detail: `local=${root.slice(0, 16)}… chain=${chain.merkleRoot.slice(0, 16)}…` });
  const wagered = records.reduce((a, r) => a + r.wager_micros, 0);
  const paid = records.reduce((a, r) => a + r.payout_micros, 0);
  out.push({
    name: "rtp totals match chain",
    ok: wagered === chain.wageredMicros && paid === chain.paidMicros && records.length === chain.rounds,
    detail: `local wagered=${wagered} paid=${paid} rounds=${records.length}; chain wagered=${chain.wageredMicros} paid=${chain.paidMicros} rounds=${chain.rounds}`,
  });
  return out;
}
