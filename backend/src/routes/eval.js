import { Router } from "express";
import { readFileSync } from "node:fs";
import { ObjectId } from "mongodb";
import { HttpError } from "../errors.js";
import { config } from "../config.js";
import { reposCollection, getDb } from "../db/mongo.js";
import { retrieve } from "../retrieval/search.js";
import { generateAnswer } from "../llm/gemini.js";

const router = Router();
const wrap = (fn) => (req, res, next) => fn(req, res).catch(next);

// Load question bank from eval/questions.json (adjacent to src/)
const QUESTIONS_PATH = new URL("../../eval/questions.json", import.meta.url);

function loadQuestions() {
  try {
    return JSON.parse(readFileSync(QUESTIONS_PATH, "utf8"));
  } catch {
    throw new HttpError(500, "Cannot read eval/questions.json");
  }
}

// ── Collections ─────────────────────────────────────────────────────────────
async function evalRunsCollection() {
  return (await getDb()).collection("eval_runs");
}

// ── Gemini judge for faithfulness + answer correctness ───────────────────────
async function judgeAnswer({ question, referenceAnswer, generatedAnswer, chunks }) {
  if (!config.geminiApiKey) return { faithfulness: null, answerCorrectness: null, judgeNote: "No API key" };

  const evidence = (chunks || [])
    .map((c, i) => `[${i + 1}] ${c.filePath}: ${c.text?.slice(0, 400)}`)
    .join("\n");

  const prompt = `You are a RAG evaluation judge. Evaluate the generated answer against the reference answer and retrieved evidence.

QUESTION: ${question}

REFERENCE ANSWER (ground truth, kept separate from generation):
${referenceAnswer}

GENERATED ANSWER:
${generatedAnswer || "(empty – no answer was generated)"}

RETRIEVED EVIDENCE CHUNKS:
${evidence || "(none retrieved)"}

Score the following on a 0.0–1.0 scale:

1. faithfulness: Are ALL claims in the generated answer supported by the retrieved evidence chunks? 
   - 1.0 = every claim is grounded in evidence, 0 = claims contradict or are absent from evidence.
   - If the generated answer admits it cannot find evidence (answerable=false), score 1.0 for faithfulness.

2. answerCorrectness: Does the generated answer convey the same key facts as the reference answer?
   - 1.0 = covers all key points, 0 = completely wrong or empty.
   - Partial matches should be 0.3–0.7.
   - If question is unanswerable/missing-feature and generated answer correctly says "not found", score 1.0.

Respond with JSON only (no markdown):
{"faithfulness": <number>, "answerCorrectness": <number>, "faithfulnessNote": "<one sentence>", "correctnessNote": "<one sentence>"}`;

  const BASE = "https://generativelanguage.googleapis.com/v1beta";
  const models = [config.geminiModel, ...config.geminiFallbackModels].filter(Boolean);

  for (const model of models) {
    try {
      const res = await fetch(`${BASE}/models/${model}:generateContent`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-goog-api-key": config.geminiApiKey },
        body: JSON.stringify({
          contents: [{ role: "user", parts: [{ text: prompt }] }],
          generationConfig: { temperature: 0, responseMimeType: "application/json" },
        }),
        signal: AbortSignal.timeout(30_000),
      });
      if (!res.ok) continue;
      const data = await res.json();
      const text = (data.candidates?.[0]?.content?.parts || []).map((p) => p.text || "").join("").trim();
      const cleaned = text.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
      const parsed = JSON.parse(cleaned);
      return {
        faithfulness: Number(parsed.faithfulness ?? 0),
        answerCorrectness: Number(parsed.answerCorrectness ?? 0),
        faithfulnessNote: parsed.faithfulnessNote || "",
        correctnessNote: parsed.correctnessNote || "",
      };
    } catch {
      // try next model
    }
  }
  return { faithfulness: null, answerCorrectness: null, judgeNote: "Judge call failed" };
}

