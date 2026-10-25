// Evaluation API calls – all go through the same /api proxy
const post = (path, body) =>
  fetch(`/api${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  }).then(async (r) => {
    const d = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(d.error || `Request failed (${r.status})`);
    return d;
  });

const get = (path) =>
  fetch(`/api${path}`).then(async (r) => {
    const d = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(d.error || `Request failed (${r.status})`);
    return d;
  });

export const startEvalRun = (repoUrl) => post("/eval/run", { repoUrl });
export const getEvalRun = (runId) => get(`/eval/runs/${runId}`);
export const listEvalRuns = () => get("/eval/runs");
export const getEvalQuestions = () => get("/eval/questions");
