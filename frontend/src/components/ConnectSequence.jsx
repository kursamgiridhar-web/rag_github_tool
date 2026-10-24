import { useEffect, useState } from "react";

// The five visual steps map onto the real stages the backend reports (progress 0-100).
const STEPS = [
  { label: "Fetching files", detail: "Reading the repository from GitHub" },
  { label: "Splitting code", detail: "Cutting files into line-aware chunks" },
  { label: "Embedding chunks", detail: "Turning code into vectors with Gemini" },
  { label: "Saving to MongoDB", detail: "Storing chunks, vectors and metadata" },
  { label: "Building search index", detail: "Waiting for Atlas Vector Search" },
];
const STEP_MS = 380; // minimum time per step so fast backends still look smooth

// Which step is currently active for a given backend progress (5 = everything done).
function targetStep(repo) {
  if (repo.status === "ready") return STEPS.length;
  const p = repo.progress || 0;
  if (p < 25) return 0;
  if (p < 30) return 1;
  if (p < 92) return 2;
  if (p < 96) return 3;
  return 4;
}

// Driven only by the backend's real status. It never advances ahead of the real work.
export default function ConnectSequence({ repo, reduceMotion, onDone }) {
  const target = targetStep(repo);
  const [step, setStep] = useState(0);

  // Move one step at a time toward the real step.
  useEffect(() => {
    if (step >= target) return;
    const t = setTimeout(() => setStep((s) => Math.min(s + 1, target)), reduceMotion ? 0 : STEP_MS);
    return () => clearTimeout(t);
  }, [step, target, reduceMotion]);

  // Once every step has played and the repo is ready, hand over to the workspace.
  useEffect(() => {
    if (repo.status !== "ready" || step < STEPS.length) return;
    const t = setTimeout(onDone, reduceMotion ? 0 : 600);
    return () => clearTimeout(t);
  }, [repo.status, step, reduceMotion, onDone]);

  const progress = Math.min(step, STEPS.length - 1) / (STEPS.length - 1);
  const active = STEPS[Math.min(step, STEPS.length - 1)];
  const pct = repo.status === "ready" ? 100 : repo.progress || 0;

  return (
    <div className="connect" role="status" aria-live="polite">
      <p className="stage-note">{repo.stage || "Starting"} · {pct}%</p>
      <h2 className="connect-title">{repo.owner}/{repo.name}</h2>
      <div className="track" style={{ "--p": progress }}>
        <div className="track-line"><div className="track-fill" /></div>
        {STEPS.map((s, i) => (
          <div className={`node-card ${i < step ? "on" : ""} ${i === step ? "now" : ""}`} key={s.label}>
            <span className="node-dot">{i < step ? "✓" : i + 1}</span>
            <span className="node-label">{s.label}</span>
          </div>
        ))}
      </div>
      <p className="connect-detail">
        {step >= STEPS.length
          ? `Workspace ready · ${repo.fileCount ?? 0} files · ${repo.chunkCount ?? 0} chunks`
          : active.detail}
      </p>
    </div>
  );
}
