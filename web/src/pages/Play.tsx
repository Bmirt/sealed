import type { JSX } from "react";
import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { api, explorerAddress, explorerTx } from "../lib/api";
import type { ServerState } from "../lib/types";

interface Bet {
  roundIndex: number;
  nonce: number;
  target: number;
  roll: number;
  wagerMicros: number;
  payoutMicros: number;
  cycleId: number;
}

const fmt = (micros: number): string => (micros / 1e6).toFixed(2);

export function Play(): JSX.Element {
  const [state, setState] = useState<ServerState | null>(null);
  const [playerId, setPlayerId] = useState("you");
  const [clientSeed, setClientSeed] = useState(() => Math.random().toString(16).slice(2, 12));
  const [target, setTarget] = useState(50);
  const [wager, setWager] = useState("1.00");
  const [rolling, setRolling] = useState(false);
  const [display, setDisplay] = useState<number | null>(null);
  const [last, setLast] = useState<Bet | null>(null);
  const [history, setHistory] = useState<Bet[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [rotateMsg, setRotateMsg] = useState<string | null>(null);
  const spinTimer = useRef<number | null>(null);

  const refresh = (): void => {
    api.state().then(setState).catch((e: Error) => setError(e.message));
  };
  useEffect(() => {
    refresh();
    const id = window.setInterval(refresh, 8000);
    return () => window.clearInterval(id);
  }, []);

  const multiplier = 99 / target;
  const chance = target - 0.01; // roll < target over 0.00–99.99 (10,000 outcomes) ≈ target %

  async function roll(): Promise<void> {
    if (rolling) return;
    setError(null);
    setRolling(true);
    // Spin the display while the server resolves the round.
    spinTimer.current = window.setInterval(() => setDisplay(Math.floor(Math.random() * 10000) / 100), 40);
    const started = Date.now();
    try {
      const wagerMicros = Math.round(Number(wager) * 1e6);
      const r = await api.bet({ playerId, clientSeed, target, wagerMicros });
      const remaining = Math.max(0, 600 - (Date.now() - started));
      await new Promise((res) => setTimeout(res, remaining));
      if (spinTimer.current) window.clearInterval(spinTimer.current);
      setDisplay(r.roll);
      const bet: Bet = { roundIndex: r.roundIndex, nonce: r.nonce, target, roll: r.roll, wagerMicros, payoutMicros: r.payoutMicros, cycleId: r.cycleId };
      setLast(bet);
      setHistory((h) => [bet, ...h].slice(0, 30));
      refresh();
    } catch (e) {
      if (spinTimer.current) window.clearInterval(spinTimer.current);
      setDisplay(null);
      setError((e as Error).message);
    } finally {
      setRolling(false);
    }
  }

  async function rotate(dishonest: boolean): Promise<void> {
    setRotateMsg(dishonest ? "rotating (dishonest reveal first)…" : "rotating…");
    try {
      const r = await api.rotate(dishonest);
      const cheat = (r.txs as { cheatAttempt?: { signature: string; error: string } }).cheatAttempt;
      setRotateMsg(
        `cycle ${r.closedCycle} closed + revealed; cycle ${r.newCycle} sealed` + (cheat ? ` · cheat attempt REJECTED on-chain (${cheat.error}) ${cheat.signature.slice(0, 12)}…` : ""),
      );
      refresh();
    } catch (e) {
      setRotateMsg(`rotate failed: ${(e as Error).message}`);
    }
  }

  const active = state?.active_cycle ?? null;
  const won = last ? last.payoutMicros > 0 : null;

  return (
    <main className="play">
      <section className="panel bet">
        <h2>Roll under</h2>
        <label>
          Target <strong>{target}</strong> · win chance ≈ <strong>{chance.toFixed(2)}%</strong> · payout <strong>×{multiplier.toFixed(4)}</strong>
          <input type="range" min={2} max={98} value={target} onChange={(e) => setTarget(Number(e.target.value))} />
        </label>
        <div className="row">
          <label>
            Wager
            <input value={wager} onChange={(e) => setWager(e.target.value)} inputMode="decimal" />
          </label>
          <label>
            Player
            <input value={playerId} onChange={(e) => setPlayerId(e.target.value)} />
          </label>
        </div>
        <button className="primary" disabled={rolling || !active} onClick={() => void roll()}>
          {rolling ? "rolling…" : "ROLL"}
        </button>
        <div className={`dice ${won === null ? "" : won ? "win" : "lose"}`}>
          <span className="dice-num">{display === null ? "—" : display.toFixed(2)}</span>
          {last && !rolling && <span className="dice-verdict">{won ? `WIN +${fmt(last.payoutMicros)}` : "lose"} · nonce {last.nonce} · round #{last.roundIndex}</span>}
        </div>
        {error && <p className="err">{error}</p>}
      </section>

      <section className="panel trust">
        <h3>Trust ritual</h3>
        {active ? (
          <p>
            Current cycle <strong>#{active.cycle_id}</strong> sealed: <code title={active.seed_hash}>{active.seed_hash.slice(0, 10)}…{active.seed_hash.slice(-6)}</code> 🔒{" "}
            <a href={explorerAddress(active.pda)} target="_blank" rel="noreferrer">view on chain</a>
            {active.commit_tx && (
              <>
                {" · "}
                <a href={explorerTx(active.commit_tx)} target="_blank" rel="noreferrer">commit tx</a>
              </>
            )}
            <br />
            <small>The server committed to this hash BEFORE any round was played. When the cycle closes, the seed is revealed and the chain checks it.</small>
          </p>
        ) : (
          <p>connecting to server…</p>
        )}
        <label>
          Your client seed (mixed into every roll — change it any time; the nonce restarts)
          <input value={clientSeed} onChange={(e) => setClientSeed(e.target.value)} />
        </label>
        <p>
          <Link to="/verify">Open the verifier →</Link>
        </p>
      </section>

      <section className="panel history">
        <h3>My bets</h3>
        <table>
          <thead>
            <tr>
              <th>cycle</th><th>#</th><th>nonce</th><th>target</th><th>roll</th><th>wager</th><th>payout</th>
            </tr>
          </thead>
          <tbody>
            {history.map((b) => (
              <tr key={`${b.cycleId}-${b.roundIndex}`} className={b.payoutMicros > 0 ? "win" : "lose"}>
                <td>{b.cycleId}</td><td>{b.roundIndex}</td><td>{b.nonce}</td><td>{b.target}</td><td>{b.roll.toFixed(2)}</td><td>{fmt(b.wagerMicros)}</td><td>{fmt(b.payoutMicros)}</td>
              </tr>
            ))}
            {history.length === 0 && (
              <tr><td colSpan={7} className="muted">no bets yet</td></tr>
            )}
          </tbody>
        </table>
      </section>

      <section className="panel admin">
        <h3>Admin corner</h3>
        <button onClick={() => void rotate(false)}>Rotate cycle (honest)</button>
        <button className="danger" onClick={() => void rotate(true)}>Rotate with a fake reveal first</button>
        {rotateMsg && <p className="muted">{rotateMsg}</p>}
        {state && (
          <p className="muted">
            on-chain RTP so far: {state.rtp.rtp === null ? "n/a" : `${(state.rtp.rtp * 100).toFixed(2)}%`} over {state.rtp.totalRounds} rounds · declared {(state.rtp.declared * 100).toFixed(0)}%
          </p>
        )}
      </section>
    </main>
  );
}
