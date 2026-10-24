// All backend calls live here. Vite proxies /api to the Express server (port 5000).
// Every function throws an Error with a readable message, so the UI can just show err.message.
async function request(path, options) {
  let res;
  try {
    res = await fetch(`/api${path}`, options);
  } catch {
    throw new Error("Cannot reach the backend. Is it running on port 5000?");
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `Request failed (${res.status})`);
  return data;
}

const post = (path, body) =>
  request(path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

export const checkHealth = () => request("/health");
export const importRepo = (repoUrl, refresh = false) => post("/repos", { repoUrl, refresh });
export const getRepo = (repoId) => request(`/repos/${repoId}`);
export const listRepos = () => request("/repos");
export const askQuestion = (repoId, question, scope) => post("/ask", { repoId, question, scope });
