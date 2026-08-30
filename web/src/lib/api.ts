import type { CycleRounds, ServerState } from "./types";

// Dev talks to the local stack. A production build (Vercel etc.) is same-origin with the slot under
// /ashfall/, defaults to devnet, and has NO server unless VITE_SEALED_SERVER points at a hosted one —
// every server call then rejects with a clear message instead of hitting the static host.
const PROD = import.meta.env.PROD;
export const SERVER = (import.meta.env["VITE_SEALED_SERVER"] as string | undefined) ?? (PROD ? "" : "http://localhost:4000");
export const WATCHDOG = (import.meta.env["VITE_SEALED_WATCHDOG"] as string | undefined) ?? (PROD ? "" : "http://localhost:4100");
export const ASHFALL_URL = (import.meta.env["VITE_ASHFALL_URL"] as string | undefined) ?? (PROD ? "/ashfall/" : "http://localhost:5174");
export const CLUSTER = ((import.meta.env["VITE_SEALED_CLUSTER"] as string | undefined) ?? (PROD ? "devnet" : "localnet")) as "localnet" | "devnet";
export const RPC = (import.meta.env["VITE_SOLANA_RPC"] as string | undefined) ?? (CLUSTER === "devnet" ? "https://api.devnet.solana.com" : "http://localhost:8899");
export const NO_SERVER_MESSAGE = "no SEALED server configured — set VITE_SEALED_SERVER to your hosted server URL and rebuild";

const get = (base: string, path: string, init?: RequestInit): Promise<Response> =>
  base ? fetch(`${base}${path}`, init) : Promise.reject(new Error(NO_SERVER_MESSAGE));

const clusterQuery = CLUSTER === "devnet" ? "cluster=devnet" : `cluster=custom&customUrl=${encodeURIComponent(RPC)}`;
/** Cycle accounts deep-link to the transaction HISTORY tab: commit → close → reveal is the story, not the raw bytes. */
export const explorerAddress = (a: string): string => `https://explorer.solana.com/address/${a}/history?${clusterQuery}`;
export const explorerTx = (s: string): string => `https://explorer.solana.com/tx/${s}?${clusterQuery}`;

async function json<T>(res: Response): Promise<T> {
  if (!res.ok) throw new Error(`${res.status} ${await res.text()}`);
  return (await res.json()) as T;
}

export const api = {
  state: (): Promise<ServerState> => get(SERVER, "/state").then((r) => json<ServerState>(r)),
  rounds: (cycle: number): Promise<CycleRounds> => get(SERVER, `/rounds?cycle=${cycle}`).then((r) => json<CycleRounds>(r)),
  cheats: (): Promise<{ attempts: { signature: string; error: string; at: number; cycle_id: number }[] }> => get(SERVER, "/cheats").then((r) => json(r)),
  bet: (body: { playerId: string; clientSeed: string; target: number; wagerMicros: number }) =>
    get(SERVER, "/bet", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) }).then((r) =>
      json<{ roll: number; win: boolean; payoutMicros: number; nonce: number; roundIndex: number; clientSeed: string; cycleId: number; seedHash: string }>(r),
    ),
  rotation: (): Promise<{ steps: unknown[] } | Record<string, unknown>> => get(SERVER, "/cycle/rotation").then((r) => json(r)),
  rotate: (dishonest: boolean) =>
    get(SERVER, `/cycle/${dishonest ? "rotate-dishonest" : "rotate"}`, { method: "POST" }).then((r) =>
      json<{ closedCycle: number; newCycle: number; txs: Record<string, unknown> }>(r),
    ),
  watchdog: (): Promise<{ rounds_verified: number; cycles_verified: number; mismatches: number; last_check: string | null; alarm: boolean }> =>
    get(WATCHDOG, "/status").then((r) => json(r)),
};
