# Repo Investigator (Cross-File Repository Investigator)

A Retrieval-Augmented Generation (RAG) application for hackathon **Track 2: RAG Engine**. Enter a public GitHub repository URL, ask questions about its code, and get answers grounded in evidence retrieved from multiple files, with numbered citations that link to the exact lines. If the repository contains no supporting evidence, the app says so instead of guessing.

## How It Works (RAG Pipeline)

1. **Import:** The backend reads the repository through the GitHub API. It never clones, installs, or executes repository code.
2. **Chunk:** Source, configuration, test, and documentation files are split into overlapping chunks of approximately 40 lines. Each chunk retains its file path, line range, language, category, and architectural layer.
3. **Embed:** Gemini embeddings (`gemini-embedding-001`, 768 dimensions) are stored alongside chunks in MongoDB Atlas.
4. **Retrieve (hybrid):** MongoDB Atlas Vector Search retrieves semantically relevant chunks, while Atlas Search retrieves exact identifiers such as `MONGO_URI`. Reciprocal Rank Fusion combines the results. Metadata filters and question-specific retrieval strategies improve coverage across files.
5. **Answer:** Gemini receives numbered evidence and must cite it using `[n]`. Citations that do not map to retrieved chunks are removed. If supporting evidence is missing, the answer is marked **Not found in repository**.

**Security:** Repository text is treated as untrusted data. Evidence is delimited, instructions embedded in repository content are ignored, and repository code is never executed. `.env` files are never indexed.

## Features

- **Public GitHub repository import:** Import a repository and make its contents searchable. A five-step progress animation follows actual backend status. Already indexed repositories can be reopened.
- **Chat interface:** Ask questions and receive Markdown answers with clickable citations and indicators for answer mode, evidence count, and missing evidence.
- **Evidence panel:** View cited file paths, line ranges, categories, architectural layers, and relevance scores. Open highlighted code or navigate directly to the cited lines on GitHub.
- **Scope filter:** Filter retrieval across all files, code, configuration, tests, or documentation.
- **Saved chats:** Repository conversations appear in the sidebar. Chats are stored in browser `localStorage`, and individual conversations can be deleted.
- **Customizable interface:** Collapsible sidebar, repository re-indexing, and full/reduced motion settings, including support for the operating system's reduced-motion preference.
- **Small-talk handling:** Friendly local replies to messages such as "thanks" skip retrieval.
- **Error handling:** Clear messages for offline backends, missing configuration, and GitHub rate limits.

## Technologies

- **Frontend:** React 18, Vite, plain CSS, Three.js, React Three Fiber, Lucide React, Prism React Renderer
- **Backend:** Node.js, Express
- **Repository access:** GitHub REST API
- **Database and retrieval:** MongoDB Atlas, Atlas Vector Search, Atlas Search
- **AI:** Gemini API for embeddings and generated answers

## Setup

Requirements: Node.js 22 or later; tested on Node.js 24.

### 1. Configure MongoDB Atlas

Create an Atlas cluster and database user, configure Network Access to allow your development machine, and copy the MongoDB connection string.

### 2. Configure Gemini

Create an API key at [Google AI Studio](https://aistudio.google.com/apikey).

### 3. Configure GitHub access

A GitHub personal access token is recommended. Without authentication, the GitHub API has a much lower rate limit. For public repository access, create a classic personal access token with no scopes at GitHub Settings → Developer settings → Personal access tokens.

### 4. Configure environment variables

From the project root, run:

```bash
cp .env.example backend/.env
```

Fill in `MONGODB_URI`, `GEMINI_API_KEY`, and `GITHUB_TOKEN` in `backend/.env`.

The Atlas vector and text search indexes are created automatically on startup and may take about a minute.

**Never commit or share `backend/.env`.**

### 5. Install dependencies

Run these commands from the project root:

```bash
npm install
npm install --prefix backend
npm install --prefix frontend
```

## Run the Application

From the project root:

```bash
npm run dev
```

The command starts the backend on port 5000 and frontend on port 5173.

Open [http://localhost:5173](http://localhost:5173).

The Vite development server proxies `/api` requests to `localhost:5000`. To run the applications separately:

```bash
cd backend && npm run dev
```

```bash
cd frontend && npm run dev
```

Importing a repository containing approximately 70 files can take 1–3 minutes on the Gemini free tier, depending on rate limits.

To verify the frontend production build:

```bash
cd frontend && npm run build
```

## Retrieval Evaluation

The file `backend/eval/questions.json` contains test questions and expected source files for the demo repository.

After configuring `backend/.env` and importing `bradtraversy/proshop-v2`, run:

```bash
cd backend && npm run eval
```

Latest recorded result: **9/9 hit rate, mean recall 1.00**. This is the recorded evaluation result, not a guarantee of performance on every repository.

## Demo Script

See [`docs/DEMO.md`](docs/DEMO.md).

## Project Structure

```text
backend/
  src/
    server.js
    config.js
    errors.js
    routes/        Repository import/status and question-answering routes
    ingestion/     GitHub fetching, classification, indexing pipeline
    chunking/      Source chunking
    embeddings/    Gemini embeddings
    db/            MongoDB connection and Atlas index creation
    retrieval/     Vector search, keyword search, fusion, mode-specific retrieval
    llm/           Gemini prompts and fallback model
  eval/            Evaluation questions and runner

frontend/
  src/
    App.jsx
    api.js
    components/    Chat, evidence panel, code viewer, background and UI components
    lib/           URL validation, repository tree, saved history, small talk
    styles/        Application styling

docs/
  IMPLEMENTATION_PLAN.md
  DEMO.md
```

## API

- `GET /api/health` — Backend health check.
- `POST /api/repos` — Start indexing or reuse a ready repository; accepts `{repoUrl, refresh?}`.
- `GET /api/repos/:id` — Retrieve indexing status.
- `GET /api/repos` — List indexed repositories.
- `POST /api/ask` — Ask a question using `{repoId, question, scope}` and receive `{answer, answerable, mode, sources[], meta}`.

## Progress

All five backend phases and the animated frontend are implemented. See [`docs/IMPLEMENTATION_PLAN.md`](docs/IMPLEMENTATION_PLAN.md).

## Known Issues and Notes

- Gemini's free tier can be rate-limited and occasionally return HTTP 503 errors. Embedding retries are automatic, and answers can use configured fallback models.
- Saved chats exist only in the current browser's `localStorage`. They are not synchronized across devices, and clearing site data removes them.
- Repository ingestion is limited to 120 files, 80 KB per file, and 500 chunks per repository. Only public repositories are supported.
- The backend includes DNS retry handling for Atlas SRV lookup failures.
- If Gemini reports a model as unavailable, update `GEMINI_MODEL` in `backend/.env` to a supported model.
- The application itself does not yet have a comprehensive automated test suite beyond the retrieval evaluation.

## Notes for AI Coding Assistants

Read `docs/IMPLEMENTATION_PLAN.md` before making changes. Preserve the existing technology stack, ensure citations derive only from retrieved chunks, and never commit `backend/.env`.
