import Markdown from "./Markdown.jsx";

const MODE_LABELS = { trace: "Feature trace", bug: "Bug investigation", general: "General question" };

export default function AnswerPanel({ result, loading, onCite }) {
  return (
    <section className="card">
      <h2>Answer</h2>
      {loading && (
        <div className="skeleton" aria-label="Loading">
          <div /><div /><div style={{ width: "60%" }} />
        </div>
      )}
      {!loading && !result && <p className="muted">Your answer will appear here, with numbered citations that link to the evidence.</p>}
      {!loading && result?.error && <p className="status error">{result.error}</p>}
      {!loading && result?.answer && (
        <>
          <div className="badges">
            <span className="badge">{MODE_LABELS[result.mode] || "Answer"}</span>
            {result.answerable === false && <span className="badge warn">Not found in repository</span>}
            {result.answerable !== false && <span className="badge ok">Grounded in {result.sources.filter((s) => s.cited).length} source(s)</span>}
          </div>
          <Markdown text={result.answer} onCite={onCite} />
        </>
      )}
    </section>
  );
}
