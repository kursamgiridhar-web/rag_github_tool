import { useEffect, useRef, useState } from "react";
import { checkHealth, importRepo, getRepo, listRepos, askQuestion } from "./api.js";
import RepoImport from "./components/RepoImport.jsx";
import QuestionBox from "./components/QuestionBox.jsx";
import AnswerPanel from "./components/AnswerPanel.jsx";
import EvidencePanel from "./components/EvidencePanel.jsx";

export default function App() {
  const [health, setHealth] = useState(null); // null = checking, false = offline
  const [repo, setRepo] = useState(null); // repo object from the backend
  const [importError, setImportError] = useState("");
  const [recent, setRecent] = useState([]);
  const [asking, setAsking] = useState(false);
  const [result, setResult] = useState(null);
  const [activeN, setActiveN] = useState(null);
  const pollRef = useRef(null);

  useEffect(() => {
    checkHealth().then(setHealth).catch(() => setHealth(false));
  }, []);

  useEffect(() => {
    if (health) listRepos().then(setRecent).catch(() => {});
  }, [health, repo?.status]);

  // While indexing, poll the backend every 2 seconds
  useEffect(() => {
    clearInterval(pollRef.current);
    if (repo?.status !== "indexing" || !repo.repoId) return; // id arrives with the import response
    pollRef.current = setInterval(async () => {
      try {
        setRepo(await getRepo(repo.repoId));
      } catch (err) {
        setImportError(err.message);
      }
    }, 2000);
    return () => clearInterval(pollRef.current);
  }, [repo?.repoId, repo?.status]);

  async function handleImport(url, refresh = false) {
    setImportError("");
    setResult(null);
    setRepo({ status: "indexing", stage: "Starting", progress: 0, url });
    try {
      setRepo(await importRepo(url, refresh));
    } catch (err) {
      setRepo(null);
      setImportError(err.message);
    }
  }

  async function handleAsk(question, scope) {
    setAsking(true);
    setActiveN(null);
    try {
      setResult(await askQuestion(repo.repoId, question, scope));
    } catch (err) {
      setResult({ error: err.message });
    } finally {
      setAsking(false);
    }
  }

  function focusEvidence(n) {
    setActiveN(n);
    document.getElementById(`ev-${n}`)?.scrollIntoView({ behavior: "smooth", block: "center" });
  }

  const ready = repo?.status === "ready";
  const offline = health === false;
  const setupMissing = health && (!health.mongoConfigured || !health.geminiConfigured);

  return (
    <div className="app">
      <header>
        <div className="brand">
          <span className="logo">&lt;/&gt;</span>
          <div>
            <h1>Repo Investigator</h1>
            <p>Ask questions about any public GitHub repo. Every answer cites the code it came from.</p>
          </div>
        </div>
        <span className={`pill ${health ? "ok" : offline ? "bad" : ""}`}>
          {health ? "backend online" : offline ? "backend offline" : "checking..."}
        </span>
      </header>

      {offline && (
        <div className="banner bad">The backend is not running. Start it with <code>cd backend &amp;&amp; npm run dev</code>.</div>
      )}
      {setupMissing && (
        <div className="banner warn">
          Missing configuration: {[!health.mongoConfigured && "MONGODB_URI", !health.geminiConfigured && "GEMINI_API_KEY"].filter(Boolean).join(", ")}.
          Copy <code>.env.example</code> to <code>backend/.env</code> and restart the backend.
        </div>
      )}

      <RepoImport repo={repo} error={importError} recent={recent} onImport={handleImport} disabled={offline || setupMissing} />
      <QuestionBox onAsk={handleAsk} loading={asking} disabled={!ready} />

      <main className="results">
        <AnswerPanel result={result} loading={asking} onCite={focusEvidence} />
        <EvidencePanel sources={result?.sources} activeN={activeN} onSelect={setActiveN} answerable={result?.answerable} />
      </main>

      <footer>Repository content is treated as untrusted data and is never executed.</footer>
    </div>
  );
}
