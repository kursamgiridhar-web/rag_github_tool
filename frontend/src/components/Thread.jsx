import { useEffect, useRef } from "react";
import { motion } from "motion/react";
import { MessageSquare, AlertTriangle } from "lucide-react";
import Markdown from "./Markdown.jsx";

const MODE_LABELS = { trace: "Feature trace", bug: "Bug investigation", general: "General question" };
const ENTER = { initial: { opacity: 0, y: 14 }, animate: { opacity: 1, y: 0 }, transition: { type: "spring", stiffness: 180, damping: 22 } };

// Generic starters that match the backend's modes. They are not tied to any repository.
const STARTERS = [
  "Trace how a request travels from the frontend to the database",
  "Why might the database connection fail?",
  "How is the project configured and what environment variables does it use?",
];

function Answer({ turn, onCite, onRetry }) {
  if (turn.status === "loading") {
    return (
      <div className="thinking-card">
        <span className="thinking-label">Searching evidence</span>
        <span className="thinking-dots" aria-hidden="true"><span /><span /><span /></span>
      </div>
    );
  }
  if (turn.status === "error") {
    return (
      <div className="answer-card answer-error">
        <AlertTriangle size={15} aria-hidden="true" /> {turn.error}
        {onRetry && <button type="button" className="retry-btn" onClick={() => onRetry(turn)}>Try again</button>}
      </div>
    );
  }
  const r = turn.result;
  if (r.local) {
    return (
      <div className="answer-card">
        <div className="answer-badges"><span className="badge">Conversation</span></div>
        <Markdown text={r.answer} onCite={() => {}} />
      </div>
    );
  }
  const citedCount = r.sources.filter((s) => s.cited).length;
  return (
    <div className="answer-card">
      <div className="answer-badges">
        <span className="badge">{MODE_LABELS[r.mode] || "Answer"}</span>
        {r.answerable === false
          ? <span className="badge warn">Not found in repository</span>
          : <span className="badge ok">Grounded in {citedCount} source{citedCount === 1 ? "" : "s"}</span>}
        {turn.scope !== "all" && <span className="badge">Scope: {turn.scope}</span>}
      </div>
      <Markdown text={r.answer} onCite={(n) => onCite(turn.id, n)} />
    </div>
  );
}

export default function Thread({ turns, onCite, onPick, onRetry, reduceMotion }) {
  const bottomRef = useRef(null);
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: reduceMotion ? "auto" : "smooth" });
  }, [turns.length, turns[turns.length - 1]?.status, reduceMotion]);

  if (turns.length === 0) {
    return (
      <div className="chat-thread thread-empty">
        <MessageSquare size={32} className="thread-empty-icon" aria-hidden="true" />
        <p className="thread-empty-title">Start investigating</p>
        <p className="thread-empty-sub">Ask anything about this repository. Every claim in the answer links to the code it came from.</p>
        <div className="starter-list">
          {STARTERS.map((s) => <button key={s} type="button" className="chip" onClick={() => onPick(s)}>{s}</button>)}
        </div>
      </div>
    );
  }
  return (
    <div className="chat-thread" role="log" aria-live="polite" aria-label="Investigation thread">
      {turns.map((turn) => (
        <motion.div key={turn.id} className="turn" {...(reduceMotion ? {} : ENTER)}>
          <div className="q-bubble"><span className="q-label">Q</span><p className="q-text">{turn.question}</p></div>
          <Answer turn={turn} onCite={onCite} onRetry={onRetry} />
        </motion.div>
      ))}
      <div ref={bottomRef} />
    </div>
  );
}
