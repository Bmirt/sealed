import type { JSX } from "react";
import { useEffect, useMemo, useState } from "react";
import { Check } from "../components/Check";
import { Derivation } from "../components/Derivation";
import { RotationTimeline } from "../components/RotationTimeline";
import type { RotationStatus } from "../components/RotationTimeline";
import type { CheckState } from "../components/Check";
import { CLUSTER, api, explorerAddress, explorerTx } from "../lib/api";
import { leafHex, merkleRootHex, rederiveSlot, rollFor, sha256Hex, verifyProofHex } from "../lib/crypto";
import { decodeRtp, decodeSeedCycle, fetchAccountsBytes, fetchTx } from "../lib/rpc";
import type { TxInfo } from "../lib/rpc";
import type { ChainCycle, ChainRtp, CycleRounds, RoundRecord, ServerState } from "../lib/types";
import { isSlot } from "../lib/types";

const DICE_COLS = ["client_seed", "nonce", "target", "wager_micros", "roll", "payout_micros"] as const;
const SLOT_COLS = ["client_seed", "nonce", "kind", "wager_micros", "stops", "total_win_coins", "payout_micros"] as const;
const fmtTs = (s: number): string => (s ? new Date(s * 1000).toISOString() : "—");

export function Verify(): JSX.Element {
  const [state, setState] = useState<ServerState | null>(null);
  const [cycleId, setCycleId] = useState<number | null>(null);
  const [server, setServer] = useState<CycleRounds | null>(null);
  const [chain, setChain] = useState<ChainCycle | null | undefined>(undefined);
  const [rtp, setRtp] = useState<ChainRtp | null>(null);
  const [tamper, setTamper] = useState(false);
  const [derivIndex, setDerivIndex] = useState(0);
  const [rotation, setRotation] = useState<RotationStatus | null>(null);
  const [cheating, setCheating] = useState(false);
  const [localSeed, setLocalSeed] = useState("");
  const [local, setLocal] = useState<RoundRecord[]>([]);
  const [checks, setChecks] = useState<CheckState[]>([]);
  const [cheats, setCheats] = useState<{ signature: string; error: string; cycle_id: number; tx?: TxInfo | null }[]>([]);
  const [watchdog, setWatchdog] = useState<Awaited<ReturnType<typeof api.watchdog>> | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [chainWarning, setChainWarning] = useState<string | null>(null);

  // Cycle list + default selection (latest revealed).
  useEffect(() => {
    api
      .state()
      .then((s) => {
        setState(s);
        if (cycleId === null) {
          const wanted = Number(new URLSearchParams(window.location.search).get("cycle"));
          const revealed = s.cycles.filter((c) => c.status === "revealed");
          const fromUrl = Number.isInteger(wanted) && s.cycles.some((c) => c.cycle_id === wanted) ? wanted : null;
          setCycleId(fromUrl ?? (revealed[revealed.length - 1] ?? s.cycles[s.cycles.length - 1])?.cycle_id ?? null);
        }
      })
      .catch((e: Error) => setError(e.message));
    const id = window.setInterval(() => {
      api.watchdog().then(setWatchdog).catch(() => setWatchdog(null));
    }, 2000);
    return () => window.clearInterval(id);
  }, [cycleId]);

  // Load the chosen cycle: server records first, then the raw chain accounts in ONE RPC call
  // (decoded here, not by the server). A rate-limited chain read must not blank the page.
  useEffect(() => {
    if (cycleId === null || !state) return;
    let cancelled = false;
    setChain(undefined);
    setChainWarning(null);
    setError(null);
    (async () => {
      const rounds = await api.rounds(cycleId);
      if (cancelled) return;
      setServer(rounds);
      setLocal(rounds.records.map((r) => ({ ...r })));
      setLocalSeed(rounds.server_seed ?? "");
      setTamper(false);
      const pda = state.cycles.find((c) => c.cycle_id === cycleId)?.pda ?? rounds.pda;
      try {
        let pair: (Uint8Array | null)[];
        try {
          pair = await fetchAccountsBytes([pda, state.rtp_pda]);
        } catch {
          await new Promise((r) => setTimeout(r, 2500)); // public RPC rate limit — one more try
          pair = await fetchAccountsBytes([pda, state.rtp_pda]);
        }
        const [bytes, rtpBytes] = pair;
        if (cancelled) return;
        const decoded = bytes ? decodeSeedCycle(bytes) : null;
        setChain(decoded);
        setRtp(rtpBytes ? decodeRtp(rtpBytes) : null);
        if (decoded?.revealedSeed) setLocalSeed(decoded.revealedSeed);
      } catch (e) {
        if (cancelled) return;
        setChain(null);
        setChainWarning(`Chain read failed (${(e as Error).message}) — the public devnet RPC rate-limits; pick the cycle again to retry.`);
      }
    })().catch((e: Error) => setError(e.message));
    return () => {
      cancelled = true;
    };
  }, [cycleId, state]);

  // Cheat attempts, each re-checked against the chain — sequentially and cached, because the
  // public devnet RPC rate-limits bursts of getTransaction calls.
  useEffect(() => {
    let cancelled = false;
    api
      .cheats()
      .then(async (c) => {
        const out: typeof cheats = [];
        for (const a of c.attempts.slice(-8).reverse()) {
          const key = `sealed.tx.${a.signature}`;
          let tx: TxInfo | null = null;
          const cached = sessionStorage.getItem(key);
          if (cached) tx = JSON.parse(cached) as TxInfo;
          else {
            tx = await fetchTx(a.signature).catch(() => null);
            if (tx) sessionStorage.setItem(key, JSON.stringify(tx));
            await new Promise((r) => setTimeout(r, 350));
          }
          out.push({ ...a, tx });
          if (!cancelled) setCheats([...out]);
        }
      })
      .catch(() => setCheats([]));
    return () => {
      cancelled = true;
    };
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
      const haveSeed = Boolean(localSeed);
      const c2ok = haveSeed && chain ? seedHash === chain.seedHash : null;
      out.push({
        title: "sha256(revealed seed) equals the commitment",
        ok: c2ok,
        summary: !haveSeed
          ? "pending — seed not revealed yet (simulate a forged reveal below to see what a wrong seed does)"
          : c2ok
            ? "seed matches the hash sealed before play"
            : revealed
              ? "seed does NOT hash to the commitment"
              : "this (simulated) seed does NOT hash to the on-chain commitment — no seed but the real one can",
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
      let diceN = 0;
      let slotN = 0;
      if (haveSeed) {
        for (const r of local) {
          if (isSlot(r)) {
            slotN++;
            const d = await rederiveSlot(localSeed, r);
            if (!d.ok) bad.push(`slot round ${r.round_index}: recorded stops [${r.stops.join(",")}] win ${r.total_win_coins} but the maths gives [${d.stops.join(",")}] win ${d.totalWinCoins}`);
            if (sample.length < 3) sample.push(`slot round ${r.round_index} (${r.kind}): spin(HMAC(seed, "${r.client_seed}:${r.nonce}")) → stops [${d.stops.join(",")}] win ${d.totalWinCoins} coins, outcome sha256 ${d.outcomeHash.slice(0, 12)}…  (recorded [${r.stops.join(",")}] / ${r.total_win_coins} / ${r.outcome_hash.slice(0, 12)}…)`);
          } else {
            diceN++;
            const roll = await rollFor(localSeed, r.client_seed, r.nonce);
            if (roll !== r.roll) bad.push(`dice round ${r.round_index}: recorded ${r.roll} but HMAC gives ${roll}`);
            if (sample.length < 3) sample.push(`dice round ${r.round_index}: HMAC(seed, "${r.client_seed}:${r.nonce}") → ${roll}  (recorded ${r.roll})`);
          }
        }
      }
      out.push({
        title: "Every outcome re-derives from HMAC(seed, client_seed:nonce)",
        ok: haveSeed && local.length > 0 ? bad.length === 0 : null,
        summary: !haveSeed
          ? "pending reveal"
          : local.length === 0
            ? "no rounds in this cycle"
            : bad.length === 0
              ? `${local.length}/${local.length} outcomes reproduced in this browser${slotN ? ` (${diceN} dice, ${slotN} slot spins incl. free spins)` : ""}`
              : `${bad.length} outcome(s) do not reproduce${revealed ? "" : " under this simulated seed"}`,
        math: [
          `dice: roll = uint32(HMAC_SHA256(key=utf8(seed), msg="client_seed:nonce")[0..4]) % 10000 / 100`,
          `slot: spinSeed = hex(HMAC_SHA256(seed, "client_seed:nonce")); outcome = ashfall spin(config, spinSeed, 0) — the full pure maths re-run here`,
          ...sample,
          ...bad.slice(0, 10),
        ],
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
  const chainUnreadable = chainWarning !== null;
  const anyRed = !chainUnreadable && checks.some((c) => c.ok === false);
  const revealedSeedKnown = Boolean(chain?.revealedSeed || server?.server_seed);
  const isRevealed = server?.status === "revealed" || chain?.revealed === true;
  const canTamper = chain !== null && chain !== undefined;
  const simulatedSeed = tamper && !isRevealed && Boolean(localSeed);
  const randomSeed = (): string => Array.from(crypto.getRandomValues(new Uint8Array(32)), (b) => b.toString(16).padStart(2, "0")).join("");

  function edit(i: number, key: string, value: string): void {
    setLocal((rows) =>
      rows.map((r, idx) => {
        if (idx !== i) return r;
        if (key === "stops") return { ...r, stops: value.split(",").map((x) => Number(x.trim())) } as RoundRecord;
        const num = ["nonce", "target", "wager_micros", "roll", "payout_micros", "total_win_coins", "bet_micros"].includes(key);
        return { ...r, [key]: num ? Number(value) : value } as RoundRecord;
      }),
    );
  }
  /** The real thing: rotate-dishonest, watched live, then jump to the freshly revealed cycle. */
  async function cheatForReal(): Promise<void> {
    if (cheating) return;
    setCheating(true);
    const poll = window.setInterval(() => {
      api.rotation().then((r) => { if ((r as RotationStatus).steps?.length) setRotation(r as RotationStatus); }).catch(() => undefined);
    }, 500);
    try {
      await api.rotate(true);
    } catch {
      /* the timeline carries the error */
    } finally {
      window.clearInterval(poll);
      const r = (await api.rotation().catch(() => null)) as RotationStatus | null;
      if (r) setRotation(r);
      setCheating(false);
      const st = await api.state().catch(() => null);
      if (st) {
        setState(st);
        if (r?.ok) setCycleId(r.cycleId);
      }
    }
  }

  const cellValue = (r: RoundRecord, k: string): string => {
    const v = (r as unknown as Record<string, unknown>)[k];
    return Array.isArray(v) ? v.join(",") : v === undefined ? "" : String(v);
  };

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
          <button
            className={`tamper ${tamper ? "on" : ""}`}
            disabled={!canTamper}
            title={isRevealed ? "Edit the local copy and watch the checks flip" : "The seed is still sealed — simulate a forged reveal: any seed you type is checked against the on-chain commitment"}
            onClick={() => setTamper(!tamper)}
          >
            🧪 {tamper ? "Simulation ON — editing local copy" : "Simulate tampering (local)"}
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

      <div className={`verdict ${anyRed ? "bad" : chainUnreadable ? "warn" : allGreen ? "ok" : ""}`}>
        {chainUnreadable
          ? "⚠ Could not read this cycle's account from the chain (public RPC rate limit) — nothing verified yet. Re-select the cycle to retry."
          : anyRed
          ? "✗ TAMPERING DETECTED — your local copy no longer matches what was sealed on-chain (simulation: nothing was posted)"
          : allGreen
            ? isRevealed
              ? "✓ All checks pass — this cycle is exactly what was sealed before play"
              : "🔒 This cycle is still sealed — the commitment is on-chain; the seed is revealed when the cycle closes. Checks 2–6 run then (or simulate a forged reveal below)."
            : "computing…"}
      </div>
      {chainWarning && <p className="err">{chainWarning}</p>}

      <section className="checks">
        {checks.map((c, i) => (
          <Check key={c.title} c={c} index={i + 1} />
        ))}
      </section>

      {local.length > 0 && (
      <section className="panel derivation-panel">
        <h3>How a round is derived — server seed + client seed + nonce</h3>
        <p className="muted">
          Pick a round. Everything below is recomputed in your browser from three inputs: the server seed (revealed on-chain, whose hash was
          committed <em>before</em> play), the player's client seed and the nonce.
        </p>
        <label>
          Round
          <select value={Math.min(derivIndex, Math.max(0, local.length - 1))} onChange={(e) => setDerivIndex(Number(e.target.value))}>
            {local.map((r, i) => (
              <option key={r.round_index} value={i}>
                #{r.round_index} · {isSlot(r) ? `🐉 ashfall ${r.kind}` : `🎲 dice target ${r.target}`} · {r.player_id} · nonce {r.nonce}
              </option>
            ))}
          </select>
        </label>
        <Derivation seedHex={localSeed} chain={chain ?? null} pda={server?.pda ?? ""} record={local[Math.min(derivIndex, Math.max(0, local.length - 1))] ?? null} revealed={revealedSeedKnown} simulated={simulatedSeed} />
      </section>
      )}

      <section className={`panel tamper-panel ${tamper ? "on" : ""}`}>
        <h3>1 · Simulate tampering — a local what-if</h3>
        <p className="muted">
          This edits <strong>your browser's copy</strong> of the records or the seed. Nothing is sent to the server or to Solana. It answers one question:
          <em> if the operator had altered any value after the fact, would the checks catch it?</em> They do — instantly — because the true values are
          pinned by the on-chain commitment and Merkle root.
        </p>
        {!isRevealed && (
          <p className="muted">
            <strong>This cycle's seed is still sealed</strong> — only its hash is on-chain. So the what-if here is a <em>forged reveal</em>: type any seed
            (or generate one) and see it fail check 2 against the commitment and check 4 against the rounds. That is precisely what the chain refuses in
            section 2 — except here nothing leaves your browser.
          </p>
        )}
        {tamper && (
          <label>
            {isRevealed ? "Revealed seed — change one hex digit and watch checks 2 and 4 flip" : "Pretend seed — the real one is sealed; try to find one that passes check 2"}
            <div className="seed-row">
              <input className="mono" value={localSeed} placeholder="type any 64-hex seed, or generate one" onChange={(e) => setLocalSeed(e.target.value)} />
              {!isRevealed && <button onClick={() => setLocalSeed(randomSeed())}>Generate a fake seed</button>}
            </div>
          </label>
        )}
        {tamper && local.length > 0 && <p className="muted">…or click any cell in the round table below to change a roll, a stop, a nonce or a payout.</p>}
      </section>

      <section className={`panel cheat-panel ${rotation ? "active" : ""}`}>
        <h3>2 · Try to cheat for real — on Solana {CLUSTER}</h3>
        <p className="muted">
          This is the opposite of a simulation: the server will <strong>post a transaction</strong> revealing a <em>wrong</em> seed for the currently active cycle.
          The program recomputes sha256 on-chain and refuses it — the failed transaction is permanent. Then the honest reveal follows and the cycle becomes
          verifiable here. (It closes the active cycle, like the admin buttons in the games.)
        </p>
        <button className="danger" disabled={cheating} onClick={() => void cheatForReal()}>
          {cheating ? "posting to the chain…" : `Submit a fake reveal on ${CLUSTER}`}
        </button>
        {rotation && <RotationTimeline r={rotation} verifyHref={`/verify?cycle=${rotation.cycleId}`} />}
      </section>

      <section className="panel rounds">
        <h3>
          Round records {server ? `(${server.records.length})` : ""} {tamper && <span className="muted">— click a cell to edit</span>}
        </h3>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>#</th><th>game</th><th>player</th><th>client_seed</th><th>nonce</th><th>target / kind</th><th>wager</th><th>roll / stops</th><th>win</th><th>payout</th><th>ts</th>
              </tr>
            </thead>
            <tbody>
              {local.slice(0, 60).map((r, i) => {
                const cols = isSlot(r) ? (SLOT_COLS as readonly string[]) : (DICE_COLS as readonly string[]);
                const cell = (k: string): JSX.Element => (
                  <td key={k}>{tamper ? <input className={`cell ${k === "stops" ? "wide" : ""}`} value={cellValue(r, k)} onChange={(e) => edit(i, k, e.target.value)} /> : cellValue(r, k)}</td>
                );
                return (
                  <tr key={r.round_index} className={isSlot(r) ? "slot-row" : ""}>
                    <td>{r.round_index}</td>
                    <td>{isSlot(r) ? "🐉 ashfall" : "🎲 dice"}</td>
                    <td>{r.player_id}</td>
                    {cell("client_seed")}
                    {cell("nonce")}
                    {isSlot(r) ? cell("kind") : cell("target")}
                    {cell("wager_micros")}
                    {isSlot(r) ? cell("stops") : cell("roll")}
                    {isSlot(r) ? cell("total_win_coins") : <td className="muted">—</td>}
                    {cell("payout_micros")}
                    <td className="muted">{new Date(r.ts).toLocaleTimeString()}</td>
                    {cols.length === 0 && <td />}
                  </tr>
                );
              })}
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
