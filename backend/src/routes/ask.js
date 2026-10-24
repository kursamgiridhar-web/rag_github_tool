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

  const result = await generateAnswer(question.trim(), chunks, mode);
  let answer = String(result.answer || "").trim() || NOT_FOUND_ANSWER;

  // Only keep citations that point at evidence we really retrieved
  const cited = new Set();
  answer = answer.replace(/\[(\d+)\]/g, (match, num) => {
    const n = Number(num);
    if (n >= 1 && n <= chunks.length) {
      cited.add(n);
      return match;
    }
    return "";
  });
  const answerable = result.answerable !== false;
  const sources = chunks.map((c, i) => toSource(c, i, cited.has(i + 1)));
  res.json({ answerable, answer, mode, sources, meta });
}));

export default router;
