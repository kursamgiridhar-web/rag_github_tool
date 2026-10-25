import { useCallback, useEffect, useState } from "react";
import { Plus, MessagesSquare, FolderSearch, MessageSquare, Trash2, PanelLeftClose, PanelLeftOpen, FlaskConical } from "lucide-react";
import EvalDashboard from "./EvalDashboard.jsx";
import Thread from "./Thread.jsx";
import Composer from "./Composer.jsx";
import EvidencePanel from "./EvidencePanel.jsx";
import { askQuestion } from "../api.js";
import { listHistory, loadTurns, saveTurns, removeHistory, timeAgo } from "../lib/history.js";
import { smallTalkReply } from "../lib/smallTalk.js";

// Time-based ids so restored turns never collide with new ones.
let nextId = Date.now();

export default function Shell({ repo, onNew, onReindex, onOpenPast, reduceMotion }) {
  const [turns, setTurns] = useState(() => loadTurns(repo.repoId));
  const [past, setPast] = useState(() => listHistory());
  const [activeId, setActiveId] = useState(null);
  const [activeN, setActiveN] = useState(null);
  const [draft, setDraft] = useState("");
  const [view, setView] = useState("investigation"); // "investigation" | "eval"
  const [narrowTab, setNarrowTab] = useState("thread");
  const [collapsed, setCollapsed] = useState(false);
  const busy = turns.some((t) => t.status === "loading");
  const label = `${repo.owner}/${repo.name}`;
  const activeTurn = turns.find((t) => t.id === activeId) || turns[turns.length - 1];

  async function handleAsk(question, scope) {
    const id = nextId++;
    const chat = smallTalkReply(question, label);
    if (chat) {
      setTurns((p) => [...p, { id, question, scope, status: "done", result: { local: true, answer: chat, sources: [], mode: "general", answerable: true } }]);
      setActiveId(id);
      setActiveN(null);
      return;
    }
    setTurns((p) => [...p, { id, question, scope, status: "loading" }]);
    setActiveId(id);
    setActiveN(null);
    try {
      const result = await askQuestion(repo.repoId, question, scope);
      setTurns((p) => p.map((t) => (t.id === id ? { ...t, status: "done", result } : t)));
    } catch (err) {
      setTurns((p) => p.map((t) => (t.id === id ? { ...t, status: "error", error: err.message } : t)));
    }
  }

  // Drop the failed turn and ask the same question again.
  function handleRetry(turn) {
    if (busy) return;
    setTurns((p) => p.filter((t) => t.id !== turn.id));
    handleAsk(turn.question, turn.scope);
  }

  function handleCite(turnId, n) {
    setActiveId(turnId);
    setActiveN(n);
    setView("investigation");
    setNarrowTab("evidence");
    setTimeout(() => document.getElementById(`ev-${n}`)?.scrollIntoView({ behavior: reduceMotion ? "auto" : "smooth", block: "center" }), 60);
  }

  // Save finished turns whenever the thread changes, then refresh the sidebar list.
  useEffect(() => {
    if (turns.some((t) => t.status === "loading")) return;
    saveTurns(repo, turns);
    setPast(listHistory());
  }, [turns, repo]);

  function handleDelete(repoId) {
    removeHistory(repoId);
    if (repoId === repo.repoId) { setTurns([]); setActiveId(null); setActiveN(null); }
    setPast(listHistory());
  }

  // One list: the current repo first (live questions), then other saved repos (saved questions).
  const groups = [
    { repoId: repo.repoId, label, current: true, turns, updatedAt: Date.now() },
    ...past.filter((h) => h.repoId !== repo.repoId).map((h) => ({ ...h, current: false })),
  ];
  // Clicking a chat opens the whole conversation for that repo.
  function openChat(g) {
    setView("investigation");
    if (g.current) { setActiveId(null); setActiveN(null); setNarrowTab("thread"); }
    else onOpenPast(g.repoId);
  }

  const clearDraft = useCallback(() => setDraft(""), []);

  return (
    <div className={`app-shell ${collapsed ? "side-collapsed" : ""}`}>
      <button type="button" className="side-toggle" onClick={() => setCollapsed((c) => !c)}
        aria-expanded={!collapsed} aria-controls="app-sidebar"
        aria-label={collapsed ? "Show sidebar" : "Hide sidebar"} title={collapsed ? "Show sidebar" : "Hide sidebar"}>
        {collapsed ? <PanelLeftOpen size={16} aria-hidden="true" /> : <PanelLeftClose size={16} aria-hidden="true" />}
      </button>

      <aside className="sidebar" id="app-sidebar" aria-label="Navigation">
        <div className="brand"><span className="brand-mark" aria-hidden="true" />Investigator</div>
        <button type="button" className="btn primary full" onClick={onNew}><Plus size={14} aria-hidden="true" /> New investigation</button>

        <div className="side-group">
          <h2>Current repository</h2>
          <p className="repo-name">{label}</p>
          <span className="badge ok">{repo.fileCount} files · {repo.chunkCount} chunks</span>
          <button type="button" className="link" onClick={() => onReindex(repo.url)} title="Fetch the latest code and rebuild the index">Re-index repository</button>
        </div>

        <div className="side-group">
          <h2>Mode</h2>
          <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
            <button
              type="button"
              className={`hist-head ${view === "investigation" ? "current active" : ""}`}
              onClick={() => { setView("investigation"); setNarrowTab("thread"); }}
            >
              <MessagesSquare size={14} className="hist-icon" aria-hidden="true" />
              <span className="hist-name">Investigation</span>
            </button>
            <button
              type="button"
              id="sidebar-eval-btn"
              className={`hist-head ${view === "eval" ? "current active" : ""}`}
              onClick={() => setView("eval")}
            >
              <FlaskConical size={14} className="hist-icon" aria-hidden="true" style={{ color: "var(--indigo)" }} />
              <span className="hist-name">Evaluation</span>
              <span className="badge ok" style={{ marginLeft: "auto", fontSize: "0.68rem" }}>20 Qs</span>
            </button>
          </div>
        </div>

        <nav className="side-group side-history" aria-label="Chats">
          <h2>Chats</h2>
          <ul>
            {groups.map((g) => (
              <li key={g.repoId} className="hist-row">
                <button type="button" className={`hist-head ${g.current ? "current active" : ""}`}
                  aria-current={g.current ? "true" : undefined} onClick={() => openChat(g)}
                  title={g.current ? g.label : `${g.label} · ${timeAgo(g.updatedAt)}`}>
                  <MessageSquare size={14} className="hist-icon" aria-hidden="true" />
                  <span className="hist-name">{g.label}</span>
                  <span className="hist-count" title="Questions asked">{g.turns.length}</span>
                </button>
                {g.turns.length > 0 && (
                  <button type="button" className="icon-btn hist-del" aria-label={`Delete saved chat for ${g.label}`}
                    title="Delete saved chat" onClick={() => handleDelete(g.repoId)}>
                    <Trash2 size={13} aria-hidden="true" />
                  </button>
                )}
              </li>
            ))}
          </ul>
        </nav>
      </aside>

      <div className="ws-main">
        <div className="ws-tabs" role="tablist" aria-label="View">
          <button role="tab" type="button" className={`ws-tab ${view === "investigation" && narrowTab === "thread" ? "active" : ""}`} aria-selected={view === "investigation" && narrowTab === "thread"} onClick={() => { setView("investigation"); setNarrowTab("thread"); }}>
            <MessagesSquare size={14} aria-hidden="true" /> Investigation
          </button>
          <button role="tab" type="button" className={`ws-tab ${view === "investigation" && narrowTab === "evidence" ? "active" : ""}`} aria-selected={view === "investigation" && narrowTab === "evidence"} onClick={() => { setView("investigation"); setNarrowTab("evidence"); }}>
            <FolderSearch size={14} aria-hidden="true" /> Evidence
          </button>
          <button role="tab" type="button" id="eval-tab" className={`ws-tab eval-tab ${view === "eval" ? "active" : ""}`} aria-selected={view === "eval"} onClick={() => setView("eval")}>
            <FlaskConical size={14} aria-hidden="true" /> Evaluation
          </button>
        </div>

        {view === "eval" ? (
          <div className="ws-eval-full">
            <EvalDashboard currentRepoUrl={repo.url} onBack={() => setView("investigation")} />
          </div>
        ) : (
          <>
            <div className={`ws-thread ${narrowTab !== "thread" ? "ws-panel-hidden" : ""}`}>
              <header className="ws-panel-head">
                <div><h1 className="ws-panel-title">Investigation</h1><p className="ws-panel-sub">{label}</p></div>
              </header>
              <Thread turns={turns} onCite={handleCite} onRetry={handleRetry} onPick={setDraft} reduceMotion={reduceMotion} />
              <Composer onSubmit={handleAsk} busy={busy} repoLabel={label} draft={draft} onDraftUsed={clearDraft} />
            </div>

            <div className={`ws-explorer ${narrowTab !== "evidence" ? "ws-panel-hidden" : ""}`}>
              <header className="ws-panel-head">
                <div><h1 className="ws-panel-title">Evidence</h1><p className="ws-panel-sub">Click a citation number to jump to its source</p></div>
              </header>
              <div className="evidence-scroll">
                <EvidencePanel turn={activeTurn} activeN={activeN} onSelect={setActiveN} reduceMotion={reduceMotion} />
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

