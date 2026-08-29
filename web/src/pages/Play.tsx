import type { JSX } from "react";
import { useCallback, useEffect, useRef, useState } from "react";
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
const easeOutBack = (t: number): number => 1 + 2.4 * Math.pow(t - 1, 3) + 1.4 * Math.pow(t - 1, 2);
const easeOutQuint = (t: number): number => 1 - Math.pow(1 - t, 5);

/** Tiny synthesised sounds (no assets): tick loop while rolling, a thud on land, a chime on a win. */
class Sfx {
  private ctx: AudioContext | null = null;
  private ensure(): AudioContext {
    this.ctx ??= new AudioContext();
    if (this.ctx.state === "suspended") void this.ctx.resume();
    return this.ctx;
  }
  tick(pitch = 1): void {
    const c = this.ensure();
    const o = c.createOscillator();
    const g = c.createGain();
    o.type = "square";
    o.frequency.value = 900 * pitch;
    g.gain.setValueAtTime(0.05, c.currentTime);
    g.gain.exponentialRampToValueAtTime(0.0001, c.currentTime + 0.05);
    o.connect(g).connect(c.destination);
    o.start();
    o.stop(c.currentTime + 0.06);
  }
  land(win: boolean): void {
    const c = this.ensure();
    const o = c.createOscillator();
    const g = c.createGain();
    o.type = "sine";
    o.frequency.setValueAtTime(win ? 520 : 140, c.currentTime);
    o.frequency.exponentialRampToValueAtTime(win ? 1040 : 60, c.currentTime + (win ? 0.25 : 0.18));
    g.gain.setValueAtTime(0.18, c.currentTime);
    g.gain.exponentialRampToValueAtTime(0.0001, c.currentTime + (win ? 0.6 : 0.3));
    o.connect(g).connect(c.destination);
    o.start();
    o.stop(c.currentTime + 0.7);
    if (win) {
      for (const [f, d] of [[784, 0.08], [988, 0.16], [1318, 0.24]] as const) {
        const b = c.createOscillator();
        const bg = c.createGain();
        b.type = "triangle";
        b.frequency.value = f;
        bg.gain.setValueAtTime(0.0001, c.currentTime + d);
        bg.gain.exponentialRampToValueAtTime(0.12, c.currentTime + d + 0.02);
        bg.gain.exponentialRampToValueAtTime(0.0001, c.currentTime + d + 0.5);
        b.connect(bg).connect(c.destination);
        b.start(c.currentTime + d);
        b.stop(c.currentTime + d + 0.55);
      }
    }
  }
}
const sfx = new Sfx();

