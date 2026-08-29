import type { JSX } from "react";
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { ASHFALL_URL, CLUSTER, api, explorerAddress } from "../lib/api";
import type { ServerState } from "../lib/types";

const pct = (v: number | null | undefined): string => (v === null || v === undefined ? "—" : `${(v * 100).toFixed(2)}%`);

/** Game chooser. Both games run on the same sealed randomness and are verified the same way. */
export function Landing(): JSX.Element {
  const [state, setState] = useState<ServerState | null>(null);
  useEffect(() => {
    api.state().then(setState).catch(() => setState(null));
  }, []);
  const active = state?.active_cycle ?? null;
  const dice = state?.games?.["dice"];
  const slot = state?.games?.["ashfall"];
  return (
    <main className="landing">
      <section className="hero">
        <h1>
          Two games. <span className="hl">One seal.</span>
        </h1>
        <p className="lede">
          Every outcome below is derived from a server seed whose hash was written to Solana <em>before</em> play. When a cycle closes the seed is revealed,
          the chain checks it, and anyone can re-run every round in their browser.
        </p>
        <p className="chainline">
          {active ? (
            <>
              🔒 cycle <strong>#{active.cycle_id}</strong> sealed on <strong>{CLUSTER}</strong>: <code title={active.seed_hash}>{active.seed_hash.slice(0, 12)}…</code>{" "}
              <a href={explorerAddress(active.pda)} target="_blank" rel="noreferrer">view on chain</a>
            </>
          ) : (
            <span className="muted">connecting to the SEALED server…</span>
          )}
        </p>
      </section>

      <section className="games">
        <Link className="game-card dice" to="/play">
          <div className="game-art dice-art">
            <span className="die">⚄</span>
          </div>
          <h2>Dice — roll under</h2>
          <p>Pick a target, roll 0.00–99.99. Payout 99 ÷ target. The simplest possible provably fair game.</p>
          <div className="game-stats">
            <span>rounds {dice?.rounds ?? 0}</span>
            <span>RTP {pct(dice?.rtp)} · declared 99%</span>
          </div>
          <span className="cta">Play →</span>
        </Link>

        <a className="game-card slot" href={ASHFALL_URL}>
          <div className="game-art slot-art">
            <span className="sigil">◈</span>
            <span className="slot-title">ASHFALL DYNASTY</span>
          </div>
          <h2>Ashfall Dynasty — 243-ways slot</h2>
          <p>5×3 reels, Dragonfire free spins, buy bonus, 5,000× max win. Same sealed seed, every spin re-derivable — free spins included.</p>
          <div className="game-stats">
            <span>rounds {slot?.rounds ?? 0}</span>
            <span>RTP {pct(slot?.rtp)} · declared {slot ? pct(slot.declared) : "96.56%"}</span>
          </div>
          <span className="cta">Play →</span>
        </a>
      </section>

      <section className="how">
        <div className="step"><b>1</b> Commit — <code>commit_seed(sha256(seed))</code> lands on-chain before the first bet.</div>
        <div className="step"><b>2</b> Play — dice rolls and slot spins are HMAC(seed, your client seed : nonce).</div>
        <div className="step"><b>3</b> Close — the Merkle root of every round and the money totals are written on-chain.</div>
        <div className="step"><b>4</b> Reveal — the chain recomputes sha256 and refuses any other seed. Then <Link to="/verify">verify it yourself →</Link></div>
      </section>
    </main>
  );
}
