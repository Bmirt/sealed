import type { JSX } from "react";
import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { Link } from "react-router-dom";
import { audioManager } from "../audio/AudioManager";
import { loungeBgm } from "../audio/music";
import * as sfx from "../audio/sfx";

interface Bet {
  id: number;
  target: number;
  roll: number;
  wagerCents: number;
  payoutCents: number;
}

const START_BALANCE_CENTS = 100_000; // $1,000.00 play money
const BALANCE_KEY = "dice.balance";

const usd = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" });
const fmt = (cents: number): string => usd.format(cents / 100);
const signed = (cents: number): string => `${cents > 0 ? "+" : cents < 0 ? "−" : ""}${fmt(Math.abs(cents))}`;
const toCents = (text: string): number => Math.round(Number(text.replace(/[$,\s]/g, "")) * 100);
const easeOutQuint = (t: number): number => 1 - Math.pow(1 - t, 5);

function readNumber(key: string, fallback: number): number {
  try {
    const v = Number(localStorage.getItem(key));
    return localStorage.getItem(key) !== null && Number.isFinite(v) ? v : fallback;
  } catch {
    return fallback;
  }
}
function write(key: string, value: string): void {
  try {
    localStorage.setItem(key, value);
  } catch {
    /* private mode: the session still works, it just isn't remembered */
  }
}

/** A roll in 0.00 to 99.99, uniform: rejection-sample a crypto-random uint32 into 10,000 buckets. */
function rollDice(): number {
  const limit = Math.floor(0x1_0000_0000 / 10_000) * 10_000;
  const buf = new Uint32Array(1);
  do crypto.getRandomValues(buf);
  while ((buf[0] ?? 0) >= limit);
  return ((buf[0] ?? 0) % 10_000) / 100;
}

function SoundIcon({ on }: { on: boolean }): JSX.Element {
  return (
    <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M4 9h4l5-4v14l-5-4H4z" fill="currentColor" />
      {on ? (
        <>
          <path d="M16.5 8.5a5 5 0 0 1 0 7" />
          <path d="M19 6a8.5 8.5 0 0 1 0 12" />
        </>
      ) : (
        <path d="M17 9l5 6M22 9l-5 6" />
      )}
    </svg>
  );
}

function MusicIcon({ on }: { on: boolean }): JSX.Element {
  return (
    <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M9 18V6l10-2v12" />
      <circle cx="6.5" cy="18" r="2.5" fill="currentColor" />
      <circle cx="16.5" cy="16" r="2.5" fill="currentColor" />
      {!on && <path d="M3 3l18 18" />}
    </svg>
  );
}

const subscribeAudio = (cb: () => void): (() => void) => audioManager.subscribe(cb);
const audioSnapshot = () => audioManager.snapshot;