// ── Run evaluation ───────────────────────────────────────────────────────────
router.post("/run", wrap(async (req, res) => {
  const { repoUrl } = req.body || {};
  const { repoUrl: defaultUrl, questions } = loadQuestions();
  const targetUrl = repoUrl || defaultUrl;

  const repos = await reposCollection();
  const repo = await repos.findOne({ url: targetUrl, status: "ready" });
  if (!repo) throw new HttpError(404, `Repository "${targetUrl}" is not indexed. Import it in the app first.`);

  const repoId = String(repo._id);
  const runId = new ObjectId();
  const startedAt = new Date();

  // Save a "running" stub immediately so the UI can poll
  const runs = await evalRunsCollection();
  await runs.insertOne({
    _id: runId,
    repoId,
    repoUrl: targetUrl,
    status: "running",
    startedAt,
    totalQuestions: questions.length,
    completedQuestions: 0,
    results: [],
  });

  // Stream progress asynchronously; respond 202 with runId so UI can poll
  res.status(202).json({ runId: String(runId), status: "running" });

  // Run evaluation in background
  (async () => {
    const results = [];
    let contextRecallSum = 0;
    let faithfulnessSum = 0;
    let answerCorrectnessSum = 0;
    let faithfulnessCount = 0;
    let answerCorrectnessCount = 0;

    for (let i = 0; i < questions.length; i++) {
      const q = questions[i];
      const result = {
        id: q.id,
        category: q.category,
        question: q.question,
        referenceAnswer: q.referenceAnswer,
        expectedFiles: q.expectedFiles || [],
      };

      try {
        // ── Retrieval ──────────────────────────────────────────────────────
        const { chunks, mode, topScore } = await retrieve(repoId, q.question);
        const retrievedFiles = [...new Set(chunks.map((c) => c.filePath))];
        result.retrievedFiles = retrievedFiles;
        result.topScore = topScore;
        result.mode = mode;
        result.chunks = chunks.map((c) => ({
          filePath: c.filePath,
          startLine: c.startLine,
          endLine: c.endLine,
          text: c.text?.slice(0, 500),
          score: c.vectorScore ?? null,
        }));

        // ── Context Recall ─────────────────────────────────────────────────
        if (q.expectedFiles.length === 0) {
          // For unanswerable / missing-feature questions, recall is N/A
          result.contextRecall = null;
          result.contextRecallNote = "No expected files (unanswerable or missing-feature)";
        } else {
          const found = q.expectedFiles.filter((f) => retrievedFiles.includes(f));
          result.contextRecall = found.length / q.expectedFiles.length;
          result.foundFiles = found;
          result.missingFiles = q.expectedFiles.filter((f) => !retrievedFiles.includes(f));
          contextRecallSum += result.contextRecall;
        }

        // ── Answer Generation ──────────────────────────────────────────────
        if (chunks.length > 0 && topScore >= config.minVectorScore) {
          try {
            const { answer, answerable, model } = await generateAnswer(q.question, chunks, mode);
            result.generatedAnswer = answer;
            result.answerable = answerable;
            result.model = model;
          } catch (err) {
            result.generatedAnswer = null;
            result.answerable = false;
            result.generationError = err.message;
          }
        } else {
          result.generatedAnswer = null;
          result.answerable = false;
          result.generationError = "No relevant chunks retrieved";
        }

        // ── Judge (faithfulness + correctness) ─────────────────────────────
        const judgment = await judgeAnswer({
          question: q.question,
          referenceAnswer: q.referenceAnswer,
          generatedAnswer: result.generatedAnswer,
          chunks,
        });
        result.faithfulness = judgment.faithfulness;
        result.answerCorrectness = judgment.answerCorrectness;
        result.faithfulnessNote = judgment.faithfulnessNote;
        result.correctnessNote = judgment.correctnessNote;
        if (judgment.faithfulness !== null) {
          faithfulnessSum += judgment.faithfulness;
          faithfulnessCount++;
        }
        if (judgment.answerCorrectness !== null) {
          answerCorrectnessSum += judgment.answerCorrectness;
          answerCorrectnessCount++;
        }

        result.status = "ok";
      } catch (err) {
        result.status = "error";
        result.error = err.message;
        console.error(`Eval Q${i + 1} error:`, err.message);
      }

      results.push(result);

      // Update progress in DB
      await runs.updateOne({ _id: runId }, {
        $set: { completedQuestions: i + 1, results },
      });
    }

    // ── Aggregate metrics ──────────────────────────────────────────────────
    const recallQuestions = questions.filter((q) => q.expectedFiles.length > 0);
    const meanContextRecall = recallQuestions.length
      ? contextRecallSum / recallQuestions.length
      : null;
    const meanFaithfulness = faithfulnessCount ? faithfulnessSum / faithfulnessCount : null;
    const meanAnswerCorrectness = answerCorrectnessCount ? answerCorrectnessSum / answerCorrectnessCount : null;

    const categoryCounts = {};
    for (const r of results) {
      categoryCounts[r.category] = (categoryCounts[r.category] || 0) + 1;
    }

    const passed = results.filter((r) => r.status === "ok" && (r.contextRecall ?? 1) >= 0.5).length;

    await runs.updateOne({ _id: runId }, {
      $set: {
        status: "done",
        finishedAt: new Date(),
        results,
        metrics: {
          meanContextRecall,
          meanFaithfulness,
          meanAnswerCorrectness,
          totalQuestions: questions.length,
          passed,
          failed: questions.length - passed,
          categoryCounts,
        },
      },
    });

    console.log(`Eval run ${runId} complete. Recall=${meanContextRecall?.toFixed(2)} Faithful=${meanFaithfulness?.toFixed(2)} Correct=${meanAnswerCorrectness?.toFixed(2)}`);
  })().catch((err) => {
    console.error("Eval run crashed:", err);
    evalRunsCollection().then((runs) =>
      runs.updateOne({ _id: runId }, { $set: { status: "failed", error: err.message } })
    );
  });
}));

// ── Poll a single run ────────────────────────────────────────────────────────
router.get("/runs/:runId", wrap(async (req, res) => {
  if (!ObjectId.isValid(req.params.runId)) throw new HttpError(400, "Invalid run id");
  const runs = await evalRunsCollection();
  const run = await runs.findOne({ _id: new ObjectId(req.params.runId) });
  if (!run) throw new HttpError(404, "Eval run not found");
  res.json(serializeRun(run));
}));

// ── List past runs (most recent first, max 20) ───────────────────────────────
router.get("/runs", wrap(async (req, res) => {
  const runs = await evalRunsCollection();
  const list = await runs
    .find({}, { projection: { results: 0 } }) // omit heavy results for list view
    .sort({ startedAt: -1 })
    .limit(20)
    .toArray();
  res.json(list.map(serializeRun));
}));

// ── Return the question bank so the UI can show expected answers ──────────────
router.get("/questions", wrap(async (req, res) => {
  const { repoUrl, questions } = loadQuestions();
  res.json({ repoUrl, questions });
}));

function serializeRun(run) {
  return {
    ...run,
    _id: String(run._id),
  };
}

export default router;
