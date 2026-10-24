// Retrieval evaluation: checks that the expected source files appear in the retrieved chunks.
// Usage (repo must already be imported in the app):  npm run eval
import { readFileSync } from "node:fs";
import { reposCollection } from "../src/db/mongo.js";
import { retrieve } from "../src/retrieval/search.js";

const { repoUrl, questions } = JSON.parse(readFileSync(new URL("./questions.json", import.meta.url), "utf8"));
const repos = await reposCollection();
const repo = await repos.findOne({ url: repoUrl, status: "ready" });
if (!repo) {
  console.error(`Import ${repoUrl} in the app first.`);
  process.exit(1);
}

let hits = 0;
let recallSum = 0;
for (const { question, expectedFiles } of questions) {
  const { chunks } = await retrieve(String(repo._id), question);
  const files = new Set(chunks.map((c) => c.filePath));
  const found = expectedFiles.filter((f) => files.has(f));
  const hit = found.length > 0;
  hits += hit ? 1 : 0;
  recallSum += found.length / expectedFiles.length;
  console.log(`${hit ? "HIT " : "MISS"} ${found.length}/${expectedFiles.length}  ${question}`);
  if (!hit) console.log(`       expected: ${expectedFiles.join(", ")}\n       got:      ${[...files].join(", ")}`);
}
console.log(`\nHit rate: ${hits}/${questions.length}   Mean recall: ${(recallSum / questions.length).toFixed(2)}`);
process.exit(0);