export function Dice(): JSX.Element {
  const [balance, setBalance] = useState(() => readNumber(BALANCE_KEY, START_BALANCE_CENTS));
  const [target, setTarget] = useState(50);
  const [wager, setWager] = useState("1.00");
  const [rolling, setRolling] = useState(false);
  const [marker, setMarker] = useState<number | null>(null); // 0 to 99.99 marker position while animating
  const [display, setDisplay] = useState<number | null>(null);
  const [precise, setPrecise] = useState(true); // whole numbers while the marker moves, exact roll once it locks
  const [last, setLast] = useState<Bet | null>(null);
  const [history, setHistory] = useState<Bet[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [burst, setBurst] = useState(0);
  const audio = useSyncExternalStore(subscribeAudio, audioSnapshot);
  const raf = useRef<number | null>(null);
  const rollSound = useRef<{ stop(): void } | null>(null);
  const nextId = useRef(1);
  const pendingPayout = useRef(0); // a win still animating: already decided, not yet credited

  useEffect(() => write(BALANCE_KEY, String(balance)), [balance]);
  useEffect(() => {
    // Audio may only start inside a user gesture, and browsers disagree on which events count,
    // so try on all of them. The lounge music starts with the first one and stops when you leave.
    const unlock = (): void => audioManager.init();
    const events = ["pointerdown", "pointerup", "click", "touchend", "keydown"] as const;
    for (const ev of events) window.addEventListener(ev, unlock, true);
    audioManager.playMusic(loungeBgm);
    return () => {
      for (const ev of events) window.removeEventListener(ev, unlock, true);
      audioManager.stopMusic();
    };
  }, []);
  useEffect(() => {
    // Leaving mid-roll must not swallow a win: credit it straight to the stored balance.
    const settle = (): void => {
      if (pendingPayout.current > 0) write(BALANCE_KEY, String(readNumber(BALANCE_KEY, 0) + pendingPayout.current));
      pendingPayout.current = 0;
    };
    window.addEventListener("pagehide", settle);
    return () => {
      window.removeEventListener("pagehide", settle);
      if (raf.current) cancelAnimationFrame(raf.current);
      rollSound.current?.stop();
      settle();
    };
  }, []);

  const multiplier = 99 / target;
  const chance = target;
  const wagerCents = toCents(wager);
  const potentialCents = Math.floor(wagerCents * multiplier);

  /**
   * Animate the marker: two decelerating laps (quintic ease-out) that come to rest exactly on the
   * roll. One continuous motion, no overshoot, no phase hand-off. The displayed number follows the
   * marker while it is moving fast and locks to the exact roll for the last stretch (the marker is
   * within 0.1 pt of it by then), so nothing flickers around the final value.
   */
  const animateTo = useCallback(
    (roll: number): Promise<void> =>
      new Promise((resolve) => {
        const t0 = performance.now();
        const total = 1500;
        rollSound.current = sfx.rollSfx(total / 1000); // rattle shaped to this motion
        const from = marker ?? 50;
        const distance = 200 + roll - from; // two laps plus the way to the roll
        let nextTick = t0; // ratchet ticks: every ~35 ms at full speed, spreading out as the marker slows
        let locked = false;
        const step = (now: number): void => {
          const p = Math.min(1, (now - t0) / total);
          const e = easeOutQuint(p);
          const unwrapped = from + e * distance;
          const pos = ((unwrapped % 100) + 100) % 100; // the marker eases all the way; its last motion is sub-pixel
          // The number locks to the exact roll once the marker is on its final approach (< 0.5 pt away,
          // past the laps); from then on nothing on screen changes except the marker's last glide.
          if (!locked && p > 0.5 && distance - e * distance < 0.5) {
            locked = true;
            setPrecise(true);
            sfx.lockSfx();
          }
          setDisplay(locked ? roll : Math.round(pos));
          if (!locked) {
            if (now >= nextTick) {
              nextTick = now + 35 + e * 110;
              sfx.tickSfx(0.8 + e * 0.6);
            }
          }
          setMarker(pos);
          if (p < 1) {
            raf.current = requestAnimationFrame(step);
          } else {
            setMarker(roll);
            setDisplay(roll);
            sfx.landSfx();
            resolve();
          }
        };
        raf.current = requestAnimationFrame(step);
      }),
    [marker],
  );

  async function roll(): Promise<void> {
    if (rolling) return;
    audioManager.init();
    const reject = (message: string): void => {
      sfx.errorSfx();
      setError(message);
    };
    if (!Number.isFinite(wagerCents) || wagerCents < 1) return reject("Enter a wager of at least $0.01");
    if (wagerCents > balance) return reject("Not enough balance for that wager");
    setError(null);
    setRolling(true);
    setLast(null);
    setPrecise(false);
    setBalance((b) => b - wagerCents);
    sfx.betSfx();
    const r = rollDice();
    const win = r < target;
    const bet: Bet = { id: nextId.current++, target, roll: r, wagerCents, payoutCents: win ? Math.floor(wagerCents * (99 / target)) : 0 };
    pendingPayout.current = bet.payoutCents;
    await animateTo(r);
    pendingPayout.current = 0;
    if (win) {
      sfx.winSfx(99 / target);
      setBurst((b) => b + 1);
    } else {
      sfx.loseSfx();
    }
    setBalance((b) => b + bet.payoutCents);
    setLast(bet);
    setHistory((h) => [bet, ...h].slice(0, 40));
    setRolling(false);
  }

  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (e.target instanceof HTMLInputElement) return;
      if (e.code === "Space" && !(e.target instanceof HTMLButtonElement)) {
        e.preventDefault();
        void roll();
      } else if (e.code === "KeyM" && !e.repeat) {
        toggleSound();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  const setWagerCents = (cents: number): void => {
    sfx.clickSfx();
    setWager((Math.max(1, Math.min(cents, balance)) / 100).toFixed(2));
  };
  const resetBalance = (): void => {
    sfx.coinsSfx();
    setBalance(START_BALANCE_CENTS);
    setError(null);
  };
  function toggleSound(): void {
    audioManager.init();
    const muted = !audioManager.snapshot.muted;
    audioManager.setMuted(muted);
    if (!muted) sfx.clickSfx();
  }
  const toggleMusic = (): void => {
    audioManager.init();
    audioManager.setMusic(!audio.music);
    sfx.clickSfx();
  };

  const won = last ? last.payoutCents > 0 : null;
  const streak = history.slice(0, 12);
  const stats = history.reduce(
    (s, b) => ({ wagered: s.wagered + b.wagerCents, profit: s.profit + b.payoutCents - b.wagerCents, wins: s.wins + (b.payoutCents > 0 ? 1 : 0), best: Math.max(s.best, b.payoutCents - b.wagerCents) }),
    { wagered: 0, profit: 0, wins: 0, best: 0 },
  );
  const broke = !rolling && balance < 1;

  return (
    <main className="dice-page">
      <div className="page-head">
        <Link to="/" className="back">← All games</Link>
        <h1>Dice</h1>
      </div>

      <div className="play">
        <section className="panel bet">
          <div className="bet-head">
            <h2>Roll under</h2>
            <div className="audio-controls">
              <button className={`audio-toggle ${audio.muted ? "off" : ""}`} onClick={toggleSound} aria-pressed={!audio.muted} title="Sound (M)">
                <SoundIcon on={!audio.muted} />
                <span>{audio.muted ? "Sound off" : "Sound on"}</span>
              </button>
              <button className={`audio-toggle ${audio.music ? "" : "off"}`} onClick={toggleMusic} aria-pressed={audio.music} title="Music">
                <MusicIcon on={audio.music} />
                <span>{audio.music ? "Music on" : "Music off"}</span>
              </button>
            </div>
          </div>
          {audio.status === "blocked" && (
            <p className="audio-hint" role="status">
              Your browser is holding the sound back. Click anywhere on the page, and make sure this tab isn't muted.
            </p>
          )}
          {audio.status === "unsupported" && <p className="audio-hint" role="status">This browser can't play Web Audio, so the game is silent.</p>}

          <div className={`dice-stage ${won === null ? "" : won ? "win" : "lose"} ${rolling ? "rolling" : ""}`}>
            {burst > 0 && (
              <div className="confetti" key={burst}>
                {Array.from({ length: 28 }, (_, i) => (
                  <i key={i} style={{ left: `${(i * 37) % 100}%`, animationDelay: `${(i % 7) * 40}ms`, background: ["#4da6ff", "#a855f7", "#f0b429", "#22c55e"][i % 4] }} />
                ))}
              </div>
            )}
            <div className="dice-num-wrap">
              <span className="dice-num">{display === null ? "0.00" : display.toFixed(precise ? 2 : 0)}</span>
              <span className="dice-verdict">
                {last && !rolling ? (won ? `WIN ${signed(last.payoutCents - last.wagerCents)}` : "no luck") : rolling ? "rolling…" : "press ROLL or Space"}
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
                  <span>{(display ?? 0).toFixed(precise ? 2 : 0)}</span>
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
            <input
              type="range"
              min={2}
              max={98}
              value={target}
              onChange={(e) => {
                const t = Number(e.target.value);
                sfx.slideSfx(t);
                setTarget(t);
              }}
              disabled={rolling}
              aria-label="Roll under target"
            />
          </label>

          <label>
            Wager
            <div className="wager-row">
              <span className="money-input">
                <span className="currency" aria-hidden="true">$</span>
                <input value={wager} onChange={(e) => setWager(e.target.value)} inputMode="decimal" disabled={rolling} aria-label="Wager in dollars" />
              </span>
              <button onClick={() => setWagerCents(Math.floor(wagerCents / 2))} disabled={rolling}>½</button>
              <button onClick={() => setWagerCents(wagerCents * 2)} disabled={rolling}>2×</button>
              <button onClick={() => setWagerCents(balance)} disabled={rolling}>Max</button>
            </div>
            <span className="win-preview">
              win pays <strong>{fmt(Number.isFinite(potentialCents) ? potentialCents : 0)}</strong>
            </span>
          </label>

          <button className="primary" disabled={rolling || broke} onClick={() => void roll()}>
            {rolling ? "ROLLING…" : "ROLL"}
          </button>
          {streak.length > 0 && (
            <div className="streak">
              {streak.map((b) => (
                <span key={b.id} className={`chip ${b.payoutCents > 0 ? "win" : "lose"}`} title={`target ${b.target}, ${b.payoutCents > 0 ? "won " + signed(b.payoutCents - b.wagerCents) : "lost " + fmt(b.wagerCents)}`}>
                  {b.roll.toFixed(2)}
                </span>
              ))}
            </div>
          )}
          {error && <p className="err">{error}</p>}
        </section>

        <section className="panel wallet">
          <h3>Balance</h3>
          <p className="balance">{fmt(balance)}</p>
          <p className="muted small">Play money. Nothing here is real.</p>
          {broke && <p className="err">Out of chips.</p>}
          <button onClick={resetBalance} disabled={rolling}>Reset to {fmt(START_BALANCE_CENTS)}</button>

          <h3 className="stats-head">This session</h3>
          <dl className="stats">
            <dt>Rolls</dt><dd>{history.length}</dd>
            <dt>Wins</dt><dd>{history.length ? `${stats.wins} (${((stats.wins / history.length) * 100).toFixed(0)}%)` : "0"}</dd>
            <dt>Wagered</dt><dd>{fmt(stats.wagered)}</dd>
            <dt>Profit</dt><dd className={stats.profit > 0 ? "green" : stats.profit < 0 ? "red" : ""}>{signed(stats.profit)}</dd>
            <dt>Best win</dt><dd>{stats.best > 0 ? signed(stats.best) : fmt(0)}</dd>
          </dl>
          <p className="muted small rules">Win when the roll is under your target. Payout = 99 ÷ target (1% house edge).</p>
        </section>

        <section className="panel history">
          <h3>My bets</h3>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>#</th><th>target</th><th>roll</th><th>wager</th><th>payout</th><th>profit</th>
                </tr>
              </thead>
              <tbody>
                {history.map((b) => (
                  <tr key={b.id} className={b.payoutCents > 0 ? "win" : "lose"}>
                    <td>{b.id}</td><td>&lt; {b.target}</td><td>{b.roll.toFixed(2)}</td><td>{fmt(b.wagerCents)}</td><td>{fmt(b.payoutCents)}</td>
                    <td>{signed(b.payoutCents - b.wagerCents)}</td>
                  </tr>
                ))}
                {history.length === 0 && (
                  <tr><td colSpan={6} className="muted">no bets yet</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </section>
      </div>
    </main>
  );
}
