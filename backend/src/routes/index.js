import { Router } from "express";
import { config } from "../config.js";
import reposRoutes from "./repos.js";
import askRoutes from "./ask.js";

const router = Router();

router.get("/health", (req, res) => {
  res.json({
    status: "ok",
    mongoConfigured: Boolean(config.mongodbUri),
    geminiConfigured: Boolean(config.geminiApiKey),
  });
});

router.use("/repos", reposRoutes);
router.use("/ask", askRoutes);

export default router;
