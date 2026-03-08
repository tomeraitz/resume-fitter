import { Router } from "express";
import { z, ZodError } from "zod";
import { requireAuth } from "../middleware/auth.js";
import { rateLimiter } from "../middleware/rateLimit.js";
import { runPipeline } from "../agents/orchestrator.js";
import type { AgentResult } from "../types/pipeline.types.js";

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

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');

  let clientDisconnected = false;
  res.on('close', () => { clientDisconnected = true; });

  const onStepComplete = (step: AgentResult): void => {
    if (clientDisconnected) return;
    res.write(`event: step\ndata: ${JSON.stringify(step)}\n\n`);
  };

  try {
    const result = await runPipeline(parsed.data, onStepComplete);
    if (!clientDisconnected) {
      res.write(`event: done\ndata: ${JSON.stringify({ finalCv: result.finalCv })}\n\n`);
    }
  } catch (err) {
    if (!clientDisconnected) {
      let message = "Pipeline failed";
      if (err instanceof SyntaxError) message = "Model returned invalid JSON";
      else if (err instanceof ZodError) message = "Model returned unexpected schema";
      res.write(`event: error\ndata: ${JSON.stringify({ error: message })}\n\n`);
    }
  } finally {
    res.end();
  }
});
