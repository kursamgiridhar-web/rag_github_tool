// Saves past investigations in this browser (localStorage). Nothing leaves the device.
// One entry per indexed repository: { repoId, label, updatedAt, turns: [...] }.
const KEY = "investigator.history.v1";
const MAX_REPOS = 20;
const MAX_TURNS = 30;

function readAll() {
  try {
    const data = JSON.parse(localStorage.getItem(KEY) || "[]");
    return Array.isArray(data) ? data : [];
  } catch {
    return [];
  }
}

function writeAll(list) {
  try {
    localStorage.setItem(KEY, JSON.stringify(list));
  } catch {
    // Storage full or blocked: history is a convenience, so fail silently.
  }
}

export function listHistory() {
  return readAll().sort((a, b) => b.updatedAt - a.updatedAt);
}

export function loadTurns(repoId) {
  return readAll().find((h) => h.repoId === repoId)?.turns || [];
}

// Only finished turns are saved (not "loading" or failed ones).
export function saveTurns(repo, turns) {
  const done = turns.filter((t) => t.status === "done").slice(-MAX_TURNS);
  const rest = readAll().filter((h) => h.repoId !== repo.repoId);
  if (done.length === 0) return writeAll(rest);
  const entry = { repoId: repo.repoId, label: `${repo.owner}/${repo.name}`, updatedAt: Date.now(), turns: done };
  writeAll([entry, ...rest].sort((a, b) => b.updatedAt - a.updatedAt).slice(0, MAX_REPOS));
}

export function removeHistory(repoId) {
  writeAll(readAll().filter((h) => h.repoId !== repoId));
}

export function timeAgo(ts) {
  const s = Math.max(1, Math.round((Date.now() - ts) / 1000));
  if (s < 60) return "just now";
  const m = Math.round(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.round(h / 24)}d ago`;
}
