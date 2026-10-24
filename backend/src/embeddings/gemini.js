import { config } from "../config.js";
import { HttpError, sleep } from "../errors.js";

const BASE = "https://generativelanguage.googleapis.com/v1beta";
const BATCH_SIZE = 50;

// Gemini only returns unit-length vectors at the full size; shorter ones must be normalised
function normalize(vec) {
  const norm = Math.sqrt(vec.reduce((sum, x) => sum + x * x, 0)) || 1;
  return vec.map((x) => x / norm);
}

async function callGemini(url, body) {
  if (!config.geminiApiKey) throw new HttpError(500, "GEMINI_API_KEY is not set in backend/.env");
  for (let attempt = 1; attempt <= 6; attempt++) {
    let res;
    try {
      res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-goog-api-key": config.geminiApiKey },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(60_000),
      });
    } catch (err) {
      console.error("Gemini embedding network error:", err.cause?.code || err.message);
      if (attempt === 6) throw new HttpError(502, "Could not reach the Gemini API.");
      await sleep(attempt * 2000);
      continue;
    }
    if (res.ok) return res.json();
    // Free-tier rate limit: wait and retry
    if ((res.status === 429 || res.status === 503) && attempt < 6) {
      await sleep(attempt * 8000);
      continue;
    }
    const detail = await res.json().catch(() => ({}));
    console.error("Gemini error:", res.status, detail?.error?.message);
    if (res.status === 400 || res.status === 403) {
      throw new HttpError(502, `Gemini rejected the request: ${detail?.error?.message || res.status}`);
    }
    throw new HttpError(502, `Gemini API error (${res.status}).`);
  }
}

async function embedBatch(texts, taskType) {
  const model = `models/${config.geminiEmbeddingModel}`;
  const data = await callGemini(`${BASE}/${model}:batchEmbedContents`, {
    requests: texts.map((text) => ({
      model,
      content: { parts: [{ text }] },
      taskType,
      outputDimensionality: config.embeddingDimensions,
    })),
  });
  return data.embeddings.map((e) => normalize(e.values));
}

export async function embedDocuments(texts, onProgress = () => {}) {
  const vectors = [];
  for (let i = 0; i < texts.length; i += BATCH_SIZE) {
    vectors.push(...(await embedBatch(texts.slice(i, i + BATCH_SIZE), "RETRIEVAL_DOCUMENT")));
    onProgress(vectors.length, texts.length);
  }
  return vectors;
}

export async function embedQuery(text) {
  const [vector] = await embedBatch([text], "RETRIEVAL_QUERY");
  return vector;
}
