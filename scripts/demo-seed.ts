/**
 * Demo seeder: ~200 rounds across 3 players over 2 cycles — the first rotated honestly, the
 * second via rotate-dishonest (which leaves a failed on-chain reveal behind). A third, fresh
 * cycle is active afterwards so /play works immediately.
 */
const SERVER = process.env["SEALED_SERVER"] ?? "http://localhost:4000";
const PLAYERS = [
  { id: "alice", seed: "alice-likes-dragons" },
  { id: "bob", seed: "bob-2026" },
  { id: "carol", seed: "carol-x" },
];

async function post<T>(path: string, body?: unknown): Promise<T> {
  const res = await fetch(`${SERVER}${path}`, body ? { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) } : { method: "POST" });
  if (!res.ok) throw new Error(`${path} → ${res.status} ${await res.text()}`);
  return (await res.json()) as T;
}

// Deterministic pseudo-random bets so the seeded demo looks the same every run.
let s = 42;
const rnd = (): number => {
  s = (s * 1103515245 + 12345) & 0x7fffffff;
  return s / 0x7fffffff;
};

async function playRounds(n: number): Promise<{ wagered: number; paid: number }> {
  let wagered = 0;
  let paid = 0;
  for (let i = 0; i < n; i++) {
    const p = PLAYERS[i % PLAYERS.length]!;
    const target = 10 + Math.floor(rnd() * 80); // 10..89
    const wagerMicros = [250_000, 500_000, 1_000_000, 2_000_000][Math.floor(rnd() * 4)]!;
    const r = await post<{ roll: number; payoutMicros: number }>("/bet", { playerId: p.id, clientSeed: p.seed, target, wagerMicros });
    wagered += wagerMicros;
    paid += r.payoutMicros;
    if (i % 25 === 24) process.stdout.write(`  ${i + 1}/${n} rounds…\n`);
  }
  return { wagered, paid };
}

async function main(): Promise<void> {
  console.log(`seeding demo data on ${SERVER}`);
  const a = await playRounds(Number(process.env["ROUNDS_A"] ?? 100));
  console.log(`cycle A: wagered ${a.wagered / 1e6} paid ${a.paid / 1e6} → rotating honestly`);
  const ra = await post<{ closedCycle: number; txs: Record<string, unknown> }>("/cycle/rotate");
  console.log(`  closed cycle ${ra.closedCycle}`, ra.txs);

  const b = await playRounds(Number(process.env["ROUNDS_B"] ?? 100));
  console.log(`cycle B: wagered ${b.wagered / 1e6} paid ${b.paid / 1e6} → rotating DISHONESTLY (expect an on-chain HashMismatch)`);
  const rb = await post<{ closedCycle: number; txs: { cheatAttempt?: { signature: string; error: string } } }>("/cycle/rotate-dishonest");
  console.log(`  closed cycle ${rb.closedCycle}; cheat attempt:`, rb.txs.cheatAttempt);

  const state = (await (await fetch(`${SERVER}/state`)).json()) as { active_cycle: { cycle_id: number }; rtp: { rtp: number | null } };
  console.log(`done. active cycle ${state.active_cycle.cycle_id}; on-chain RTP so far ${state.rtp.rtp === null ? "n/a" : (state.rtp.rtp * 100).toFixed(2) + "%"}`);
  console.log("open http://localhost:5173/verify");
}

main().catch((e: unknown) => {
  console.error(e);
  process.exit(1);
});
