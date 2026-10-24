// Checks that text looks like a public GitHub repository URL.
// Returns { ok: true, owner, repo } or { ok: false, error }.
const OWNER = /^[A-Za-z0-9](?:[A-Za-z0-9-]{0,38})$/;
const REPO = /^[A-Za-z0-9._-]{1,100}$/;

export function validateRepoUrl(input) {
  const text = (input || "").trim();
  if (!text) return { ok: false, error: "Paste a GitHub repository URL to begin." };

  let url;
  try {
    url = new URL(/^https?:\/\//i.test(text) ? text : `https://${text}`);
  } catch {
    return { ok: false, error: "That doesn't look like a URL." };
  }
  if (!["github.com", "www.github.com"].includes(url.hostname.toLowerCase())) {
    return { ok: false, error: "Only github.com repositories are supported." };
  }
  const [owner, rawRepo] = url.pathname.split("/").filter(Boolean);
  const repo = rawRepo ? rawRepo.replace(/\.git$/i, "") : "";
  if (!owner || !repo) {
    return { ok: false, error: "Use the form https://github.com/owner/repository." };
  }
  if (!OWNER.test(owner) || !REPO.test(repo) || repo === "." || repo === "..") {
    return { ok: false, error: "The owner or repository name has invalid characters." };
  }
  return { ok: true, owner, repo };
}
