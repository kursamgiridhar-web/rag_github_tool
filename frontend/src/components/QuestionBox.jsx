import { useState } from "react";

const EXAMPLES = [
  { label: "Trace a feature", text: "Trace how a user request travels from the frontend through the backend to the database." },
  { label: "Investigate a bug", text: "Why might the database connection or authentication fail? Check the configuration, implementation and tests." },
  { label: "Missing evidence", text: "Does this repository integrate with Stripe payments or Kubernetes deployment?" },
];

const SCOPES = [
  ["all", "All files"],
  ["code", "Code only"],
  ["config", "Config only"],
  ["test", "Tests only"],
  ["docs", "Docs only"],
];

export default function QuestionBox({ onAsk, loading, disabled }) {
  const [question, setQuestion] = useState("");
  const [scope, setScope] = useState("all");
  const canAsk = !disabled && !loading && question.trim().length > 2;

  function submit(e) {
    e.preventDefault();
    if (canAsk) onAsk(question.trim(), scope);
  }

  return (
    <section className={`card ${disabled ? "dim" : ""}`}>
      <h2><span className="step">2</span> Ask an investigation question</h2>
      <form onSubmit={submit}>
        <textarea
          rows={3}
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) submit(e); }}
          placeholder={disabled ? "Import a repository first..." : "e.g. How does login work from the UI to the database?"}
          disabled={disabled}
        />
        <div className="row between">
          <div className="chips">
            {EXAMPLES.map((ex) => (
              <button type="button" key={ex.label} className="chip" disabled={disabled} onClick={() => setQuestion(ex.text)}>
                {ex.label}
              </button>
            ))}
          </div>
          <div className="row">
            <select value={scope} onChange={(e) => setScope(e.target.value)} disabled={disabled} aria-label="Search scope">
              {SCOPES.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
            </select>
            <button disabled={!canAsk}>{loading ? "Investigating..." : "Ask"}</button>
          </div>
        </div>
      </form>
    </section>
  );
}
