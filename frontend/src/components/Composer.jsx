import { useState, useRef, useEffect } from "react";
import { Send, Loader2 } from "lucide-react";

// These match the scopes the backend accepts for metadata filtering.
const SCOPES = [
  { id: "all", label: "All files" },
  { id: "code", label: "Code" },
  { id: "config", label: "Config" },
  { id: "test", label: "Tests" },
  { id: "docs", label: "Docs" },
];

export default function Composer({ onSubmit, busy, repoLabel, draft, onDraftUsed }) {
  const [text, setText] = useState("");
  const [scope, setScope] = useState("all");
  const taRef = useRef(null);

  // A starter prompt picked in the empty state lands in the box.
  useEffect(() => {
    if (draft) { setText(draft); onDraftUsed(); taRef.current?.focus(); }
  }, [draft, onDraftUsed]);

  useEffect(() => {
    const ta = taRef.current;
    if (!ta) return;
    ta.style.height = "auto";
    ta.style.height = Math.min(ta.scrollHeight, 144) + "px";
  }, [text]);

  function submit() {
    const q = text.trim();
    if (q.length < 3 || busy) return;
    onSubmit(q, scope);
    setText("");
  }

  return (
    <div className="composer">
      <div className="composer-modes" role="group" aria-label="Search scope">
        {SCOPES.map(({ id, label }) => (
          <button key={id} type="button" className={`mode-pill ${scope === id ? "active" : ""}`} aria-pressed={scope === id} onClick={() => setScope(id)}>
            {label}
          </button>
        ))}
      </div>
      <div className={`composer-field ${busy ? "busy" : ""}`}>
        <textarea
          ref={taRef}
          className="composer-textarea"
          placeholder={busy ? "Searching evidence…" : `Ask a question about ${repoLabel}…`}
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); submit(); } }}
          rows={1}
          disabled={busy}
          maxLength={1000}
          aria-label="Question"
        />
        <button type="button" className="btn primary composer-submit" onClick={submit} disabled={text.trim().length < 3 || busy} aria-label="Ask" title="Ask (Enter)">
          {busy ? <Loader2 size={15} className="spin" aria-hidden="true" /> : <Send size={15} aria-hidden="true" />}
        </button>
      </div>
    </div>
  );
}
