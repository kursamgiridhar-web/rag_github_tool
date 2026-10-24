import express from "express";
import cors from "cors";
import { config } from "./config.js";
import { HttpError } from "./errors.js";
import apiRoutes from "./routes/index.js";
import { reposCollection, ensureSearchIndexes } from "./db/mongo.js";

const app = express();
app.use(cors());
app.use(express.json({ limit: "1mb" }));

app.use("/api", apiRoutes);

app.use((req, res) => res.status(404).json({ error: "Not found" }));

// Only HttpError messages reach the client; anything else is hidden to avoid leaking details
app.use((err, req, res, next) => {
  if (err instanceof HttpError) return res.status(err.status).json({ error: err.message });
  console.error(err);
  res.status(500).json({ error: "Internal server error" });
});

app.listen(config.port, async () => {
  console.log(`Backend running on http://localhost:${config.port}`);
  if (!config.mongodbUri) return console.warn("MONGODB_URI is not set: copy .env.example to backend/.env");
  try {
    // Imports interrupted by a restart can never finish: mark them failed
    const repos = await reposCollection();
    await repos.updateMany({ status: "indexing" }, { $set: { status: "failed", stage: "Failed", error: "Server restarted during import. Import again." } });
    await ensureSearchIndexes();
    console.log("MongoDB connected, search indexes ready");
  } catch (err) {
    console.error("Startup check failed:", err.message);
  }
});
