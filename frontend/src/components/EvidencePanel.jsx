function CodeBlock({ text, startLine }) {
  const lines = text.split("\n");
  return (
    <pre className="code">
      {lines.map((line, i) => (
        <div key={i} className="codeline">
          <span className="ln">{startLine + i}</span>
          <span>{line || " "}</span>
        </div>
      ))}
    </pre>
  );
}

function SourceCard({ s, active, onSelect }) {
  return (
    <div id={`ev-${s.n}`} className={`source ${active ? "active" : ""} ${s.cited ? "" : "uncited"}`} onClick={() => onSelect(s.n)}>
      <div className="source-head">
        <span className="num">{s.n}</span>
        <a className="path" href={s.url} target="_blank" rel="noreferrer noopener" onClick={(e) => e.stopPropagation()}>
          {s.filePath}
        </a>
        <span className="muted">lines {s.startLine}-{s.endLine}</span>
        <span className="tag">{s.category}</span>
        {s.score != null && <span className="tag" title="Vector similarity score">{s.score.toFixed(2)}</span>}
      </div>
      <CodeBlock text={s.text} startLine={s.startLine} />
    </div>
  );
}

export default function EvidencePanel({ sources, activeN, onSelect, answerable }) {
  const cited = sources?.filter((s) => s.cited) || [];
  const others = sources?.filter((s) => !s.cited) || [];

  return (
    <section className="card">
      <h2>Evidence</h2>
      {!sources?.length && <p className="muted">The exact code passages used for the answer will appear here, with file paths and line numbers.</p>}

      {cited.length > 0 && <p className="muted">Cited in the answer ({cited.length})</p>}
      {cited.map((s) => <SourceCard key={s.n} s={s} active={activeN === s.n} onSelect={onSelect} />)}

      {others.length > 0 && (
        <details open={cited.length === 0}>
          <summary>{answerable === false ? "Closest matches (not sufficient to answer)" : "Also retrieved, not cited"} ({others.length})</summary>
          {others.map((s) => <SourceCard key={s.n} s={s} active={activeN === s.n} onSelect={onSelect} />)}
        </details>
      )}
    </section>
  );
}
