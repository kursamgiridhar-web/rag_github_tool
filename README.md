# Repo Investigator (Cross-File Repository Investigator)

A RAG application for hackathon **Track 2: RAG Engine**. Paste a public GitHub repository URL, ask a question about its code, and get an answer grounded in code retrieved from **multiple files**, with numbered citations that open the exact lines. If the repository has no evidence, the app says so instead of guessing.

## How it works (RAG pipeline)
1. **Import:** the backend reads the repo over the GitHub API (it never clones, installs or runs anything).
2. **Chunk:** source, config, test and doc files are split into ~40-line overlapping chunks that keep `filePath`, `startLine`, `endLine`, plus metadata (`language`, `category`: code/config/test/docs, `layer`: frontend/backend/database).
3. **Embed:** Gemini embeddings (`gemini-embedding-001`, 768 dims) are stored with the chunks in MongoDB Atlas.
4. **Retrieve (hybrid):** MongoDB `$vectorSearch` (semantic) + Atlas Search `$search` (exact identifiers like `MONGO_URI`) merged with Reciprocal Rank Fusion, with metadata filters. Trace questions also pull the best frontend/backend/database chunks; bug questions also pull config and test chunks. At most 3 chunks per file keeps the evidence spread across files.
5. **Answer:** Gemini sees only the numbered evidence and must cite `[n]`. Citations that do not map to retrieved chunks are removed. If evidence is missing the answer is flagged **"Not found in repository"**.

Security: repo text is treated as untrusted data (delimited evidence blocks plus a system rule to ignore instructions inside it), never executed, `.env` files are never indexed.

## Technologies
React (Vite) + CSS · Node.js + Express · GitHub REST API · MongoDB Atlas Vector Search + Atlas Search · Gemini API (embeddings + answers)

## Setup
Requires Node.js 22+ (tested on 24).

1. **Atlas:** create a free M0 cluster, a database user, and allow your IP (Network Access). Copy the `mongodb+srv://...` connection string.
2. **Gemini:** create a key at https://aistudio.google.com/apikey.
3. Configure:
   ```bash
   cp .env.example backend/.env
   ```
   then fill `MONGODB_URI` and `GEMINI_API_KEY` in `backend/.env`. The Atlas vector and text search indexes are created automatically on first start (takes about a minute).

## Run
```bash
# Terminal 1: backend on http://localhost:5000
cd backend && npm install && npm run dev
```
```bash
# Terminal 2: frontend on http://localhost:5173
cd frontend && npm install && npm run dev
```
Open http://localhost:5173. Importing a repo of ~70 files takes 1-3 minutes on the Gemini free tier (rate limits); a progress bar shows each stage. Already indexed repos reload instantly.

## Retrieval evaluation
`backend/eval/questions.json` holds test questions with the expected source files for the demo repo. After importing `bradtraversy/proshop-v2`:
```bash
cd backend && npm run eval
```
Latest result: **9/9 hit rate, mean recall 1.00**.

## Demo script
See [docs/DEMO.md](docs/DEMO.md).

## Project structure
```
backend/src/
  server.js, config.js, errors.js
  routes/        repos (import/status), ask
  ingestion/     github.js (fetch), classify.js (filters + metadata), indexRepo.js (pipeline)
  chunking/      chunker.js
  embeddings/    gemini.js
  db/            mongo.js (connection + Atlas index creation)
  retrieval/     search.js (vector + keyword + fusion + mode extras)
  llm/           gemini.js (prompt, fallback model)
backend/eval/    questions.json, run-eval.js
frontend/src/    App.jsx, api.js, components/ (RepoImport, QuestionBox, AnswerPanel, EvidencePanel, Markdown)
docs/            IMPLEMENTATION_PLAN.md, DEMO.md
```

## API
- `GET /api/health`
- `POST /api/repos` `{repoUrl, refresh?}` starts indexing (or reuses a ready repo), `GET /api/repos/:id` status, `GET /api/repos` indexed repos
- `POST /api/ask` `{repoId, question, scope}` returns `{answer, answerable, mode, sources[], meta}`

## Progress
All five phases implemented. See [docs/IMPLEMENTATION_PLAN.md](docs/IMPLEMENTATION_PLAN.md).

## Known issues / notes
- Gemini free tier is rate limited and sometimes returns 503 "high demand": embedding retries automatically; answers fall back to `GEMINI_FALLBACK_MODELS`.
- Limits: 120 files, 80 KB per file, 500 chunks per repo (see `.env.example`). Public repos only.
- If Node cannot resolve Atlas DNS (`querySrv ECONNREFUSED`) the backend retries with public DNS automatically.
- Model names change over time. If Gemini reports a model as unavailable, set `GEMINI_MODEL` in `backend/.env` (list models with the `models` API).
- No test suite for the app itself besides the retrieval eval.

## Notes for another AI assistant
Read `docs/IMPLEMENTATION_PLAN.md` first. Keep the stack as is, keep citations derived from retrieved chunks only, and never commit `backend/.env`.
