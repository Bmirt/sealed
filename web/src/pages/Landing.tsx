import type { JSX } from "react";
import { Link } from "react-router-dom";

// The slot and the crash game are their own Vite apps: served under /ashfall/ and /submariner/ in a
// deployed build, on their own dev servers locally.
const ASHFALL_URL = (import.meta.env["VITE_ASHFALL_URL"] as string | undefined) ?? (import.meta.env.PROD ? "/ashfall/" : "http://localhost:5174");
const SUBMARINER_URL = (import.meta.env["VITE_SUBMARINER_URL"] as string | undefined) ?? (import.meta.env.PROD ? "/submariner/" : "http://localhost:5175");

/** Game lobby: one card per game; the whole card is the link. */
export function Landing(): JSX.Element {
  return (
    <main className="lobby">
      <h1 className="lobby-title">Choose a game</h1>
      <section className="games">
        <Link className="game-card dice" to="/dice">
          <div className="game-bg" aria-hidden="true" />
          <div className="game-info">
            <span className="game-kicker">Roll under</span>
            <h2>Dice</h2>
            <p>Pick a target, roll 0.00 to 99.99, and win up to ×49.5 your wager.</p>
            <span className="play-btn">Play Dice</span>
          </div>
        </Link>

        <a className="game-card slot" href={ASHFALL_URL}>
          <div className="game-bg" aria-hidden="true" />
          <div className="game-info">
            <span className="game-kicker">243-ways video slot</span>
            <h2>Ashfall Dynasty</h2>
            <p>5×3 reels, Dragonfire free spins, buy bonus and a 5,000× max win.</p>
            <span className="play-btn">Play Ashfall</span>
          </div>
        </a>

        <a className="game-card sub" href={SUBMARINER_URL}>
          <div className="game-bg" aria-hidden="true" />
          <div className="game-info">
            <span className="game-kicker">Crash game</span>
            <h2>Submariner</h2>
            <p>The deeper the sub dives, the higher your multiplier. Cash out before the hull implodes.</p>
            <span className="play-btn">Play Submariner</span>
          </div>
        </a>
      </section>
    </main>
  );
}
