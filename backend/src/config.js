// Central place for environment variables. Values come from backend/.env
export const config = {
  port: Number(process.env.PORT) || 5000,
  mongodbUri: process.env.MONGODB_URI || "",
  mongodbDb: process.env.MONGODB_DB || "repo_investigator",
  geminiApiKey: process.env.GEMINI_API_KEY || "",
  geminiModel: process.env.GEMINI_MODEL || "gemini-3.8-flash",
  // Tried in order when the main model is out of quota or overloaded (comma separated)
  geminiFallbackModels: (process.env.GEMINI_FALLBACK_MODELS || "gemini-3.6-flash,gemini-3.5-flash,gemini-3.1-flash-lite")
    .split(",").map((m) => m.trim()).filter(Boolean),
  geminiEmbeddingModel: process.env.GEMINI_EMBEDDING_MODEL || "gemini-embedding-001",
  embeddingDimensions: Number(process.env.EMBEDDING_DIMENSIONS) || 768,
  githubToken: process.env.GITHUB_TOKEN || "",

  // Import limits (keep demos fast and API usage small)
  maxFiles: Number(process.env.MAX_FILES) || 120,
  maxFileBytes: Number(process.env.MAX_FILE_BYTES) || 80_000,
  maxChunks: Number(process.env.MAX_CHUNKS) || 500,

  // Retrieval
  minVectorScore: Number(process.env.MIN_VECTOR_SCORE) || 0,
};
