// Evaluation API calls – supports VITE_API_URL in production, defaults to /api proxy in dev
const API_BASE = (import.meta.env.VITE_API_URL || "").replace(/\/+$/, "");
const API_PREFIX = `${API_BASE}/api`;

const post = (path, body) =>
  fetch(`${API_PREFIX}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  }).then(async (r) => {
    const d = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(d.error || `Request failed (${r.status})`);
    return d;
  });

const get = (path) =>
  fetch(`${API_PREFIX}${path}`).then(async (r) => {
    const d = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(d.error || `Request failed (${r.status})`);
    return d;
  });

export const startEvalRun = (repoUrl) => post("/eval/run", { repoUrl });
export const getEvalRun = (runId) => get(`/eval/runs/${runId}`);
export const listEvalRuns = () => get("/eval/runs");
export const getEvalQuestions = () => get("/eval/questions");
