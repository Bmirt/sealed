import type { JSX } from "react";
import { explorerTx } from "../lib/api";

export interface RotationStep {
  key: "close" | "fake" | "reveal" | "commit";
  label: string;
  status: "pending" | "running" | "done" | "rejected" | "failed" | "skipped";
  detail?: string;
  signature?: string;
}
export interface RotationStatus {
  id: number;
  cycleId: number;
  dishonest: boolean;
  startedAt: number;
  finishedAt?: number;
  ok?: boolean;
  error?: string;
  newCycle?: number;
  steps: RotationStep[];
}

const ICON: Record<RotationStep["status"], string> = { pending: "○", running: "◌", done: "✓", rejected: "✗", failed: "!", skipped: "–" };

/** What a rotation does, step by step, live. The REJECTED fake reveal is the point of the demo. */
export function RotationTimeline({ r, verifyHref }: { r: RotationStatus; verifyHref?: string }): JSX.Element {
  const elapsed = ((r.finishedAt ?? Date.now()) - r.startedAt) / 1000;
  return (
    <div className={`rotation ${r.finishedAt ? (r.ok ? "finished" : "errored") : "live"}`}>
      <div className="rotation-head">
        <strong>{r.dishonest ? "Rotate with a fake reveal" : "Rotate cycle"} — cycle #{r.cycleId}</strong>
        <span className="muted">{r.finishedAt ? `${elapsed.toFixed(1)} s` : "in progress…"}</span>
      </div>
      <ol className="rotation-steps">
        {r.steps.map((s) => (
          <li key={s.key} className={`step ${s.status}`}>
            <span className="step-icon">{ICON[s.status]}</span>
            <span className="step-body">
              <span className="step-label">{s.label}</span>
              {s.detail && (
                <span className="step-detail">
                  {s.status === "rejected" && <span className="bad-pill">REJECTED</span>} {s.detail}
                </span>
              )}
              {s.signature && (
                <a className="step-tx" href={explorerTx(s.signature)} target="_blank" rel="noreferrer">
                  {s.status === "rejected" ? "see the failed transaction ↗" : "transaction ↗"}
                </a>
              )}
            </span>
          </li>
        ))}
      </ol>
      {r.finishedAt && r.ok && (
        <p className="rotation-foot">
          Cycle #{r.cycleId} is now public: seed revealed, every round verifiable.{" "}
          {verifyHref && (
            <a href={verifyHref}>Verify cycle #{r.cycleId} →</a>
          )}{" "}
          Cycle #{r.newCycle} is sealed and live.
        </p>
      )}
      {r.finishedAt && !r.ok && <p className="err">{r.error} — press again; rotation resumes from on-chain state.</p>}
    </div>
  );
}
