import type { JSX } from "react";
import { useEffect, useState } from "react";
import { explorerAddress } from "../lib/api";
import { rederiveSlot, rollFor, sha256Hex, spinSeedFor, toHex } from "../lib/crypto";
import type { ChainCycle, RoundRecord } from "../lib/types";
import { isSlot } from "../lib/types";

interface Props {
  seedHex: string;
  chain: ChainCycle | null;
  pda: string;
  record: RoundRecord | null;
  revealed: boolean;
}

interface Derived {
  seedHash: string;
  message: string;
  mac: string;
  result: string;
  recorded: string;
  ok: boolean;
}

/**
 * The whole derivation of ONE round, with the real values: what came from the chain (server seed,
 * its commitment), what came from the player (client seed, nonce) and what falls out of HMAC.
 * This is what "provably fair" concretely means — and what tampering breaks.
 */
export function Derivation({ seedHex, chain, pda, record, revealed }: Props): JSX.Element {
  const [d, setD] = useState<Derived | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!record || !seedHex) {
        setD(null);
        return;
      }
      const seedHash = await sha256Hex(seedHex);
      const message = `${record.client_seed}:${record.nonce}`;
      const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(seedHex), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
      const mac = toHex(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(message)));
      let result: string;
      let recorded: string;
      let ok: boolean;
      if (isSlot(record)) {
        const spinSeed = await spinSeedFor(seedHex, record.client_seed, record.nonce);
        const s = await rederiveSlot(seedHex, record);
        result = `spinSeed = ${spinSeed.slice(0, 16)}… → spin() → stops [${s.stops.join(", ")}] · win ${s.totalWinCoins} coins · outcome sha256 ${s.outcomeHash.slice(0, 12)}…`;
        recorded = `stops [${record.stops.join(", ")}] · win ${record.total_win_coins} coins · ${record.outcome_hash.slice(0, 12)}…`;
        ok = s.ok;
      } else {
        const roll = await rollFor(seedHex, record.client_seed, record.nonce);
        result = `uint32(first 4 bytes = 0x${mac.slice(0, 8)}) % 10000 / 100 = ${roll.toFixed(2)}`;
        recorded = `roll ${record.roll.toFixed(2)} · target ${record.target} → ${record.payout_micros > 0 ? "WIN" : "lose"}`;
        ok = roll === record.roll;
      }
      if (!cancelled) setD({ seedHash, message, mac, result, recorded, ok });
    })().catch(() => setD(null));
    return () => {
      cancelled = true;
    };
  }, [seedHex, record]);

  if (!record) return <p className="muted">no rounds in this cycle</p>;
  const commitmentMatches = d && chain ? d.seedHash === chain.seedHash : null;

  return (
    <div className={`derivation ${d ? (d.ok ? "ok" : "bad") : ""}`}>
      <div className="deriv-grid">
        <div className="deriv-row chain">
          <span className="deriv-k">server seed</span>
          <span className="deriv-v mono">{revealed ? seedHex || "—" : "🔒 not revealed yet — only its hash is on-chain"}</span>
          <span className="deriv-src">
            from the chain: <code>revealed_seed</code> ·{" "}
            <a href={explorerAddress(pda)} target="_blank" rel="noreferrer">account ↗</a>
          </span>
        </div>
        <div className="deriv-row chain">
          <span className="deriv-k">its commitment</span>
          <span className="deriv-v mono">
            sha256(server seed) = {d?.seedHash ?? "—"}
            {commitmentMatches !== null && <b className={commitmentMatches ? "green" : "red"}> {commitmentMatches ? "= on-chain seed_hash ✓" : "≠ on-chain seed_hash ✗"}</b>}
          </span>
          <span className="deriv-src">
            sealed on-chain <em>before</em> this round was played: <code>seed_hash</code> {chain?.seedHash.slice(0, 16)}…
          </span>
        </div>
        <div className="deriv-row player">
          <span className="deriv-k">client seed</span>
          <span className="deriv-v mono">{record.client_seed}</span>
          <span className="deriv-src">chosen by the player — the server cannot know it in advance</span>
        </div>
        <div className="deriv-row player">
          <span className="deriv-k">nonce</span>
          <span className="deriv-v mono">{record.nonce}</span>
          <span className="deriv-src">the player's bet counter — every bet gets a new number</span>
        </div>
        <div className="deriv-row math">
          <span className="deriv-k">HMAC-SHA256</span>
          <span className="deriv-v mono">HMAC(key = server seed, msg = "{d?.message ?? "…"}") = {d?.mac ?? "…"}</span>
          <span className="deriv-src">computed in your browser just now</span>
        </div>
        <div className="deriv-row math">
          <span className="deriv-k">{isSlot(record) ? "spin" : "roll"}</span>
          <span className="deriv-v mono">{d?.result ?? "…"}</span>
          <span className="deriv-src">what the maths says this round MUST have been</span>
        </div>
        <div className={`deriv-row ${d ? (d.ok ? "match" : "mismatch") : ""}`}>
          <span className="deriv-k">recorded</span>
          <span className="deriv-v mono">{d?.recorded ?? "…"}</span>
          <span className="deriv-src">{d ? (d.ok ? "✓ identical — the server could not have chosen this outcome" : "✗ does NOT match — this record is not what the sealed seed produces") : ""}</span>
        </div>
      </div>
    </div>
  );
}
