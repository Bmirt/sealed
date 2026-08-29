import type { JSX } from "react";
import { Link, Navigate, Route, Routes, useLocation } from "react-router-dom";
import { Play } from "./pages/Play";
import { Verify } from "./pages/Verify";

export function App(): JSX.Element {
  const loc = useLocation();
  return (
    <div className="app">
      <header className="top">
        <div className="brand">
          <span className="seal">◈</span> SEALED <span className="tag">provably fair · Solana localnet</span>
        </div>
        <nav>
          <Link className={loc.pathname === "/play" ? "active" : ""} to="/play">Play</Link>
          <Link className={loc.pathname === "/verify" ? "active" : ""} to="/verify">Verify</Link>
        </nav>
      </header>
      <Routes>
        <Route path="/" element={<Navigate to="/play" replace />} />
        <Route path="/play" element={<Play />} />
        <Route path="/verify" element={<Verify />} />
      </Routes>
    </div>
  );
}
