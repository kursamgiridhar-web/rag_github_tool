import { useState, useEffect, useRef, useCallback } from "react";
import { startEvalRun, getEvalRun, listEvalRuns, getEvalQuestions } from "../evalApi.js";
import {
  FlaskConical, Play, RefreshCw, ChevronDown, ChevronUp,
  CheckCircle2, XCircle, AlertCircle, Clock, FileSearch,
  BookOpen, Zap, BarChart3, ArrowUpDown, ArrowLeft,
} from "lucide-react";

// ── Score utilities ─────────────────────────────────────────────────────────
function pct(v) { return v == null ? "N/A" : `${Math.round(v * 100)}%`; }
function scoreClass(v) {
  if (v == null) return "score-na";
  if (v >= 0.75) return "score-good";
  if (v >= 0.45) return "score-mid";
  return "score-bad";
}
function clamp(v, lo = 0, hi = 1) { return Math.max(lo, Math.min(hi, v)); }

// ── Mini gauge ring ─────────────────────────────────────────────────────────
function Gauge({ value, size = 72, label }) {
  const r = (size - 10) / 2;
  const circ = 2 * Math.PI * r;
  const fill = value == null ? 0 : clamp(value);
  const cls = scoreClass(value);
  const colors = { "score-good": "#3ddc97", "score-mid": "#f5b84b", "score-bad": "#ff6b6b", "score-na": "#3b4560" };
  const stroke = colors[cls] || colors["score-na"];
  return (
    <div className="gauge-wrap" style={{ width: size, height: size }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} style={{ transform: "rotate(-90deg)" }}>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--border)" strokeWidth={8} />
        <circle
          cx={size / 2} cy={size / 2} r={r} fill="none" stroke={stroke} strokeWidth={8}
          strokeDasharray={circ} strokeDashoffset={circ * (1 - fill)}
          strokeLinecap="round" style={{ transition: "stroke-dashoffset 0.7s ease" }}
        />
      </svg>
      <div className="gauge-center">
        <span className={`gauge-val ${cls}`}>{pct(value)}</span>
        <span className="gauge-label">{label}</span>
      </div>
    </div>
  );
}

// ── Category pill ────────────────────────────────────────────────────────────
const CAT_COLORS = {
  "single-file": "#7c6cff", "cross-file": "#38d6e8", "frontend-backend-db": "#3ddc97",
  "architecture": "#f5b84b", "ambiguous": "#f59e0b", "unanswerable": "#8b95a9",
  "missing-file": "#ff6b6b", "incorrect-assumption": "#c084fc", "multi-file": "#22d3ee",
  "edge-case": "#fb923c", "incomplete": "#94a3b8",
};
function CatPill({ cat }) {
  const color = CAT_COLORS[cat] || "#8b95a9";
  return (
    <span className="cat-pill" style={{ borderColor: color, color }}>
      {cat}
    </span>
  );
}

// ── Inline diff / comparison ─────────────────────────────────────────────────
function FileDiff({ expected, retrieved }) {
  const expSet = new Set(expected);
  const retSet = new Set(retrieved);
  const all = [...new Set([...expected, ...retrieved])];
  if (!all.length) return <span className="muted-sm">No files</span>;
  return (
    <div className="file-diff">
      {all.map((f) => {
        const inExp = expSet.has(f);
        const inRet = retSet.has(f);
        const cls = inExp && inRet ? "fd-hit" : inExp ? "fd-miss" : "fd-extra";
        const icon = inExp && inRet ? "✓" : inExp ? "✗" : "~";
        const tip = inExp && inRet ? "Expected and retrieved" : inExp ? "Expected but NOT retrieved" : "Retrieved (not in expected)";
        return (
          <div key={f} className={`fd-row ${cls}`} title={tip}>
            <span className="fd-icon">{icon}</span>
            <code className="fd-path">{f}</code>
          </div>
        );
      })}
    </div>
  );
}

