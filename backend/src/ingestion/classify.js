// Decides which files are worth indexing and tags each one with metadata
// (language, category, layer) that we later use for filtering.

const IGNORED_DIRS = [
  "node_modules", ".git", "dist", "build", "out", ".next", "coverage", "vendor",
  "__pycache__", ".venv", "venv", "target", ".idea", ".vscode", "public/assets",
];

const IGNORED_FILES = [
  /package-lock\.json$/, /yarn\.lock$/, /pnpm-lock\.yaml$/, /\.min\.(js|css)$/,
  /\.map$/, /(^|\/)\.env$/, /(^|\/)\.env\.(?!example|sample)/, /\.(png|jpe?g|gif|svg|ico|webp|pdf|zip|gz|woff2?|ttf|eot|mp4|mp3|lock)$/i,
];

const LANGUAGES = {
  js: "javascript", jsx: "javascript", mjs: "javascript", cjs: "javascript",
  ts: "typescript", tsx: "typescript", py: "python", java: "java", go: "go",
  rb: "ruby", php: "php", cs: "csharp", rs: "rust", html: "html", css: "css",
  scss: "css", sql: "sql", sh: "shell", json: "json", yml: "yaml", yaml: "yaml",
  toml: "toml", md: "markdown", txt: "text", ini: "ini", conf: "config",
};

const SPECIAL_NAMES = ["Dockerfile", "Makefile", "Procfile"];

function extensionOf(path) {
  const name = path.split("/").pop();
  if (SPECIAL_NAMES.includes(name)) return name;
  if (/^\.env\.(example|sample)$/.test(name)) return "env";
  const dot = name.lastIndexOf(".");
  return dot > 0 ? name.slice(dot + 1).toLowerCase() : "";
}

export function shouldIndex(path, size, maxBytes) {
  if (size > maxBytes || size === 0) return false;
  const parts = path.split("/");
  if (parts.some((p) => IGNORED_DIRS.includes(p))) return false;
  if (IGNORED_FILES.some((re) => re.test(path))) return false;
  const ext = extensionOf(path);
  return ext in LANGUAGES || SPECIAL_NAMES.includes(ext) || ext === "env";
}

export function languageOf(path) {
  const ext = extensionOf(path);
  return LANGUAGES[ext] || (ext === "env" ? "env" : ext.toLowerCase() || "text");
}

// category: test | config | docs | code
export function categoryOf(path) {
  const lower = path.toLowerCase();
  const name = lower.split("/").pop();
  if (/(^|\/)(tests?|__tests__|spec|e2e)(\/|$)/.test(lower) || /\.(test|spec)\.[a-z]+$/.test(name) || /^test_.*\.py$/.test(name)) return "test";
  if (/\.(md|txt)$/.test(name)) return "docs";
  if (
    /\.(json|ya?ml|toml|ini|conf)$/.test(name) || name.startsWith(".env") ||
    /^(dockerfile|makefile|procfile)$/.test(name) || /(^|\/)(config|configs|settings)(\/|\.)/.test(lower) ||
    /(config|settings)\.[a-z]+$/.test(name)
  ) return "config";
  return "code";
}

// layer: frontend | backend | database | other (simple path heuristics)
export function layerOf(path) {
  const lower = path.toLowerCase();
  if (/(^|\/)(models?|db|database|schemas?|migrations?|prisma)(\/|\.|$)/.test(lower) || /(mongo|mongoose|sequelize|database)/.test(lower.split("/").pop())) return "database";
  if (/(^|\/)(client|frontend|web|ui|components|pages|views|public)(\/|$)/.test(lower) || /\.(jsx|tsx|vue|svelte|html|css)$/.test(lower)) return "frontend";
  if (/(^|\/)(server|backend|api|routes?|controllers?|middleware|services?)(\/|$)/.test(lower) || /(server|app|index)\.(js|ts|py)$/.test(lower)) return "backend";
  return "other";
}

// Higher = fetched first when the repo has more files than our limit
export function priorityOf(path) {
  const lower = path.toLowerCase();
  let score = 0;
  if (/(^|\/)readme\.md$/.test(lower)) score += 50;
  if (/package\.json$|requirements\.txt$|\.env\.example$/.test(lower)) score += 40;
  if (categoryOf(path) === "code") score += 30;
  if (categoryOf(path) === "config") score += 20;
  if (categoryOf(path) === "test") score += 10;
  score -= path.split("/").length; // shallower files first
  return score;
}
