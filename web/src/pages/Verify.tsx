import type { JSX } from "react";
import { useEffect, useMemo, useState } from "react";
import { Check } from "../components/Check";
import type { CheckState } from "../components/Check";
import { api, explorerAddress, explorerTx } from "../lib/api";
import { leafHex, merkleRootHex, rollFor, sha256Hex, verifyProofHex } from "../lib/crypto";
import { decodeRtp, decodeSeedCycle, fetchAccountBytes, fetchTx } from "../lib/rpc";
import type { TxInfo } from "../lib/rpc";
import type { ChainCycle, ChainRtp, CycleRounds, RoundRecord, ServerState } from "../lib/types";

const EDITABLE: (keyof RoundRecord)[] = ["client_seed", "nonce", "target", "wager_micros", "roll", "payout_micros"];
const fmtTs = (s: number): string => (s ? new Date(s * 1000).toISOString() : "—");

export function Verify(): JSX.Element {
  const [state, setState] = useState<ServerState | null>(null);
  const [cycleId, setCycleId] = useState<number | null>(null);
  const [server, setServer] = useState<CycleRounds | null>(null);
  const [chain, setChain] = useState<ChainCycle | null | undefined>(undefined);
  const [rtp, setRtp] = useState<ChainRtp | null>(null);
  const [tamper, setTamper] = useState(false);
  const [localSeed, setLocalSeed] = useState("");
  const [local, setLocal] = useState<RoundRecord[]>([]);
  const [checks, setChecks] = useState<CheckState[]>([]);
  const [cheats, setCheats] = useState<{ signature: string; error: string; cycle_id: number; tx?: TxInfo | null }[]>([]);
  const [watchdog, setWatchdog] = useState<Awaited<ReturnType<typeof api.watchdog>> | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Cycle list + default selection (latest revealed).
  useEffect(() => {
    api
      .state()
      .then((s) => {
        setState(s);
        if (cycleId === null) {
          const revealed = s.cycles.filter((c) => c.status === "revealed");
          setCycleId((revealed[revealed.length - 1] ?? s.cycles[s.cycles.length - 1])?.cycle_id ?? null);
        }
      })
      .catch((e: Error) => setError(e.message));
    const id = window.setInterval(() => {
      api.watchdog().then(setWatchdog).catch(() => setWatchdog(null));
    }, 2000);
    return () => window.clearInterval(id);
  }, [cycleId]);

  // Load the chosen cycle: server records + raw chain account (decoded here, not by the server).
  useEffect(() => {
    if (cycleId === null || !state) return;
    setChain(undefined);
    Promise.all([api.rounds(cycleId), fetchAccountBytes(state.cycles.find((c) => c.cycle_id === cycleId)?.pda ?? ""), fetchAccountBytes(state.rtp_pda)])
      .then(([rounds, bytes, rtpBytes]) => {
        setServer(rounds);
        const decoded = bytes ? decodeSeedCycle(bytes) : null;
        setChain(decoded);
        setRtp(rtpBytes ? decodeRtp(rtpBytes) : null);
        setLocal(rounds.records.map((r) => ({ ...r })));
        setLocalSeed(decoded?.revealedSeed || rounds.server_seed || "");
        setTamper(false);
      })
      .catch((e: Error) => setError(e.message));
  }, [cycleId, state]);

  // Cheat attempts, each re-checked against the chain.
  useEffect(() => {
    api
      .cheats()
      .then(async (c) => {
        const withTx = await Promise.all(c.attempts.map(async (a) => ({ ...a, tx: await fetchTx(a.signature).catch(() => null) })));
        setCheats(withTx);
      })
      .catch(() => setCheats([]));
  }, [state]);

  const pristine = useMemo(() => JSON.stringify(server?.records ?? []), [server]);
  const isTampered = tamper && (JSON.stringify(local) !== pristine || localSeed !== (chain?.revealedSeed || server?.server_seed || ""));

  // THE checks — recomputed live from the local copy.
  useEffect(() => {
    if (!server || chain === undefined) return;
    let cancelled = false;
    (async () => {
      const out: CheckState[] = [];
      const pda = server.pda;
      const revealed = !!chain?.revealed;

      out.push({
        title: "Commitment found on chain",
        ok: chain !== null,
        summary: chain ? `committed ${fmtTs(chain.committedAt)}` : "no account at the cycle PDA",
        math: [`cycle PDA        ${pda}`, `seed_hash        ${chain?.seedHash ?? "—"}`, `committed_at     ${chain?.committedAt ?? "—"} (${chain ? fmtTs(chain.committedAt) : "—"})`, `status           ${chain ? (chain.revealed ? "Revealed" : "Active") : "—"}`, `explorer         ${explorerAddress(pda)}`],
      });

      const seedHash = localSeed ? await sha256Hex(localSeed) : "";
      const c2ok = revealed ? seedHash === chain?.seedHash : null;
      out.push({
        title: "sha256(revealed seed) equals the commitment",
        ok: c2ok,
        summary: !revealed ? "pending — seed not revealed yet" : c2ok ? "seed matches the hash sealed before play" : "seed does NOT hash to the commitment",
        math: [`seed (utf8)      ${localSeed || "—"}`, `sha256(seed)     ${seedHash || "—"}`, `on-chain hash    ${chain?.seedHash ?? "—"}`],
        tampered: isTampered,
      });

      const ts = local.map((r) => r.ts);
      const first = ts.length ? Math.floor(Math.min(...ts) / 1000) : null;
      const lastT = ts.length ? Math.floor(Math.max(...ts) / 1000) : null;
      const c3ok = chain && revealed ? (first === null ? true : chain.committedAt <= first && lastT !== null && lastT <= chain.revealedAt) : null;
      out.push({
        title: "Ordering: committed_at ≤ first round ≤ last round ≤ revealed_at",
        ok: c3ok,
        summary: !revealed ? "pending reveal" : c3ok ? `${local.length} rounds sit strictly between commit and reveal` : "a round falls outside the commit→reveal window",
        math: [`committed_at     ${chain?.committedAt ?? "—"}  ${chain ? fmtTs(chain.committedAt) : ""}`, `first round ts   ${first ?? "—"}  ${first ? fmtTs(first) : ""}`, `last round ts    ${lastT ?? "—"}  ${lastT ? fmtTs(lastT) : ""}`, `revealed_at      ${chain?.revealedAt ?? "—"}  ${chain ? fmtTs(chain.revealedAt) : ""}`],
        tampered: isTampered,
      });

      const bad: string[] = [];
      const sample: string[] = [];
      if (revealed && localSeed) {
        for (const r of local) {
          const roll = await rollFor(localSeed, r.client_seed, r.nonce);
          if (roll !== r.roll) bad.push(`round ${r.round_index}: recorded ${r.roll} but HMAC gives ${roll}`);
          if (sample.length < 3) sample.push(`round ${r.round_index}: HMAC(seed, "${r.client_seed}:${r.nonce}") → ${roll}  (recorded ${r.roll})`);
        }
      }
      out.push({
        title: "Every roll re-derives from HMAC(seed, client_seed:nonce)",
        ok: revealed ? bad.length === 0 : null,
        summary: !revealed ? "pending reveal" : bad.length === 0 ? `${local.length}/${local.length} rolls reproduced in this browser` : `${bad.length} roll(s) do not reproduce`,
        math: [`roll = uint32(HMAC_SHA256(key=utf8(seed), msg="client_seed:nonce")[0..4]) % 10000 / 100`, ...sample, ...bad.slice(0, 10)],
        tampered: isTampered,
      });

      const leaves = await Promise.all(local.map(leafHex));
      const root = await merkleRootHex(leaves);
      let proofsOk = true;
      const proofNotes: string[] = [];
      for (let i = 0; i < local.length && i < server.proofs.length; i++) {
        const ok = chain ? await verifyProofHex(leaves[i]!, server.proofs[i]!, chain.merkleRoot) : false;
        if (!ok) {
          proofsOk = false;
          if (proofNotes.length < 5) proofNotes.push(`proof for round ${i} does not reach the on-chain root`);
        }
      }
      const c5ok = chain && chain.closed ? root === chain.merkleRoot && proofsOk : null;
      out.push({
        title: "Merkle root of the round records equals the on-chain root",
        ok: c5ok,
        summary: !chain?.closed ? "pending close" : c5ok ? `${local.length} leaves → root matches; every proof verifies` : "root mismatch — the records are not the ones committed",
        math: [`leaf = sha256(canonical JSON of the record)`, `leaves           ${leaves.length}`, `local root       ${root}`, `on-chain root    ${chain?.merkleRoot ?? "—"}`, ...proofNotes],
        tampered: isTampered,
      });

      const wagered = local.reduce((a, r) => a + r.wager_micros, 0);
      const paid = local.reduce((a, r) => a + r.payout_micros, 0);
      const c6ok = chain && chain.closed ? wagered === chain.wageredMicros && paid === chain.paidMicros && local.length === chain.rounds : null;
      const localRtp = wagered ? paid / wagered : 0;
      out.push({
        title: "RTP totals equal the on-chain stats",
        ok: c6ok,
        summary: !chain?.closed ? "pending close" : `${(localRtp * 100).toFixed(2)}% local vs ${chain ? ((chain.paidMicros / Math.max(1, chain.wageredMicros)) * 100).toFixed(2) : "—"}% on-chain (declared 99%)` + (c6ok ? "" : " — MISMATCH"),
        math: [
          `local   wagered ${wagered}  paid ${paid}  rounds ${local.length}  → RTP ${(localRtp * 100).toFixed(4)}%`,
          `chain   wagered ${chain?.wageredMicros ?? "—"}  paid ${chain?.paidMicros ?? "—"}  rounds ${chain?.rounds ?? "—"}`,
          `global  wagered ${rtp?.totalWageredMicros ?? "—"}  paid ${rtp?.totalPaidMicros ?? "—"}  rounds ${rtp?.totalRounds ?? "—"}  → RTP ${rtp && rtp.totalWageredMicros ? ((rtp.totalPaidMicros / rtp.totalWageredMicros) * 100).toFixed(4) : "—"}%`,
          `declared RTP 99% (house edge 1%: payout = wager × 99 / target)`,
        ],
        tampered: isTampered,
      });
      if (!cancelled) setChecks(out);
    })().catch((e: Error) => setError(e.message));
    return () => {
      cancelled = true;
    };
  }, [server, chain, local, localSeed, rtp, isTampered]);

  const allGreen = checks.length > 0 && checks.every((c) => c.ok !== false);
  const anyRed = checks.some((c) => c.ok === false);

  function edit(i: number, key: keyof RoundRecord, value: string): void {
    setLocal((rows) =>
      rows.map((r, idx) => {
        if (idx !== i) return r;
        const num = ["nonce", "target", "wager_micros", "roll", "payout_micros"].includes(key);
        return { ...r, [key]: num ? Number(value) : value };
      }),
    );
  }

  return (
    <main className="verify">
      <section className="panel head">
        <div>
          <h2>Verifier</h2>
          <p className="muted">Everything below is re-derived in your browser from raw chain bytes and the public round records. The server's opinion is never used.</p>
        </div>
        <div className="head-controls">
          <label>
            Cycle
            <select value={cycleId ?? ""} onChange={(e) => setCycleId(Number(e.target.value))}>
              {state?.cycles.map((c) => (
                <option key={c.cycle_id} value={c.cycle_id}>
                  #{c.cycle_id} · {c.status} · {c.rounds} rounds{c.cheat_attempts ? ` · ${c.cheat_attempts} cheat attempt` : ""}
                </option>
              ))}
            </select>
          </label>
          <button className={`tamper ${tamper ? "on" : ""}`} onClick={() => setTamper(!tamper)}>
            🔴 {tamper ? "Tamper mode ON" : "Try to cheat"}
          </button>
          {tamper && (
            <button
              onClick={() => {
                setLocal((server?.records ?? []).map((r) => ({ ...r })));
                setLocalSeed(chain?.revealedSeed || server?.server_seed || "");
              }}
            >
              Reset
            </button>
          )}
        </div>
      </section>

      <div className={`verdict ${anyRed ? "bad" : allGreen ? "ok" : ""}`}>
        {anyRed ? "✗ TAMPERING DETECTED — this cycle does not match what was sealed on-chain" : allGreen ? "✓ All checks pass — this cycle is exactly what was sealed before play" : "computing…"}
      </div>

      <section className="checks">
        {checks.map((c, i) => (
          <Check key={c.title} c={c} index={i + 1} />
        ))}
      </section>

      {tamper && (
        <section className="panel">
          <h3>Tamper with the local copy</h3>
          <label>
            Revealed seed (edit one hex digit)
            <input className="mono" value={localSeed} onChange={(e) => setLocalSeed(e.target.value)} />
          </label>
        </section>
      )}

      <section className="panel rounds">
        <h3>
          Round records {server ? `(${server.records.length})` : ""} {tamper && <span className="muted">— click a cell to edit</span>}
        </h3>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>#</th><th>player</th><th>client_seed</th><th>nonce</th><th>target</th><th>wager</th><th>roll</th><th>payout</th><th>ts</th>
              </tr>
            </thead>
            <tbody>
              {local.slice(0, 60).map((r, i) => (
                <tr key={r.round_index}>
                  <td>{r.round_index}</td>
                  <td>{r.player_id}</td>
                  {EDITABLE.map((k) => (
                    <td key={k}>
                      {tamper ? <input className="cell" value={String(r[k])} onChange={(e) => edit(i, k, e.target.value)} /> : String(r[k])}
                    </td>
                  ))}
                  <td className="muted">{new Date(r.ts).toLocaleTimeString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {local.length > 60 && <p className="muted">showing 60 of {local.length}; all {local.length} are verified.</p>}
        </div>
      </section>

      <section className="panel cheats">
        <h3>Cheat attempts on chain</h3>
        <p className="muted">Every failed <code>reveal_seed</code> transaction, as recorded by the validator. Even we can't fake a reveal.</p>
        {cheats.length === 0 ? (
          <p className="muted">none yet — use "Rotate with a fake reveal first" on the play page (or the demo seeder).</p>
        ) : (
          <ul>
            {cheats.map((a) => (
              <li key={a.signature}>
                <span className="bad-pill">REJECTED</span> cycle #{a.cycle_id} · <code>{a.error}</code> ·{" "}
                <a href={explorerTx(a.signature)} target="_blank" rel="noreferrer">{a.signature.slice(0, 20)}…</a>
                {a.tx && (
                  <pre className="check-math">
                    {`err: ${JSON.stringify(a.tx.err)}\n${a.tx.logs.filter((l) => /Error|failed/.test(l)).join("\n")}`}
                  </pre>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className={`panel watchdog ${watchdog?.alarm ? "bad" : ""}`}>
        <h3>Watchdog (independent re-verifier)</h3>
        {watchdog ? (
          <p>
            rounds verified: <strong>{watchdog.rounds_verified}</strong> · cycles: <strong>{watchdog.cycles_verified}</strong> · mismatches:{" "}
            <strong className={watchdog.mismatches ? "red" : "green"}>{watchdog.mismatches}</strong> · last check {watchdog.last_check ? new Date(watchdog.last_check).toLocaleTimeString() : "—"}
          </p>
        ) : (
          <p className="muted">watchdog offline</p>
        )}
      </section>

      {error && <p className="err">{error}</p>}
    </main>
  );
}