export function Play(): JSX.Element {
  const [state, setState] = useState<ServerState | null>(null);
  const [playerId, setPlayerId] = useState(() => localStorage.getItem("sealed.player") ?? "you");
  const [clientSeed, setClientSeed] = useState(() => localStorage.getItem("sealed.clientSeed") ?? Math.random().toString(16).slice(2, 12));
  const [target, setTarget] = useState(50);
  const [wager, setWager] = useState("1.00");
  const [rolling, setRolling] = useState(false);
  const [marker, setMarker] = useState<number | null>(null); // 0–99.99 marker position while animating
  const [display, setDisplay] = useState<number | null>(null);
  const [last, setLast] = useState<Bet | null>(null);
  const [history, setHistory] = useState<Bet[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [rotateMsg, setRotateMsg] = useState<string | null>(null);
  const [burst, setBurst] = useState(0);
  const [sound, setSound] = useState(true);
  const raf = useRef<number | null>(null);

  useEffect(() => localStorage.setItem("sealed.player", playerId), [playerId]);
  useEffect(() => localStorage.setItem("sealed.clientSeed", clientSeed), [clientSeed]);

  const refresh = useCallback((): void => {
    api.state().then(setState).catch((e: Error) => setError(e.message));
  }, []);
  useEffect(() => {
    refresh();
    const id = window.setInterval(refresh, 8000);
    return () => window.clearInterval(id);
  }, [refresh]);

  const multiplier = 99 / target;
  const chance = target - 0.01;

  /** Animate the marker: fast sweep (with ticks), then a spring settle onto the roll. */
  const animateTo = useCallback(
    (roll: number, win: boolean): Promise<void> =>
      new Promise((resolve) => {
        const t0 = performance.now();
        const sweep = 900;
        const settle = 700;
        let lastTickBucket = -1;
        const from = marker ?? 50;
        const step = (now: number): void => {
          const t = now - t0;
          if (t < sweep) {
            // Two full sweeps of the bar decelerating into the neighbourhood of the roll.
            const p = easeOutQuint(t / sweep);
            const pos = ((from + p * (200 + roll - from)) % 100 + 100) % 100;
            setMarker(pos);
            setDisplay(Math.round(pos * 100) / 100);
            const bucket = Math.floor(t / (40 + p * 120));
            if (bucket !== lastTickBucket) {
              lastTickBucket = bucket;
              if (sound) sfx.tick(0.8 + p * 0.6);
            }
            raf.current = requestAnimationFrame(step);
          } else if (t < sweep + settle) {
            const p = easeOutBack((t - sweep) / settle);
            const overshoot = roll + (1 - Math.min(1, p)) * 6 * Math.sign(0.5 - roll / 100);
            const pos = Math.max(0, Math.min(99.99, roll + (overshoot - roll) * (1 - Math.min(1, p))));
            setMarker(pos);
            setDisplay(Math.round((roll + (pos - roll) * 0.4) * 100) / 100);
            raf.current = requestAnimationFrame(step);
          } else {
            setMarker(roll);
            setDisplay(roll);
            if (sound) sfx.land(win);
            if (win) setBurst((b) => b + 1);
            resolve();
          }
        };
        raf.current = requestAnimationFrame(step);
      }),
    [marker, sound],
  );

  async function roll(): Promise<void> {
    if (rolling) return;
    setError(null);
    setRolling(true);
    setLast(null);
    try {
      const wagerMicros = Math.round(Number(wager) * 1e6);
      const r = await api.bet({ playerId, clientSeed, target, wagerMicros });
      await animateTo(r.roll, r.win);
      const bet: Bet = { roundIndex: r.roundIndex, nonce: r.nonce, target, roll: r.roll, wagerMicros, payoutMicros: r.payoutMicros, cycleId: r.cycleId };
      setLast(bet);
      setHistory((h) => [bet, ...h].slice(0, 40));
      refresh();
    } catch (e) {
      if (raf.current) cancelAnimationFrame(raf.current);
      setError((e as Error).message);
    } finally {
      setRolling(false);
    }
  }

  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (e.code === "Space" && !(e.target instanceof HTMLInputElement)) {
        e.preventDefault();
        void roll();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  async function rotate(dishonest: boolean): Promise<void> {
    setRotateMsg(dishonest ? "rotating (fake reveal first)…" : "rotating…");
    try {
      const r = await api.rotate(dishonest);
      const cheat = (r.txs as { cheatAttempt?: { signature: string; error: string } }).cheatAttempt;
      setRotateMsg(`cycle ${r.closedCycle} closed + revealed; cycle ${r.newCycle} sealed` + (cheat ? ` · fake reveal REJECTED on-chain (${cheat.error})` : ""));
      refresh();
    } catch (e) {
      setRotateMsg(`rotate failed: ${(e as Error).message}`);
    }
  }

  const active = state?.active_cycle ?? null;
  const won = last ? last.payoutMicros > 0 : null;
  const streak = history.slice(0, 12);

  return (
    <main className="play">
      <section className="panel bet">
        <div className="bet-head">
          <h2>Roll under</h2>
          <button className={`sound ${sound ? "" : "off"}`} onClick={() => setSound(!sound)} aria-label="sound">{sound ? "🔊" : "🔈"}</button>
        </div>

        <div className={`dice-stage ${won === null ? "" : won ? "win" : "lose"} ${rolling ? "rolling" : ""}`}>
          {burst > 0 && (
            <div className="confetti" key={burst}>
              {Array.from({ length: 28 }, (_, i) => (
                <i key={i} style={{ left: `${(i * 37) % 100}%`, animationDelay: `${(i % 7) * 40}ms`, background: ["#4da6ff", "#a855f7", "#f0b429", "#22c55e"][i % 4] }} />
              ))}
            </div>
          )}
          <div className="dice-num-wrap">
            <span className="dice-num">{display === null ? "0.00" : display.toFixed(2)}</span>
            <span className="dice-verdict">
              {last && !rolling ? (won ? `WIN +${fmt(last.payoutMicros)}` : "no luck") : rolling ? "rolling…" : "press ROLL or Space"}
              {last && !rolling && <small> · nonce {last.nonce} · round #{last.roundIndex} · cycle {last.cycleId}</small>}
            </span>
          </div>

          <div className="rollbar">
            <div className="zone win" style={{ width: `${target}%` }} />
            <div className="zone lose" style={{ left: `${target}%`, width: `${100 - target}%` }} />
            <div className="target-line" style={{ left: `${target}%` }}>
              <span>{target}</span>
            </div>
            {marker !== null && (
              <div className={`marker ${rolling ? "" : won ? "win" : "lose"}`} style={{ left: `${marker}%` }}>
                <span>{(display ?? 0).toFixed(2)}</span>
              </div>
            )}
            <div className="ticks">
              {[0, 25, 50, 75, 100].map((t) => (
                <em key={t} style={{ left: `${t}%` }}>{t}</em>
              ))}
            </div>
          </div>
        </div>

        <label className="slider">
          <span className="slider-labels">
            <span>roll under <strong>{target}</strong></span>
            <span>chance <strong>{chance.toFixed(2)}%</strong></span>
            <span>payout <strong>×{multiplier.toFixed(4)}</strong></span>
          </span>
          <input type="range" min={2} max={98} value={target} onChange={(e) => setTarget(Number(e.target.value))} disabled={rolling} />
        </label>

        <div className="row">
          <label>
            Wager
            <div className="wager-row">
              <input value={wager} onChange={(e) => setWager(e.target.value)} inputMode="decimal" />
              <button onClick={() => setWager((w) => (Math.max(0.01, Number(w) / 2)).toFixed(2))}>½</button>
              <button onClick={() => setWager((w) => (Number(w) * 2).toFixed(2))}>2×</button>
            </div>
          </label>
          <label>
            Player
            <input value={playerId} onChange={(e) => setPlayerId(e.target.value)} />
          </label>
        </div>
        <button className="primary" disabled={rolling || !active} onClick={() => void roll()}>
          {rolling ? "ROLLING…" : "ROLL"}
        </button>
        {streak.length > 0 && (
          <div className="streak">
            {streak.map((b) => (
              <span key={`${b.cycleId}-${b.roundIndex}`} className={`chip ${b.payoutMicros > 0 ? "win" : "lose"}`} title={`target ${b.target} · ${b.payoutMicros > 0 ? "+" + fmt(b.payoutMicros) : "lost " + fmt(b.wagerMicros)}`}>
                {b.roll.toFixed(2)}
              </span>
            ))}
          </div>
        )}
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
            on-chain RTP so far: {state.rtp.rtp === null ? "n/a" : `${(state.rtp.rtp * 100).toFixed(2)}%`} over {state.rtp.totalRounds} rounds (all games) · dice declared 99%
          </p>
        )}
      </section>
    </main>
  );
}
