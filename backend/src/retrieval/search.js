import { chunksCollection, VECTOR_INDEX, TEXT_INDEX } from "../db/mongo.js";
import { embedQuery } from "../embeddings/gemini.js";
import { config } from "../config.js";

const FIELDS = { embedding: 0 }; // never send big vectors around
const MAX_PER_FILE = 3;
const FINAL_LIMIT = 10;

const STOPWORDS = new Set(
  "the and for with this that from how does what where when why which who can are was were has have into about would could should there their them then than its not but you your all any use used using work works code file files repo repository app does do is it in on of to a an be by as at or if we".split(" ")
);

// Semantic search with metadata filters (repo, category, layer)
export async function vectorSearch(repoId, queryVector, { limit = 20, category, layer } = {}) {
  const filters = [{ repoId }];
  if (category) filters.push({ category: Array.isArray(category) ? { $in: category } : category });
  if (layer) filters.push({ layer });
  const chunks = await chunksCollection();
  return chunks
    .aggregate([
      {
        $vectorSearch: {
          index: VECTOR_INDEX,
          path: "embedding",
          queryVector,
          numCandidates: Math.max(limit * 10, 100),
          limit,
          filter: filters.length === 1 ? filters[0] : { $and: filters },
        },
      },
      { $addFields: { vectorScore: { $meta: "vectorSearchScore" } } },
      { $project: FIELDS },
    ])
    .toArray();
}

// Keyword search: finds exact identifiers (MONGO_URI, function names) that embeddings can blur
function keywordsOf(question) {
  const identifiers = question.match(/[A-Za-z_][A-Za-z0-9_.-]*[A-Z_.][A-Za-z0-9_.-]*/g) || []; // camelCase, snake_case, file.names
  const words = (question.toLowerCase().match(/[a-z0-9_]{3,}/g) || []).filter((w) => !STOPWORDS.has(w));
  return [...new Set([...identifiers, ...words])].slice(0, 12);
}

export async function textSearch(repoId, question, { limit = 20, category } = {}) {
  const keywords = keywordsOf(question);
  if (keywords.length === 0) return [];
  const filter = [{ equals: { path: "repoId", value: repoId } }];
  const chunks = await chunksCollection();
  const results = await chunks
    .aggregate([
      { $search: { index: TEXT_INDEX, compound: { must: [{ text: { query: keywords, path: ["text", "filePath"] } }], filter } } },
      { $limit: limit * 2 },
      { $addFields: { textScore: { $meta: "searchScore" } } },
      { $project: FIELDS },
    ])
    .toArray();
  return category ? results.filter((r) => [].concat(category).includes(r.category)).slice(0, limit) : results.slice(0, limit);
}

// Reciprocal Rank Fusion: merges the two ranked lists without needing comparable scores
function fuse(lists) {
  const merged = new Map();
  for (const list of lists) {
    list.forEach((doc, rank) => {
      const key = String(doc._id);
      const entry = merged.get(key) || { doc, rrf: 0 };
      entry.rrf += 1 / (60 + rank);
      entry.doc = { ...entry.doc, ...doc };
      merged.set(key, entry);
    });
  }
  return [...merged.values()].sort((a, b) => b.rrf - a.rrf).map((e) => e.doc);
}

const TRACE_WORDS = /\b(trace|flow|travel|travels|end[- ]to[- ]end|lifecycle|journey|path of|from (the )?(frontend|client|ui))\b/i;
const BUG_WORDS = /\b(error|fail|fails|failed|failing|failure|bug|crash|exception|cannot|can't|doesn't work|not working|broken|timeout|refused|unauthori[sz]ed|forbidden|401|403|500|connect|connection|authenticat|why (does|is|isn't|won't|might|would))\b/i;

export function detectMode(question) {
  if (TRACE_WORDS.test(question)) return "trace";
  if (BUG_WORDS.test(question)) return "bug";
  return "general";
}

// Hybrid retrieval + extra evidence for trace/bug questions + per-file diversity
export async function retrieve(repoId, question, { scope } = {}) {
  const mode = detectMode(question);
  const category = scope && scope !== "all" ? scope : undefined;
  const queryVector = await embedQuery(question);

  const [semantic, keyword] = await Promise.all([
    vectorSearch(repoId, queryVector, { limit: 20, category }),
    textSearch(repoId, question, { limit: 20, category }),
  ]);
  const ranked = fuse([semantic, keyword]);

  // Extra evidence so answers connect several files
  const extras = [];
  if (mode === "bug" && !category) {
    extras.push(...(await vectorSearch(repoId, queryVector, { limit: 3, category: "config" })));
    extras.push(...(await vectorSearch(repoId, queryVector, { limit: 3, category: "test" })));
  }
  if (mode === "trace" && !category) {
    for (const layer of ["frontend", "backend", "database"]) {
      extras.push(...(await vectorSearch(repoId, queryVector, { limit: 3, layer })));
    }
  }

  const selected = [];
  const perFile = new Map();
  const seen = new Set();
  const tryAdd = (doc) => {
    const key = String(doc._id);
    if (seen.has(key) || selected.length >= FINAL_LIMIT) return;
    if ((perFile.get(doc.filePath) || 0) >= MAX_PER_FILE) return;
    seen.add(key);
    perFile.set(doc.filePath, (perFile.get(doc.filePath) || 0) + 1);
    selected.push(doc);
  };
  ranked.slice(0, 6).forEach(tryAdd); // best matches first
  extras.forEach((doc) => { if (selected.length < FINAL_LIMIT) tryAdd(doc); });
  ranked.forEach(tryAdd);

  const topScore = Math.max(0, ...semantic.map((d) => d.vectorScore || 0));
  return { mode, chunks: selected, topScore, semanticCount: semantic.length, keywordCount: keyword.length };
}
