/**
 * SEALED watchdog — re-verifies every revealed cycle continuously and independently.
 * Polls the chain (raw JSON-RPC, own account decoder) and the server's public round records;
 * never trusts the server's own verdicts. Exposes GET /status for the /verify page.
 */
import cors from "@fastify/cors";
import Fastify from "fastify";
import { decodeSeedCycle, verifyCycle } from "./verify.js";
import type { CheckResult, RoundRecord } from "./verify.js";

const SERVER = process.env["SEALED_SERVER"] ?? "http://localhost:4000";
const RPC = process.env["SOLANA_RPC"] ?? "http://127.0.0.1:8899";
const PORT = Number(process.env["WATCHDOG_PORT"] ?? 4100);
const INTERVAL_MS = Number(process.env["WATCHDOG_INTERVAL_MS"] ?? 3000);

interface Status {
  rounds_verified: number;
  cycles_verified: number;
  mismatches: number;
  last_check: string | null;
  alarm: boolean;
  cycles: Record<string, { ok: boolean; rounds: number; checks: CheckResult[]; verified_at: string }>;
}

const status: Status = { rounds_verified: 0, cycles_verified: 0, mismatches: 0, last_check: null, alarm: false, cycles: {} };

async function rpc<T>(method: string, params: unknown[]): Promise<T> {
  const res = await fetch(RPC, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }) });
  const json = (await res.json()) as { result?: T; error?: { message: string } };
  if (json.error) throw new Error(json.error.message);
  return json.result as T;
}

async function fetchAccount(pda: string): Promise<Buffer | null> {
  const r = await rpc<{ value: { data: [string, string] } | null }>("getAccountInfo", [pda, { encoding: "base64", commitment: "confirmed" }]);
  return r.value ? Buffer.from(r.value.data[0], "base64") : null;
}

async function tick(): Promise<void> {
  const state = (await (await fetch(`${SERVER}/state`)).json()) as { cycles: { cycle_id: number; status: string; pda: string }[] };
  let rounds = 0;
  let cycles = 0;
  let mismatches = 0;
  for (const c of state.cycles) {
    if (c.status !== "revealed") continue;
    const raw = await fetchAccount(c.pda);
    if (!raw) continue;
    const chain = decodeSeedCycle(raw);
    if (!chain.revealed) continue;
    const rounds_ = (await (await fetch(`${SERVER}/rounds?cycle=${c.cycle_id}`)).json()) as { records: RoundRecord[] };
    const checks = verifyCycle(chain, rounds_.records);
    const ok = checks.every((x) => x.ok);
    status.cycles[String(c.cycle_id)] = { ok, rounds: rounds_.records.length, checks, verified_at: new Date().toISOString() };
    cycles++;
    rounds += rounds_.records.length;
    if (!ok) {
      mismatches += checks.filter((x) => !x.ok).length;
      console.error(`\x1b[41m\x1b[97m MISMATCH \x1b[0m cycle ${c.cycle_id}: ${checks.filter((x) => !x.ok).map((x) => `${x.name} — ${x.detail}`).join(" | ")}`);
    }
  }
  status.rounds_verified = rounds;
  status.cycles_verified = cycles;
  status.mismatches = mismatches;
  status.alarm = mismatches > 0;
  status.last_check = new Date().toISOString();
  const colour = mismatches > 0 ? "\x1b[31m" : "\x1b[32m";
  process.stdout.write(`\r${colour}rounds verified: ${rounds}, cycles: ${cycles}, mismatches: ${mismatches}, last check: ${status.last_check}\x1b[0m   `);
}

async function main(): Promise<void> {
  const app = Fastify({ logger: false });
  await app.register(cors, { origin: true });
  app.get("/status", async () => status);
  await app.listen({ port: PORT, host: "0.0.0.0" });
  console.log(`SEALED watchdog on http://localhost:${PORT}/status — verifying against ${SERVER} and ${RPC}`);
  for (;;) {
    try {
      await tick();
    } catch (e) {
      process.stdout.write(`\rwatchdog: waiting for server/chain (${(e as Error).message})   `);
    }
    await new Promise((r) => setTimeout(r, INTERVAL_MS));
  }
}

main().catch((e: unknown) => {
  console.error(e);
  process.exit(1);
});
