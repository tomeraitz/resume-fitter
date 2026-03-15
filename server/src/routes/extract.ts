import { Router } from "express";
import { ZodError } from "zod";
import { APICallError } from "ai";
import { requireAuth } from "../middleware/auth.js";
import { rateLimiter } from "../middleware/rateLimit.js";
import { ModelService } from "../services/model.service.js";
import { runJobExtractor } from "../agents/job-extractor.js";
import { ExtractRequestSchema } from "../types/extract.types.js";

export const extractRouter = Router();

const modelService = new ModelService();

extractRouter.post("/", requireAuth, rateLimiter, async (req, res) => {
  const parsed = ExtractRequestSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid request", details: parsed.error.issues });
    return;
  }

  try {
    const result = await runJobExtractor(modelService, parsed.data.html);

    if (!result.isJobPosting) {
      res.status(422).json({ error: "Not a job posting", reason: result.reason.slice(0, 500) });
      return;
    }

    res.json(result.jobDetails);
  } catch (err) {
    if (err instanceof SyntaxError) {
      res.status(502).json({ error: "Model returned invalid JSON" });
      return;
    }
    if (err instanceof ZodError) {
      res.status(502).json({ error: "Model returned unexpected schema" });
      return;
    }
    if (err instanceof APICallError && err.isRetryable) {
      res.status(503).json({ error: "Service temporarily unavailable" });
      return;
    }
    console.error("[extract] unexpected error:", err);
    res.status(500).json({ error: "Extraction failed" });
  }
});
