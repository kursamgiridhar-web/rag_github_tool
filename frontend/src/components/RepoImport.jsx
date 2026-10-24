import { useState } from "react";

const DEMO_REPO = "https://github.com/";

export default function RepoImport({ repo, error, recent, onImport, disabled }) {
  const [url, setUrl] = useState("");
  const indexing = repo?.status === "indexing";

  return (
    <section className="card">
      <h2><span className="step">1</span> Import a GitHub repository</h2>
      <form
        className="row"
        onSubmit={(e) => {
          e.preventDefault();
          if (url.trim()) onImport(url.trim());
        }}
      >
        <input
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          placeholder={`${DEMO_REPO}owner/repo`}
          aria-label="GitHub repository URL"
        />
        <button disabled={disabled || indexing || !url.trim()}>{indexing ? "Indexing..." : "Import"}</button>
      </form>

      {indexing && (
        <div className="progress-wrap">
          <div className="progress"><div style={{ width: `${repo.progress || 3}%` }} /></div>
          <p className="status loading">{repo.stage || "Working"}... {repo.progress || 0}%</p>
        </div>
      )}
      {repo?.status === "ready" && (
        <p className="status ready">
          Ready: <strong>{repo.owner}/{repo.name}</strong> &middot; {repo.fileCount} files &middot; {repo.chunkCount} chunks indexed.{" "}
          <button className="link" onClick={() => onImport(repo.url, true)}>Re-index</button>
        </p>
      )}
      {repo?.status === "failed" && <p className="status error">Import failed: {repo.error}</p>}
      {error && <p className="status error">{error}</p>}

      {recent.length > 0 && !indexing && (
        <div className="chips">
          <span className="muted">Indexed repos:</span>
          {recent.map((r) => (
            <button key={r.repoId} className="chip" onClick={() => { setUrl(r.url); onImport(r.url); }}>
              {r.owner}/{r.name}
            </button>
          ))}
        </div>
      )}
    </section>
  );
}
