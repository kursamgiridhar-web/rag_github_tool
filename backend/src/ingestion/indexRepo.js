import { ObjectId } from "mongodb";
import { config } from "../config.js";
import { sleep } from "../errors.js";
import { fetchRepoFiles } from "./github.js";
import { chunkFile, embeddingTextOf } from "../chunking/chunker.js";
import { embedDocuments } from "../embeddings/gemini.js";
import { chunksCollection, reposCollection, ensureSearchIndexes } from "../db/mongo.js";
import { vectorSearch } from "../retrieval/search.js";

async function setStatus(repoId, fields) {
  const repos = await reposCollection();
  await repos.updateOne({ _id: new ObjectId(repoId) }, { $set: { ...fields, updatedAt: new Date() } });
}

// Atlas indexes new documents a few seconds after insert; wait until the repo is really searchable
async function waitUntilSearchable(repoId, probeVector) {
  for (let i = 0; i < 40; i++) {
    const hits = await vectorSearch(repoId, probeVector, { limit: 1 });
    if (hits.length > 0) return;
    await sleep(3000);
  }
}

// Full pipeline: GitHub -> files -> chunks -> embeddings -> MongoDB. Runs in the background.
export async function indexRepo(repoId, parsed) {
  try {
    await ensureSearchIndexes();

    await setStatus(repoId, { status: "indexing", stage: "Fetching files from GitHub", progress: 0 });
    const { branch, files, skipped } = await fetchRepoFiles(parsed, (done, total) =>
      setStatus(repoId, { progress: Math.round((done / total) * 25) }).catch(() => {})
    );
    await setStatus(repoId, { branch, progress: 25, stage: "Splitting code into chunks" });

    let chunks = files.flatMap(chunkFile);
    if (chunks.length > config.maxChunks) chunks = chunks.slice(0, config.maxChunks);
    if (chunks.length === 0) throw new Error("No code could be extracted from this repository.");

    await setStatus(repoId, { fileCount: files.length, chunkCount: chunks.length, skippedFiles: skipped, stage: `Embedding ${chunks.length} chunks`, progress: 30 });
    let lastSaved = 0;
    const vectors = await embedDocuments(chunks.map(embeddingTextOf), (done, total) => {
      const pct = 30 + Math.round((done / total) * 60);
      if (pct !== lastSaved) {
        lastSaved = pct;
        setStatus(repoId, { progress: pct, stage: `Embedding chunks (${done}/${total})` }).catch(() => {});
      }
    });

    await setStatus(repoId, { stage: "Saving to MongoDB", progress: 92 });
    const collection = await chunksCollection();
    const now = new Date();
    await collection.deleteMany({ repoId });
    await collection.insertMany(
      chunks.map((chunk, i) => ({ ...chunk, repoId, embedding: vectors[i], createdAt: now }))
    );

    await setStatus(repoId, { stage: "Waiting for the search index", progress: 96 });
    await waitUntilSearchable(repoId, vectors[0]);
    await setStatus(repoId, { status: "ready", stage: "Ready", progress: 100, error: null });
  } catch (err) {
    console.error("Indexing failed:", err.message);
    await setStatus(repoId, { status: "failed", stage: "Failed", error: err.message || "Indexing failed" }).catch(() => {});
  }
}
