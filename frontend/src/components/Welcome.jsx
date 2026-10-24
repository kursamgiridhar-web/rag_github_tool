import { useState } from "react";
import FileStack3D from "./FileStack3D.jsx";
import { validateRepoUrl } from "../lib/validateRepoUrl.js";

const HEADLINE = ["Every", "answer", "has", "a", "source."];
const WORKFLOW = ["Connect a repo", "Trace across files", "Read the evidence", "Verify each claim"];

// onSubmit(url) is async and throws an Error with a readable message on failure.
export default function Welcome({ onSubmit, recent = [], blocked = "", initialError = "" }) {
  const [url, setUrl] = useState("");
  const [error, setError] = useState(initialError);
  const [busy, setBusy] = useState(false);

  async function go(value) {
    const result = validateRepoUrl(value);
    if (!result.ok) { setError(result.error); return; }
    setError("");
    setBusy(true);
    try {
      await onSubmit(`https://github.com/${result.owner}/${result.repo}`);
    } catch (err) {
      setError(err.message);
      setBusy(false);
    }
  }

  return (
    <div className="welcome">
      <section className="hero-copy">
        <p className="tagline">Follow the question. Trace the code. Verify every claim.</p>
        <h1 className="headline" aria-label={HEADLINE.join(" ")}>
          {HEADLINE.map((word, i) => (
            <span className="w" style={{ "--d": i }} key={word} aria-hidden="true">{word}&nbsp;</span>
          ))}
        </h1>
        <p className="lede">
          Explore unfamiliar codebases, trace behavior across files, and investigate bugs
          with evidence you can verify.
        </p>

        <form className="repo-form" onSubmit={(e) => { e.preventDefault(); go(url); }} noValidate>
          <label htmlFor="repo-url">Public GitHub repository</label>
          <div className={`field ${error ? "invalid" : ""}`}>
            <input
              id="repo-url"
              type="text"
              placeholder="https://github.com/owner/repository"
              value={url}
              onChange={(e) => { setUrl(e.target.value); setError(""); }}
              aria-invalid={Boolean(error)}
              aria-describedby="repo-msg"
              autoComplete="off"
              spellCheck="false"
              disabled={busy}
            />
            <button type="submit" className="btn primary" disabled={busy || Boolean(blocked)}>
              {busy ? "Connecting..." : "Investigate"}
            </button>
          </div>
          <p id="repo-msg" className="msg" role="status">
            {error && <span className="err">{error}</span>}
            {!error && blocked && <span className="warn">{blocked}</span>}
          </p>
        </form>

        {recent.length > 0 && (
          <ul className="samples" aria-label="Previously indexed repositories">
            {recent.map((r) => (
              <li key={r.repoId}>
                <button type="button" className="chip" disabled={busy || Boolean(blocked)} onClick={() => go(r.url)}>
                  {r.owner}/{r.name}
                </button>
              </li>
            ))}
          </ul>
        )}

        <ol className="workflow" aria-label="How it works">
          {WORKFLOW.map((step, i) => (
            <li key={step} style={{ "--d": i }}>{step}</li>
          ))}
        </ol>
      </section>

      <section className="hero-visual">
        <FileStack3D />
        <p className="visual-caption">One question, five layers, one thread of evidence.</p>
      </section>
    </div>
  );
}
