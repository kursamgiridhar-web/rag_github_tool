import { Router } from "express";
import { ObjectId } from "mongodb";
import { HttpError } from "../errors.js";
import { parseRepoUrl } from "../ingestion/github.js";
import { indexRepo } from "../ingestion/indexRepo.js";
import { reposCollection } from "../db/mongo.js";

const router = Router();
const wrap = (fn) => (req, res, next) => fn(req, res).catch(next);

const publicRepo = (r) => ({
  repoId: String(r._id), url: r.url, owner: r.owner, name: r.name, branch: r.branch,
  status: r.status, stage: r.stage, progress: r.progress, fileCount: r.fileCount,
  chunkCount: r.chunkCount, error: r.error, updatedAt: r.updatedAt,
});

// Start importing (or reuse an already indexed repo)
router.post("/", wrap(async (req, res) => {
  const parsed = parseRepoUrl(req.body?.repoUrl);
  const url = `https://github.com/${parsed.owner}/${parsed.repo}`;
  const repos = await reposCollection();
  const existing = await repos.findOne({ url });

  if (existing && !req.body?.refresh && (existing.status === "ready" || existing.status === "indexing")) {
    return res.json(publicRepo(existing));
  }

  const now = new Date();
  let doc;
  if (existing) {
    await repos.updateOne({ _id: existing._id }, { $set: { status: "indexing", stage: "Starting", progress: 0, error: null, updatedAt: now } });
    doc = { ...existing, status: "indexing", stage: "Starting", progress: 0, error: null };
  } else {
    const { insertedId } = await repos.insertOne({
      url, owner: parsed.owner, name: parsed.repo, status: "indexing", stage: "Starting", progress: 0, createdAt: now, updatedAt: now,
    });
    doc = { _id: insertedId, url, owner: parsed.owner, name: parsed.repo, status: "indexing", stage: "Starting", progress: 0 };
  }
  indexRepo(String(doc._id), parsed); // runs in the background; the UI polls GET /:id
  res.status(202).json(publicRepo(doc));
}));

router.get("/", wrap(async (req, res) => {
  const repos = await reposCollection();
  const list = await repos.find({ status: "ready" }).sort({ updatedAt: -1 }).limit(8).toArray();
  res.json(list.map(publicRepo));
}));

router.get("/:id", wrap(async (req, res) => {
  if (!ObjectId.isValid(req.params.id)) throw new HttpError(400, "Invalid repository id.");
  const repos = await reposCollection();
  const repo = await repos.findOne({ _id: new ObjectId(req.params.id) });
  if (!repo) throw new HttpError(404, "Repository not found.");
  res.json(publicRepo(repo));
}));

export default router;
