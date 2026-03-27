import { Router } from "express";
import { z, ZodError } from "zod";
import { requireAuth } from "../middleware/auth.js";
import { rateLimiter } from "../middleware/rateLimit.js";
import { runPipeline } from "../agents/orchestrator.js";
import type { AgentResult } from "../types/pipeline.types.js";

export const pipelineRouter = Router();

const PipelineRequestSchema = z.object({
  jobDescription: z.string().min(1).max(50_000),
  cvTemplate: z.string().min(1).max(1_000_000),
  history: z.string().max(100_000).optional(),
});

pipelineRouter.post("/", requireAuth, rateLimiter, async (req, res) => {
  const parsed = PipelineRequestSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid request", details: parsed.error.issues });
    return;
  }

  console.log(`[pipeline] === RAW HTML RECEIVED FROM CLIENT (${parsed.data.cvTemplate.length} chars) ===`);
  console.log(parsed.data.cvTemplate);
  console.log(`[pipeline] === END RAW HTML ===`);

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders();

  let clientDisconnected = false;
  res.on('close', () => {
    console.log('[pipeline:sse] client disconnected (close event fired)');
    clientDisconnected = true;
  });

  const onStepComplete = (step: AgentResult): void => {
    if (clientDisconnected) {
      console.warn(`[pipeline:sse] client disconnected, skipping step ${step.step} (${step.name})`);
      return;
    }
    const payload = JSON.stringify(step);
    console.log(`[pipeline:sse] sending step event: step=${step.step} name=${step.name} payloadLen=${payload.length}`);
    res.write(`event: step\ndata: ${payload}\n\n`);
  };

  // Keep the SSE stream active so Chrome doesn't suspend the MV3 service worker
  const keepalive = setInterval(() => {
    if (!clientDisconnected) res.write(': keepalive\n\n');
  }, 15_000);

  try {
    const result = await runPipeline(parsed.data, onStepComplete);
    console.log(`[pipeline:sse] runPipeline returned. clientDisconnected=${clientDisconnected} finalCv type=${typeof result.finalCv} len=${result.finalCv?.length ?? 'N/A'}`);
    if (!clientDisconnected) {
      const donePayload = JSON.stringify({ finalCv: result.finalCv });
      console.log(`[pipeline:sse] sending done event: finalCvLen=${result.finalCv?.length ?? 0} payloadLen=${donePayload.length}`);
      const writeOk = res.write(`event: done\ndata: ${donePayload}\n\n`);
      console.log(`[pipeline:sse] done event res.write returned: ${writeOk}`);
    } else {
      console.warn("[pipeline:sse] client disconnected before done event could be sent");
    }
  } catch (err) {
    console.error("[pipeline:sse] pipeline error caught:", err);
    if (!clientDisconnected) {
      let message = "Pipeline failed";
      if (err instanceof SyntaxError) message = "Model returned invalid JSON";
      else if (err instanceof ZodError) message = "Model returned unexpected schema";
      console.error(`[pipeline:sse] sending error event: ${message}`);
      res.write(`event: error\ndata: ${JSON.stringify({ error: message })}\n\n`);
    } else {
      console.warn("[pipeline:sse] client disconnected, cannot send error event");
    }
  } finally {
    clearInterval(keepalive);
    console.log("[pipeline:sse] ending SSE response stream");
    res.end();
  }
});
