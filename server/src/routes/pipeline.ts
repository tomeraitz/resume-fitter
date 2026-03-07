import { Router } from "express";
import { z, ZodError } from "zod";
import { requireAuth } from "../middleware/auth.js";
import { rateLimiter } from "../middleware/rateLimit.js";
import { runPipeline } from "../agents/orchestrator.js";
export const pipelineRouter = Router();

const PipelineRequestSchema = z.object({
  jobDescription: z.string().min(1).max(50_000),
  cvTemplate: z.string().min(1).max(100_000),
  history: z.string().max(100_000).optional(),
});

pipelineRouter.post("/", requireAuth, rateLimiter, async (req, res) => {
  const parsed = PipelineRequestSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid request", details: parsed.error.issues });
    return;
  }

  try {
    const result = await runPipeline(parsed.data);
    res.json(result);
  } catch (err) {
    if (err instanceof SyntaxError) {
      res.status(502).json({ error: "Model returned invalid JSON" });
      return;
    }
    if (err instanceof ZodError) {
      res.status(502).json({ error: "Model returned unexpected schema" });
      return;
    }
    res.status(500).json({ error: "Pipeline failed" });
  }
});
