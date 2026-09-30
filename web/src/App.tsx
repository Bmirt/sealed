import type { JSX } from "react";
import { Link, Navigate, Route, Routes } from "react-router-dom";
import { Dice } from "./pages/Dice";
import { Landing } from "./pages/Landing";

export function App(): JSX.Element {
  return (
    <div className="app">
      <header className="top">
        <Link to="/" className="brand">
          <span className="brand-mark">◈</span> SEALED
        </Link>
      </header>
      <Routes>
        <Route path="/" element={<Landing />} />
        <Route path="/dice" element={<Dice />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </div>
  );
}
