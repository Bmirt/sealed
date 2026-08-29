import type { JSX } from "react";
import { useState } from "react";

export interface CheckState {
  title: string;
  ok: boolean | null; // null = pending / not applicable
  summary: string;
  math: string[];
  tampered?: boolean;
}

export function Check({ c, index }: { c: CheckState; index: number }): JSX.Element {
  const [open, setOpen] = useState(false);
  const cls = c.ok === null ? "pending" : c.ok ? "ok" : "bad";
  return (
    <div className={`check ${cls}`}>
      <button className="check-row" onClick={() => setOpen(!open)}>
        <span className="check-icon">{c.ok === null ? "…" : c.ok ? "✓" : "✗"}</span>
        <span className="check-title">
          {index}. {c.title}
        </span>
        <span className="check-summary">{c.ok === false && c.tampered ? "TAMPERING DETECTED — " : ""}{c.summary}</span>
        <span className="check-more">{open ? "hide the math" : "show the math"}</span>
      </button>
      {open && (
        <pre className="check-math">
          {c.math.join("\n")}
        </pre>
      )}
    </div>
  );
}
