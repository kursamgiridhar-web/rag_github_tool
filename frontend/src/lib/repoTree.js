// Pure helpers (no React, no Vite) so they are easy to test and later reuse with real API data.
// A file is { path, language, content }.

const LANGUAGE_BY_EXTENSION = {
  js: "javascript", jsx: "jsx", mjs: "javascript", cjs: "javascript", ts: "typescript", tsx: "tsx", json: "json", md: "markdown",
  py: "python", css: "css", html: "markup", xml: "markup", yml: "yaml", yaml: "yaml", sh: "bash", java: "java", go: "go", rs: "rust", c: "c", cpp: "cpp", cs: "csharp", rb: "ruby", php: "php",
};

export function languageFor(path) {
  const ext = path.includes(".") ? path.split(".").pop().toLowerCase() : "";
  return LANGUAGE_BY_EXTENSION[ext] || "text";
}

// Short label + colour key shown as the file-type badge.
export function fileBadge(path) {
  const name = path.split("/").pop();
  if (name.startsWith(".env")) return { label: "ENV", kind: "env" };
  const ext = name.includes(".") ? name.split(".").pop().toLowerCase() : "";
  const map = { js: ["JS", "js"], mjs: ["JS", "js"], jsx: ["JSX", "jsx"], ts: ["TS", "js"], tsx: ["TSX", "jsx"], json: ["{}", "json"], md: ["MD", "md"], py: ["PY", "js"], css: ["CSS", "md"], html: ["HTML", "md"] };
  const [label, kind] = map[ext] || ["TXT", "md"];
  return { label, kind };
}

// Turns flat file paths into nested folders. Folders first, then files, each sorted by name.
export function buildTree(files) {
  const root = { name: "", path: "", type: "dir", children: [] };
  for (const file of files) {
    const parts = file.path.split("/");
    let node = root;
    parts.forEach((part, i) => {
      const isFile = i === parts.length - 1;
      const path = parts.slice(0, i + 1).join("/");
      let child = node.children.find((c) => c.name === part);
      if (!child) {
        child = isFile ? { name: part, path, type: "file" } : { name: part, path, type: "dir", children: [] };
        node.children.push(child);
      }
      node = child;
    });
  }
  const sort = (n) => {
    if (!n.children) return;
    n.children.sort((a, b) => (a.type !== b.type ? (a.type === "dir" ? -1 : 1) : a.name.localeCompare(b.name)));
    n.children.forEach(sort);
  };
  sort(root);
  return root.children;
}

// Searches file paths and file contents. Returns one result per matching file, with up to
// `maxLines` matching lines (real line numbers) so a click can jump straight to the code.
export function searchFiles(files, query, maxLines = 3) {
  const q = query.trim().toLowerCase();
  if (!q) return [];
  const results = [];
  for (const file of files) {
    const pathMatch = file.path.toLowerCase().includes(q);
    const lineMatches = [];
    file.content.split("\n").forEach((text, i) => {
      if (lineMatches.length < maxLines && text.toLowerCase().includes(q)) {
        lineMatches.push({ line: i + 1, text: text.trim() });
      }
    });
    if (pathMatch || lineMatches.length) results.push({ path: file.path, pathMatch, lineMatches });
  }
  // Path matches first, then files with more matching lines.
  return results.sort((a, b) => Number(b.pathMatch) - Number(a.pathMatch) || b.lineMatches.length - a.lineMatches.length);
}
