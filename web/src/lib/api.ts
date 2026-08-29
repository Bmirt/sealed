import type { CycleRounds, ServerState } from "./types";

export const SERVER = (import.meta.env["VITE_SEALED_SERVER"] as string | undefined) ?? "http://localhost:4000";
export const WATCHDOG = (import.meta.env["VITE_SEALED_WATCHDOG"] as string | undefined) ?? "http://localhost:4100";
export const ASHFALL_URL = (import.meta.env["VITE_ASHFALL_URL"] as string | undefined) ?? "http://localhost:5174";
export const CLUSTER = ((import.meta.env["VITE_SEALED_CLUSTER"] as string | undefined) ?? "localnet") as "localnet" | "devnet";
export const RPC = (import.meta.env["VITE_SOLANA_RPC"] as string | undefined) ?? (CLUSTER === "devnet" ? "https://api.devnet.solana.com" : "http://localhost:8899");

const clusterQuery = CLUSTER === "devnet" ? "cluster=devnet" : `cluster=custom&customUrl=${encodeURIComponent(RPC)}`;
export const explorerAddress = (a: string): string => `https://explorer.solana.com/address/${a}?${clusterQuery}`;
export const explorerTx = (s: string): string => `https://explorer.solana.com/tx/${s}?${clusterQuery}`;

async function json<T>(res: Response): Promise<T> {
  if (!res.ok) throw new Error(`${res.status} ${await res.text()}`);
  return (await res.json()) as T;
}

export const api = {
  state: (): Promise<ServerState> => fetch(`${SERVER}/state`).then((r) => json<ServerState>(r)),
  rounds: (cycle: number): Promise<CycleRounds> => fetch(`${SERVER}/rounds?cycle=${cycle}`).then((r) => json<CycleRounds>(r)),
  cheats: (): Promise<{ attempts: { signature: string; error: string; at: number; cycle_id: number }[] }> => fetch(`${SERVER}/cheats`).then((r) => json(r)),
  bet: (body: { playerId: string; clientSeed: string; target: number; wagerMicros: number }) =>
    fetch(`${SERVER}/bet`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) }).then((r) =>
      json<{ roll: number; win: boolean; payoutMicros: number; nonce: number; roundIndex: number; clientSeed: string; cycleId: number; seedHash: string }>(r),
    ),
  rotate: (dishonest: boolean) =>
    fetch(`${SERVER}/cycle/${dishonest ? "rotate-dishonest" : "rotate"}`, { method: "POST" }).then((r) =>
      json<{ closedCycle: number; newCycle: number; txs: Record<string, unknown> }>(r),
    ),
  watchdog: (): Promise<{ rounds_verified: number; cycles_verified: number; mismatches: number; last_check: string | null; alarm: boolean }> =>
    fetch(`${WATCHDOG}/status`).then((r) => json(r)),
};
