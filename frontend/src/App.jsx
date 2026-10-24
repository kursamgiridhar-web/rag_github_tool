import { useState, useEffect, useRef, useCallback } from "react";
import { AnimatePresence, MotionConfig, motion } from "motion/react";
import { Zap, ZapOff } from "lucide-react";
import Background from "./components/Background.jsx";
import Welcome from "./components/Welcome.jsx";
import ConnectSequence from "./components/ConnectSequence.jsx";
import Shell from "./components/Shell.jsx";
import { checkHealth, importRepo, getRepo, listRepos } from "./api.js";
import { removeHistory } from "./lib/history.js";

// One shared transition for every screen change: spring in, quick blur-scale out.
const screenMotion = {
  initial: { opacity: 0, scale: 0.97, y: 18, filter: "blur(8px)" },
  animate: { opacity: 1, scale: 1, y: 0, filter: "blur(0px)", transition: { type: "spring", stiffness: 120, damping: 18 } },
  exit: { opacity: 0, scale: 1.04, filter: "blur(10px)", transition: { duration: 0.26 } },
};

export default function App() {
  // screen: "welcome" -> "connecting" (real indexing) -> "workspace" (ready)
  const [screen, setScreen] = useState("welcome");
  const [health, setHealth] = useState(null); // null = checking, false = offline
  const [repo, setRepo] = useState(null); // repo object straight from the backend
  const [recent, setRecent] = useState([]);
  const [failure, setFailure] = useState("");
  const [reduceMotion, setReduceMotion] = useState(
    () => window.matchMedia("(prefers-reduced-motion: reduce)").matches
  );
  const pollRef = useRef(null);

  useEffect(() => {
    document.documentElement.dataset.motion = reduceMotion ? "reduced" : "full";
  }, [reduceMotion]);

  useEffect(() => { checkHealth().then(setHealth).catch(() => setHealth(false)); }, []);
  useEffect(() => { if (health) listRepos().then(setRecent).catch(() => {}); }, [health, screen]);

  // While indexing, poll the backend every 1.5 seconds.
  useEffect(() => {
    clearInterval(pollRef.current);
    if (screen !== "connecting" || !repo?.repoId || repo.status !== "indexing") return;
    pollRef.current = setInterval(async () => {
      try {
        const next = await getRepo(repo.repoId);
        setRepo(next);
        if (next.status === "failed") { setFailure(next.error || "Indexing failed."); setScreen("welcome"); }
      } catch (err) {
        setFailure(err.message);
        setScreen("welcome");
      }
    }, 1500);
    return () => clearInterval(pollRef.current);
  }, [screen, repo?.repoId, repo?.status]);

  // ConnectSequence calls this after it has played all five steps for a ready repo.
  const finishConnect = useCallback(() => setScreen((s) => (s === "connecting" ? "workspace" : s)), []);

  // Throws on failure so Welcome can show the message inline.
  async function startImport(url, refresh = false) {
    setFailure("");
    const data = await importRepo(url, refresh);
    if (data.status === "failed") throw new Error(data.error || "Indexing failed.");
    setRepo(data);
    setScreen("connecting");
  }

  // Reopen a saved investigation: confirm the repo still exists in the backend, then go straight to the workspace.
  async function openPast(repoId) {
    try {
      const data = await getRepo(repoId);
      if (data.status !== "ready") throw new Error("That repository is not ready. Re-import it to continue.");
      setFailure("");
      setRepo(data);
      setScreen("workspace");
    } catch (err) {
      removeHistory(repoId);
      setFailure(`Could not reopen the saved investigation: ${err.message}`);
      setRepo(null);
      setScreen("welcome");
    }
  }

  const offline = health === false;
  const setupMissing = health && (!health.mongoConfigured || !health.geminiConfigured);
  const blocked = offline
    ? "The backend is not running. Start it with: cd backend && npm run dev"
    : setupMissing
      ? `Missing configuration: ${[!health.mongoConfigured && "MONGODB_URI", !health.geminiConfigured && "GEMINI_API_KEY"].filter(Boolean).join(", ")}. Check backend/.env and restart.`
      : "";

  return (
    <MotionConfig reducedMotion={reduceMotion ? "always" : "never"}>
      <Background reduceMotion={reduceMotion} boost={screen === "connecting"} />
      <button
        type="button"
        className="motion-toggle"
        aria-pressed={reduceMotion}
        onClick={() => setReduceMotion((v) => !v)}
        title="Turn decorative animation off or on"
      >
        {reduceMotion ? <ZapOff size={14} aria-hidden="true" /> : <Zap size={14} aria-hidden="true" />}
        {reduceMotion ? "Motion: reduced" : "Motion: full"}
      </button>

      <AnimatePresence mode="wait">
        <motion.div className="screen" key={screen} {...screenMotion}>
          {screen === "welcome" && (
            <Welcome onSubmit={startImport} recent={recent} blocked={blocked} initialError={failure} />
          )}
          {screen === "connecting" && repo && (
            <ConnectSequence repo={repo} reduceMotion={reduceMotion} onDone={finishConnect} />
          )}
          {screen === "workspace" && repo && <Shell key={repo.repoId} repo={repo} onOpenPast={openPast} reduceMotion={reduceMotion} onReindex={(url) => startImport(url, true).catch((e) => setFailure(e.message))} onNew={() => { setRepo(null); setScreen("welcome"); }} />}
        </motion.div>
      </AnimatePresence>
    </MotionConfig>
  );
}