// ── Question result row ──────────────────────────────────────────────────────
function QuestionRow({ r, index }) {
  const [open, setOpen] = useState(false);

  const statusIcon =
    r.status === "error" ? <XCircle size={14} className="icon-err" /> :
    r.contextRecall == null ? <AlertCircle size={14} className="icon-warn" /> :
    r.contextRecall >= 0.5 ? <CheckCircle2 size={14} className="icon-ok" /> :
    <XCircle size={14} className="icon-err" />;

  return (
    <div className={`q-row ${open ? "q-row-open" : ""}`}>
      <button className="q-summary" onClick={() => setOpen((o) => !o)}>
        <span className="q-num">{String(index + 1).padStart(2, "0")}</span>
        {statusIcon}
        <span className="q-text">{r.question}</span>
        <CatPill cat={r.category} />
        <span className={`q-score ${scoreClass(r.contextRecall)}`}>{pct(r.contextRecall)}</span>
        <span className={`q-score ${scoreClass(r.faithfulness)}`}>{pct(r.faithfulness)}</span>
        <span className={`q-score ${scoreClass(r.answerCorrectness)}`}>{pct(r.answerCorrectness)}</span>
        {open ? <ChevronUp size={14} className="q-chevron" /> : <ChevronDown size={14} className="q-chevron" />}
      </button>

      {open && (
        <div className="q-detail">
          {r.status === "error" && (
            <div className="q-error-box">
              <XCircle size={13} /> Evaluation error: {r.error}
            </div>
          )}

          <div className="q-detail-grid">
            {/* Files */}
            <section className="q-section">
              <h4><FileSearch size={13} />File Retrieval</h4>
              <FileDiff expected={r.expectedFiles || []} retrieved={r.retrievedFiles || []} />
              {r.contextRecallNote && <p className="q-note">{r.contextRecallNote}</p>}
              {r.topScore != null && <p className="q-note muted-sm">Top vector score: {r.topScore.toFixed(3)} · Mode: {r.mode}</p>}
            </section>

            {/* Answers */}
            <section className="q-section">
              <h4><BookOpen size={13} />Answer Comparison</h4>
              <div className="answer-cmp">
                <div className="answer-block ref">
                  <span className="answer-label">Reference</span>
                  <p>{r.referenceAnswer}</p>
                </div>
                <div className="answer-block gen">
                  <span className="answer-label">Generated</span>
                  <p>{r.generatedAnswer || <em className="muted-sm">No answer generated</em>}</p>
                  {r.generationError && <p className="q-note err-note">{r.generationError}</p>}
                </div>
              </div>
              {r.faithfulnessNote && <p className="q-note"><strong>Faithfulness:</strong> {r.faithfulnessNote}</p>}
              {r.correctnessNote && <p className="q-note"><strong>Correctness:</strong> {r.correctnessNote}</p>}
            </section>

            {/* Retrieved chunks */}
            {r.chunks && r.chunks.length > 0 && (
              <section className="q-section q-section-full">
                <h4><Zap size={13} />Retrieved Chunks ({r.chunks.length})</h4>
                <div className="chunks-list">
                  {r.chunks.map((c, i) => (
                    <div key={i} className="chunk-card">
                      <div className="chunk-head">
                        <code className="chunk-path">{c.filePath}</code>
                        <span className="chunk-range">L{c.startLine}–{c.endLine}</span>
                        {c.score != null && <span className="chunk-score">{c.score.toFixed(3)}</span>}
                      </div>
                      <pre className="chunk-text">{c.text}</pre>
                    </div>
                  ))}
                </div>
              </section>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Progress bar during run ──────────────────────────────────────────────────
function ProgressBar({ completed, total }) {
  const pctDone = total ? Math.round((completed / total) * 100) : 0;
  return (
    <div className="eval-progress">
      <div className="eval-progress-track">
        <div className="eval-progress-fill" style={{ width: `${pctDone}%` }} />
      </div>
      <span className="eval-progress-label">{completed}/{total} questions evaluated…</span>
    </div>
  );
}

// ── Past run selector ────────────────────────────────────────────────────────
function RunSelector({ runs, activeId, onChange }) {
  if (!runs.length) return null;
  return (
    <div className="run-selector">
      <ArrowUpDown size={13} />
      <select
        value={activeId || ""}
        onChange={(e) => onChange(e.target.value)}
        className="run-select"
        aria-label="Select evaluation run"
      >
        {runs.map((r) => (
          <option key={r._id} value={r._id}>
            {new Date(r.startedAt).toLocaleString()} — {r.status}
            {r.metrics ? ` — Recall ${pct(r.metrics.meanContextRecall)}` : ""}
          </option>
        ))}
      </select>
    </div>
  );
}

// ── Compare panel ────────────────────────────────────────────────────────────
function ComparePanel({ runs }) {
  if (runs.length < 2) return null;
  const [aId, setAId] = useState(runs[runs.length - 1]?._id || "");
  const [bId, setBId] = useState(runs[0]?._id || "");
  const a = runs.find((r) => r._id === aId);
  const b = runs.find((r) => r._id === bId);

  const delta = (ma, mb) => {
    if (ma == null || mb == null) return null;
    return mb - ma;
  };
  const deltaEl = (d) => {
    if (d == null) return <span className="delta-na">—</span>;
    const cls = d > 0 ? "delta-up" : d < 0 ? "delta-down" : "delta-flat";
    return <span className={cls}>{d > 0 ? "+" : ""}{Math.round(d * 100)}pp</span>;
  };

  return (
    <div className="compare-panel">
      <h3 className="compare-title"><BarChart3 size={15} /> Before / After Comparison</h3>
      <div className="compare-grid">
        <div className="compare-select">
          <label>Baseline (Before)</label>
          <select value={aId} onChange={(e) => setAId(e.target.value)} className="run-select">
            {runs.map((r) => <option key={r._id} value={r._id}>{new Date(r.startedAt).toLocaleString()}</option>)}
          </select>
        </div>
        <div className="compare-select">
          <label>Latest (After)</label>
          <select value={bId} onChange={(e) => setBId(e.target.value)} className="run-select">
            {runs.map((r) => <option key={r._id} value={r._id}>{new Date(r.startedAt).toLocaleString()}</option>)}
          </select>
        </div>
      </div>
      {a && b && (
        <table className="compare-table">
          <thead>
            <tr><th>Metric</th><th>Before</th><th>After</th><th>Change</th></tr>
          </thead>
          <tbody>
            {[
              ["Context Recall", a.metrics?.meanContextRecall, b.metrics?.meanContextRecall],
              ["Faithfulness", a.metrics?.meanFaithfulness, b.metrics?.meanFaithfulness],
              ["Answer Correctness", a.metrics?.meanAnswerCorrectness, b.metrics?.meanAnswerCorrectness],
              ["Pass Rate", a.metrics ? a.metrics.passed / a.metrics.totalQuestions : null,
                b.metrics ? b.metrics.passed / b.metrics.totalQuestions : null],
            ].map(([label, av, bv]) => (
              <tr key={label}>
                <td>{label}</td>
                <td className={scoreClass(av)}>{pct(av)}</td>
                <td className={scoreClass(bv)}>{pct(bv)}</td>
                <td>{deltaEl(delta(av, bv))}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

// ── Main EvalDashboard ───────────────────────────────────────────────────────
export default function EvalDashboard({ currentRepoUrl, onBack }) {
  const [runs, setRuns] = useState([]);
  const [activeRunId, setActiveRunId] = useState(null);
  const [activeRun, setActiveRun] = useState(null);
  const [questions, setQuestions] = useState([]);
  const [repoUrl, setRepoUrl] = useState(currentRepoUrl || "");
  const [running, setRunning] = useState(false);
  const [error, setError] = useState("");
  const [sortBy, setSortBy] = useState("index"); // "index" | "recall" | "faithful" | "correct"
  const [filterCat, setFilterCat] = useState("all");
  const pollRef = useRef(null);

  // Fetch questions & past runs on mount
  useEffect(() => {
    getEvalQuestions()
      .then(({ repoUrl: url, questions: qs }) => {
        setRepoUrl(currentRepoUrl || url);
        setQuestions(qs);
      })
      .catch(() => {});
    fetchRuns();
  }, [currentRepoUrl]);

  async function fetchRuns() {
    try {
      const list = await listEvalRuns();
      setRuns(list);
      if (!activeRunId && list.length > 0) {
        setActiveRunId(list[0]._id);
        if (list[0].status === "done" || list[0].status === "failed") loadRunFull(list[0]._id);
      }
    } catch { /* ignore */ }
  }

  async function loadRunFull(id) {
    try {
      const run = await getEvalRun(id);
      setActiveRun(run);
    } catch { /* ignore */ }
  }

  // Poll while a run is in progress
  useEffect(() => {
    clearInterval(pollRef.current);
    if (!activeRunId) return;
    if (activeRun?.status === "done" || activeRun?.status === "failed") return;

    pollRef.current = setInterval(async () => {
      try {
        const run = await getEvalRun(activeRunId);
        setActiveRun(run);
        if (run.status === "done" || run.status === "failed") {
          clearInterval(pollRef.current);
          setRunning(false);
          fetchRuns();
        }
      } catch { /* ignore */ }
    }, 2000);
    return () => clearInterval(pollRef.current);
  }, [activeRunId, activeRun?.status]);

  async function handleStartRun() {
    try {
      setError("");
      setRunning(true);
      const { runId } = await startEvalRun(repoUrl);
      setActiveRunId(runId);
      setActiveRun({ _id: runId, status: "running", completedQuestions: 0, totalQuestions: questions.length, results: [] });
    } catch (err) {
      setError(err.message);
      setRunning(false);
    }
  }

  function handleSelectRun(id) {
    setActiveRunId(id);
    const cached = runs.find((r) => r._id === id);
    if (cached) setActiveRun(cached);
    loadRunFull(id);
  }

  const results = activeRun?.results || [];
  const metrics = activeRun?.metrics || {};
  const isRunning = activeRun?.status === "running";

  // Categories for filter
  const cats = ["all", ...new Set(results.map((r) => r.category))];

  // Filtered + sorted results
  const displayed = [...results]
    .filter((r) => filterCat === "all" || r.category === filterCat)
    .sort((a, b) => {
      if (sortBy === "recall") return (b.contextRecall ?? -1) - (a.contextRecall ?? -1);
      if (sortBy === "faithful") return (b.faithfulness ?? -1) - (a.faithfulness ?? -1);
      if (sortBy === "correct") return (b.answerCorrectness ?? -1) - (a.answerCorrectness ?? -1);
      return 0; // index order
    });

  return (
    <div className="eval-dashboard">
      {/* ── Header ── */}
      <header className="eval-header">
        <div className="eval-header-left">
          {onBack && (
            <button
              type="button"
              className="icon-btn eval-back-btn"
              onClick={onBack}
              title="Back to Investigation"
              aria-label="Back to Investigation"
            >
              <ArrowLeft size={16} />
            </button>
          )}
          <FlaskConical size={20} className="eval-icon" />
          <div>
            <h1 className="eval-title">RAG Evaluation Dashboard</h1>
            <p className="eval-sub">
              Automated context recall · faithfulness · answer correctness
              {repoUrl && <> · <code>{repoUrl.replace("https://github.com/", "")}</code></>}
            </p>
          </div>
        </div>
        <div className="eval-header-right">
          <RunSelector runs={runs} activeId={activeRunId} onChange={handleSelectRun} />
          <button
            className="btn primary eval-run-btn"
            onClick={handleStartRun}
            disabled={running || isRunning}
            id="eval-start-btn"
          >
            {running || isRunning
              ? <><RefreshCw size={14} className="spin" /> Evaluating…</>
              : <><Play size={14} /> Run Evaluation</>}
          </button>
        </div>
      </header>

      {error && <div className="eval-err">{error}</div>}

      {/* ── Progress ── */}
      {isRunning && (
        <ProgressBar completed={activeRun.completedQuestions || 0} total={activeRun.totalQuestions || questions.length} />
      )}

      {/* ── Score cards ── */}
      {activeRun && (
        <div className="eval-scorecards">
          <div className="eval-card score-card">
            <Gauge value={metrics.meanContextRecall} label="Context Recall" />
            <div className="card-desc">
              <strong>Context Recall</strong>
              <p>Expected source files present in retrieved chunks</p>
            </div>
          </div>
          <div className="eval-card score-card">
            <Gauge value={metrics.meanFaithfulness} label="Faithfulness" />
            <div className="card-desc">
              <strong>Faithfulness</strong>
              <p>Answer claims grounded in retrieved evidence</p>
            </div>
          </div>
          <div className="eval-card score-card">
            <Gauge value={metrics.meanAnswerCorrectness} label="Correctness" />
            <div className="card-desc">
              <strong>Answer Correctness</strong>
              <p>Generated answers match reference answers</p>
            </div>
          </div>
          <div className="eval-card stat-card">
            <div className="stat-grid">
              <div className="stat-item">
                <span className="stat-val">{metrics.totalQuestions ?? questions.length}</span>
                <span className="stat-label">Total Questions</span>
              </div>
              <div className="stat-item stat-ok">
                <span className="stat-val">{metrics.passed ?? "—"}</span>
                <span className="stat-label">Passed (≥50%)</span>
              </div>
              <div className="stat-item stat-fail">
                <span className="stat-val">{metrics.failed ?? "—"}</span>
                <span className="stat-label">Failed</span>
              </div>
              {metrics.categoryCounts && (
                <div className="stat-item">
                  <span className="stat-val">{Object.keys(metrics.categoryCounts).length}</span>
                  <span className="stat-label">Categories</span>
                </div>
              )}
            </div>
            {metrics.categoryCounts && (
              <div className="cat-breakdown">
                {Object.entries(metrics.categoryCounts).map(([cat, n]) => (
                  <span key={cat} className="cat-stat">
                    <CatPill cat={cat} /> {n}
                  </span>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── Question question bank preview (before run) ── */}
      {!activeRun && questions.length > 0 && (
        <div className="eval-preview">
          <h2 className="eval-section-title"><BookOpen size={15} /> Question Bank Preview ({questions.length} questions)</h2>
          <p className="eval-preview-sub">These questions and reference answers are kept separate from generation (no leakage). Start a run to evaluate.</p>
          <div className="preview-list">
            {questions.map((q, i) => (
              <div key={q.id} className="preview-row">
                <span className="q-num">{String(i + 1).padStart(2, "0")}</span>
                <CatPill cat={q.category} />
                <span className="preview-q">{q.question}</span>
                <span className="preview-files">{q.expectedFiles.length ? q.expectedFiles.join(", ") : "—"}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Results table ── */}
      {results.length > 0 && (
        <div className="eval-results">
          <div className="eval-results-toolbar">
            <h2 className="eval-section-title"><BarChart3 size={15} /> Question-level Results</h2>
            <div className="toolbar-controls">
              <div className="filter-group">
                <label>Category</label>
                <select value={filterCat} onChange={(e) => setFilterCat(e.target.value)} className="run-select">
                  {cats.map((c) => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>
              <div className="filter-group">
                <label>Sort by</label>
                <select value={sortBy} onChange={(e) => setSortBy(e.target.value)} className="run-select">
                  <option value="index">Question #</option>
                  <option value="recall">Context Recall ↓</option>
                  <option value="faithful">Faithfulness ↓</option>
                  <option value="correct">Correctness ↓</option>
                </select>
              </div>
            </div>
          </div>

          <div className="q-table-head">
            <span className="q-num">#</span>
            <span />
            <span>Question</span>
            <span>Category</span>
            <span className="q-col-score">Recall</span>
            <span className="q-col-score">Faithful</span>
            <span className="q-col-score">Correct</span>
            <span />
          </div>

          <div className="q-list">
            {displayed.map((r, i) => (
              <QuestionRow key={r.id || i} r={r} index={results.indexOf(r)} />
            ))}
          </div>
        </div>
      )}

      {/* ── Before / After comparison ── */}
      {runs.length >= 2 && (
        <ComparePanel runs={runs} />
      )}

      {/* ── Empty state ── */}
      {!activeRun && questions.length === 0 && (
        <div className="eval-empty">
          <FlaskConical size={40} className="eval-empty-icon" />
          <h2>No evaluation data yet</h2>
          <p>Make sure the target repository is imported, then click <strong>Run Evaluation</strong>.</p>
        </div>
      )}
    </div>
  );
}
