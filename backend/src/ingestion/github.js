import { config } from "../config.js";
import { HttpError } from "../errors.js";
import { shouldIndex, priorityOf } from "./classify.js";

const API = "https://api.github.com";

export function parseRepoUrl(input) {
  const match = String(input || "")
    .trim()
    .match(/^(?:https?:\/\/)?(?:www\.)?github\.com\/([A-Za-z0-9_.-]+)\/([A-Za-z0-9_.-]+?)(?:\.git)?(?:\/.*)?$/i);
  if (!match) throw new HttpError(400, "Please enter a valid GitHub URL like https://github.com/owner/repo");
  return { owner: match[1], repo: match[2] };
}

async function githubGet(path) {
  const headers = { Accept: "application/vnd.github+json", "User-Agent": "repo-investigator" };
  if (config.githubToken) headers.Authorization = `Bearer ${config.githubToken}`;
  let res;
  try {
    res = await fetch(`${API}${path}`, { headers });
  } catch {
    throw new HttpError(502, "Could not reach GitHub. Check your internet connection.");
  }
  if (res.status === 404) throw new HttpError(404, "Repository not found. It must be public.");
  if (res.status === 403 || res.status === 429) {
    throw new HttpError(429, "GitHub rate limit reached. Add GITHUB_TOKEN to backend/.env or try again later.");
  }
  if (!res.ok) throw new HttpError(502, `GitHub returned an error (${res.status}).`);
  return res.json();
}

async function mapWithConcurrency(items, limit, fn) {
  const results = new Array(items.length);
  let next = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) {
      const i = next++;
      results[i] = await fn(items[i]);
    }
  });
  await Promise.all(workers);
  return results;
}

// Reads files over HTTPS only. Nothing from the repo is ever executed.
export async function fetchRepoFiles({ owner, repo }, onProgress = () => {}) {
  const info = await githubGet(`/repos/${owner}/${repo}`);
  const branch = info.default_branch;
  const tree = await githubGet(`/repos/${owner}/${repo}/git/trees/${encodeURIComponent(branch)}?recursive=1`);

  const candidates = tree.tree
    .filter((n) => n.type === "blob" && shouldIndex(n.path, n.size ?? 0, config.maxFileBytes))
    .sort((a, b) => priorityOf(b.path) - priorityOf(a.path));

  if (candidates.length === 0) throw new HttpError(422, "No indexable source files found in this repository.");
  const selected = candidates.slice(0, config.maxFiles);
  let done = 0;

  const files = await mapWithConcurrency(selected, 8, async (node) => {
    const url = `https://raw.githubusercontent.com/${owner}/${repo}/${encodeURIComponent(branch)}/${node.path.split("/").map(encodeURIComponent).join("/")}`;
    try {
      const res = await fetch(url);
      if (!res.ok) return null;
      const content = await res.text();
      if (content.includes("\u0000")) return null; // binary
      const lines = content.split("\n");
      if (content.length / lines.length > 400) return null; // minified / generated
      return { path: node.path, content };
    } catch {
      return null;
    } finally {
      onProgress(++done, selected.length);
    }
  });

  return {
    branch,
    description: info.description || "",
    files: files.filter(Boolean),
    skipped: candidates.length - selected.length,
  };
}
