import type { JSX } from "react";
import { Link, Route, Routes, useLocation } from "react-router-dom";
import { ASHFALL_URL, CLUSTER } from "./lib/api";
import { Landing } from "./pages/Landing";
import { Play } from "./pages/Play";
import { Verify } from "./pages/Verify";

export function App(): JSX.Element {
  const loc = useLocation();
  return (
    <div className="app">
      <header className="top">
        <div className="brand">
          <Link to="/" className="brand-link"><span className="seal">◈</span> SEALED</Link> <span className="tag">provably fair · Solana {CLUSTER}</span>
        </div>
        <nav>
          <Link className={loc.pathname === "/" ? "active" : ""} to="/">Games</Link>
          <Link className={loc.pathname === "/play" ? "active" : ""} to="/play">Dice</Link>
          <a href={ASHFALL_URL}>Ashfall Dynasty</a>
          <Link className={loc.pathname === "/verify" ? "active" : ""} to="/verify">Verify</Link>
        </nav>
      </header>
      <Routes>
        <Route path="/" element={<Landing />} />
        <Route path="/play" element={<Play />} />
        <Route path="/verify" element={<Verify />} />
      </Routes>
    </div>
  );
}
