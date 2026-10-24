import { Router } from "express";
import { ObjectId } from "mongodb";
import { HttpError } from "../errors.js";
import { config } from "../config.js";
import { reposCollection, ensureSearchIndexes } from "../db/mongo.js";
import { retrieve } from "../retrieval/search.js";
import { generateAnswer } from "../llm/gemini.js";

const router = Router();
const wrap = (fn) => (req, res, next) => fn(req, res).catch(next);
const SCOPES = ["all", "code", "config", "test", "docs"];

const NOT_FOUND_ANSWER =
  "I could not find evidence for this in the imported repository, so I won't guess. Try rephrasing, or check that the feature exists in this repo.";

router.post("/", wrap(async (req, res) => {
  const { repoId, question, scope = "all" } = req.body || {};
  if (!repoId || !ObjectId.isValid(repoId)) throw new HttpError(400, "Import a repository first.");
  if (typeof question !== "string" || question.trim().length < 3) throw new HttpError(400, "Please type a question.");
  if (question.length > 1000) throw new HttpError(400, "Question is too long (max 1000 characters).");
  if (!SCOPES.includes(scope)) throw new HttpError(400, "Invalid scope.");

  const repos = await reposCollection();
  const repo = await repos.findOne({ _id: new ObjectId(repoId) });
  if (!repo) throw new HttpError(404, "Repository not found. Import it again.");
  if (repo.status !== "ready") throw new HttpError(409, "This repository is not indexed yet.");

  await ensureSearchIndexes();
  const { mode, chunks, topScore, semanticCount, keywordCount } = await retrieve(repoId, question.trim(), { scope });

  const toSource = (c, i, cited) => ({
    n: i + 1, filePath: c.filePath, startLine: c.startLine, endLine: c.endLine, text: c.text,
    category: c.category, layer: c.layer, score: c.vectorScore ?? null, cited,
    url: `${repo.url}/blob/${repo.branch}/${c.filePath}#L${c.startLine}-L${c.endLine}`,
  });
  const meta = { mode, topScore, semanticCount, keywordCount, retrieved: chunks.length };

  // Nothing relevant retrieved: say so without calling the LLM
  if (chunks.length === 0 || topScore < config.minVectorScore) {
    return res.json({ answerable: false, answer: NOT_FOUND_ANSWER, mode, sources: chunks.map((c, i) => toSource(c, i, false)), meta });
  }

  // Quality gate: a real answer must cite at least one retrieved chunk. When Gemini is busy it can
  // return text with no citations that has nothing to do with the question, so retry once and
  // otherwise report a clear error instead of showing an ungrounded answer.
  let answer, answerable, cited, model;
  for (let attempt = 1; attempt <= 2; attempt++) {
    const result = await generateAnswer(question.trim(), chunks, mode);
    model = result.model;
    answer = String(result.answer || "").trim() || NOT_FOUND_ANSWER;
    cited = new Set();
    // Only keep citations that point at evidence we really retrieved
    answer = answer.replace(/\[(\d+)\]/g, (match, num) => {
      const n = Number(num);
      if (n >= 1 && n <= chunks.length) {
        cited.add(n);
        return match;
      }
      return "";
    });
    answerable = result.answerable !== false;
    if (!answerable || cited.size > 0) break;
    console.warn(`Ungrounded answer from ${model} (attempt ${attempt}), ${attempt < 2 ? "retrying" : "giving up"}`);
  }
  if (answerable && cited.size === 0) {
    throw new HttpError(503, "The AI is busy and did not return an answer backed by the repository code. Please ask again in a moment.");
  }
  meta.model = model;
  const sources = chunks.map((c, i) => toSource(c, i, cited.has(i + 1)));
  res.json({ answerable, answer, mode, sources, meta });
}));

export default router;
