/**
 * Raw Solana JSON-RPC + hand-written account decoders. No SDK: the verifier re-derives
 * everything from bytes it fetched itself, so there is nothing to trust but the chain.
 */
import { RPC } from "./api";
import type { ChainCycle, ChainRtp } from "./types";

/** JSON-RPC with exponential backoff — public devnet RPCs return 429 on bursts. */
async function call<T>(method: string, params: unknown[], attempts = 4): Promise<T> {
  let delay = 600;
  for (let i = 0; ; i++) {
    const res = await fetch(RPC, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }) });
    if (res.status === 429 && i < attempts - 1) {
      await new Promise((r) => setTimeout(r, delay));
      delay *= 2;
      continue;
    }
    const body = (await res.json().catch(() => ({ error: { message: `${res.status} ${res.statusText}` } }))) as { result?: T; error?: { message: string } };
    if (body.error) {
      if (/429|rate/i.test(body.error.message) && i < attempts - 1) {
        await new Promise((r) => setTimeout(r, delay));
        delay *= 2;
        continue;
      }
      throw new Error(body.error.message);
    }
    return body.result as T;
  }
}

function b64(s: string): Uint8Array {
  const bin = atob(s);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

export const hex = (u: Uint8Array): string => Array.from(u, (b) => b.toString(16).padStart(2, "0")).join("");

/** Several accounts in ONE request (getMultipleAccounts) — fewer calls, fewer 429s. */
export async function fetchAccountsBytes(addresses: string[]): Promise<(Uint8Array | null)[]> {
  const r = await call<{ value: ({ data: [string, string] } | null)[] }>("getMultipleAccounts", [addresses, { encoding: "base64", commitment: "confirmed" }]);
  return r.value.map((v) => (v ? b64(v.data[0]) : null));
}

export async function fetchAccountBytes(address: string): Promise<Uint8Array | null> {
  const r = await call<{ value: { data: [string, string] } | null }>("getAccountInfo", [address, { encoding: "base64", commitment: "confirmed" }]);
  return r.value ? b64(r.value.data[0]) : null;
}

/** Layout: see programs/sealed_engine/src/lib.rs (SeedCycle). */
export function decodeSeedCycle(d: Uint8Array): ChainCycle {
  const v = new DataView(d.buffer, d.byteOffset, d.byteLength);
  let o = 8;
  const u64 = (): number => {
    const x = Number(v.getBigUint64(o, true));
    o += 8;
    return x;
  };
  const i64 = (): number => {
    const x = Number(v.getBigInt64(o, true));
    o += 8;
    return x;
  };
  const cycleId = u64();
  const seedHash = hex(d.subarray(o, o + 32));
  o += 32;
  const status = d[o] ?? 0;
  o += 1;
  const closed = d[o] === 1;
  o += 1;
  const len = v.getUint32(o, true);
  o += 4;
  const revealedSeed = new TextDecoder().decode(d.subarray(o, o + len));
  o += len;
  const committedAt = i64();
  const revealedAt = i64();
  const merkleRoot = hex(d.subarray(o, o + 32));
  o += 32;
  return { cycleId, seedHash, revealed: status === 1, closed, revealedSeed, committedAt, revealedAt, merkleRoot, rounds: u64(), wageredMicros: u64(), paidMicros: u64() };
}

export function decodeRtp(d: Uint8Array): ChainRtp {
  const v = new DataView(d.buffer, d.byteOffset, d.byteLength);
  return { totalRounds: Number(v.getBigUint64(8, true)), totalWageredMicros: Number(v.getBigUint64(16, true)), totalPaidMicros: Number(v.getBigUint64(24, true)) };
}

export interface TxInfo {
  err: unknown;
  logs: string[];
  slot: number;
  blockTime: number | null;
}

export async function fetchTx(signature: string): Promise<TxInfo | null> {
  const r = await call<{ meta: { err: unknown; logMessages: string[] } | null; slot: number; blockTime: number | null } | null>("getTransaction", [
    signature,
    { commitment: "confirmed", maxSupportedTransactionVersion: 0, encoding: "json" },
  ]);
  if (!r) return null;
  return { err: r.meta?.err ?? null, logs: r.meta?.logMessages ?? [], slot: r.slot, blockTime: r.blockTime };
}
