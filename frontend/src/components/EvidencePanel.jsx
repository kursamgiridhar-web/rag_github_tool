import { ExternalLink, ChevronDown } from "lucide-react";
import CodeViewer from "./CodeViewer.jsx";
import { languageFor } from "../lib/repoTree.js";

// One retrieved chunk. Click to open the real code with its real line numbers.
function SourceRow({ s, open, onToggle, reduceMotion }) {
  return (
    <div id={`ev-${s.n}`} className={`src-wrap ${open ? "open" : ""} ${s.cited ? "" : "uncited"}`}>
      <div className="src-card" onClick={() => onToggle(s.n)} role="button" tabIndex={0}
        onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && (e.preventDefault(), onToggle(s.n))} aria-expanded={open}>
        <span className="src-num">{s.n}</span>
        <div className="src-main">
          <span className="src-path">{s.filePath}</span>
          <span className="src-meta">lines {s.startLine}–{s.endLine} · {s.category} · {s.layer}{s.score != null ? ` · score ${s.score.toFixed(2)}` : ""}</span>
        </div>
        <a className="src-link" href={s.url} target="_blank" rel="noreferrer noopener" onClick={(e) => e.stopPropagation()} aria-label={`Open ${s.filePath} on GitHub`}>
          <ExternalLink size={14} aria-hidden="true" />
        </a>
        <ChevronDown size={16} className="src-chevron" aria-hidden="true" />
      </div>
      {open && (
        <CodeViewer
          file={{ path: s.filePath, content: s.text, language: languageFor(s.filePath) }}
          startLine={s.startLine}
          highlight={s.cited ? { start: s.startLine, end: s.endLine } : null}
          reduceMotion={reduceMotion}
        />
      )}
    </div>
  );
}

export default function EvidencePanel({ turn, activeN, onSelect, reduceMotion }) {
  const result = turn?.status === "done" ? turn.result : null;
  const sources = result?.sources || [];
  const cited = sources.filter((s) => s.cited);
  const others = sources.filter((s) => !s.cited);
  const toggle = (n) => onSelect(activeN === n ? null : n);

  if (!result) {
    return <p className="evidence-empty">The exact code passages behind each answer appear here, with file paths and line numbers.</p>;
  }
  if (result.local) {
    return <p className="evidence-empty">That reply was conversational, so no code was needed. Ask about the repository to see evidence here.</p>;
  }
  const row = (s) => <SourceRow key={s.n} s={s} open={activeN === s.n} onToggle={toggle} reduceMotion={reduceMotion} />;
  return (
    <div className="evidence-list">
      {cited.length > 0 && <p className="evidence-group">Cited in the answer ({cited.length})</p>}
      {cited.map(row)}
      {others.length > 0 && (
        <details open={cited.length === 0}>
          <summary className="evidence-group">{result.answerable === false ? "Closest matches (not enough to answer)" : "Also retrieved, not cited"} ({others.length})</summary>
          {others.map(row)}
        </details>
      )}
    </div>
  );
}
