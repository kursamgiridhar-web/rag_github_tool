import dns from "node:dns";
import { MongoClient } from "mongodb";
import { config } from "../config.js";
import { HttpError, sleep } from "../errors.js";

export const VECTOR_INDEX = "chunks_vector";
export const TEXT_INDEX = "chunks_text";

let dbPromise;

async function connectOnce() {
  const client = new MongoClient(config.mongodbUri, { serverSelectionTimeoutMS: 10000 });
  await client.connect();
  return client;
}

async function connect() {
  // Some networks block or break the DNS SRV lookup Atlas needs, so try public DNS first,
  // then the system DNS
  const systemDns = dns.getServers();
  const attempts = [["8.8.8.8", "1.1.1.1"], systemDns];
  let lastError;
  for (const servers of attempts) {
    try {
      dns.setServers(servers);
      return (await connectOnce()).db(config.mongodbDb);
    } catch (err) {
      lastError = err;
    }
  }
  console.error("MongoDB connection failed:", lastError.message);
  throw new HttpError(502, "Could not connect to MongoDB Atlas. Check MONGODB_URI and your Atlas network access (IP allow list).");
}

// One shared connection, even when many requests ask for it at the same time
export function getDb() {
  if (!config.mongodbUri) return Promise.reject(new HttpError(500, "MONGODB_URI is not set in backend/.env"));
  if (!dbPromise) {
    dbPromise = connect().catch((err) => {
      dbPromise = undefined; // allow a later request to try again
      throw err;
    });
  }
  return dbPromise;
}

export const reposCollection = async () => (await getDb()).collection("repos");
export const chunksCollection = async () => (await getDb()).collection("chunks");

const vectorIndexDefinition = () => ({
  fields: [
    { type: "vector", path: "embedding", numDimensions: config.embeddingDimensions, similarity: "cosine" },
    { type: "filter", path: "repoId" },
    { type: "filter", path: "category" },
    { type: "filter", path: "layer" },
  ],
});

const textIndexDefinition = {
  mappings: {
    dynamic: false,
    fields: { text: { type: "string" }, filePath: { type: "string" }, repoId: { type: "token" } },
  },
};

let indexesReady;

// Creates the Atlas Vector Search + Atlas Search indexes once and waits until they can be queried
export function ensureSearchIndexes() {
  if (!indexesReady) {
    indexesReady = createIndexes().catch((err) => {
      indexesReady = undefined;
      throw err;
    });
  }
  return indexesReady;
}

async function createIndexes() {
  const chunks = await chunksCollection();
  await (await getDb()).createCollection("chunks").catch(() => {}); // already exists is fine
  const existing = await chunks.listSearchIndexes().toArray();
  const names = existing.map((i) => i.name);

  if (!names.includes(VECTOR_INDEX)) {
    await chunks.createSearchIndex({ name: VECTOR_INDEX, type: "vectorSearch", definition: vectorIndexDefinition() });
    console.log("Created vector search index");
  } else {
    const dims = existing.find((i) => i.name === VECTOR_INDEX)?.latestDefinition?.fields?.find((f) => f.type === "vector")?.numDimensions;
    if (dims && dims !== config.embeddingDimensions) {
      console.warn(`Vector index has ${dims} dimensions but EMBEDDING_DIMENSIONS=${config.embeddingDimensions}. Delete the "${VECTOR_INDEX}" index in Atlas and restart.`);
    }
  }
  if (!names.includes(TEXT_INDEX)) {
    await chunks.createSearchIndex({ name: TEXT_INDEX, definition: textIndexDefinition });
    console.log("Created text search index");
  }

  for (let i = 0; i < 60; i++) {
    const list = await chunks.listSearchIndexes().toArray();
    const ready = [VECTOR_INDEX, TEXT_INDEX].every((n) => list.find((x) => x.name === n)?.queryable);
    if (ready) return;
    await sleep(3000);
  }
  throw new HttpError(503, "Atlas search indexes are still building. Try again in a minute.");
}
