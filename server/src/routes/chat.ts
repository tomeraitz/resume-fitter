import { Router } from "express";
import { ZodError } from "zod";
import { APICallError } from "ai";
import { requireAuth } from "../middleware/auth.js";
import { rateLimiter } from "../middleware/rateLimit.js";
import { ModelService } from "../services/model.service.js";
import { runCvChat } from "../agents/cv-chat.js";
import { runVerifier } from "../agents/verifier.js";
import { ChatRequestSchema, type ChatResponse } from "../types/chat.types.js";
import { checkChatGuard } from "../guards/chatGuard.js";

export const chatRouter = Router();

// Instantiated once at module load — same pattern as orchestrator.ts
const modelService = new ModelService();

chatRouter.post("/", requireAuth, rateLimiter, async (req, res) => {
  const parsed = ChatRequestSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid request", details: parsed.error.issues });
    return;
  }

  const { message, currentCv, history } = parsed.data;

  // ── Guardrail ──
  const guard = await checkChatGuard(message);
  if (!guard.allowed) {
    console.warn(`[ChatGuard] blocked: ${guard.reason}`);
    res.status(422).json({ error: "Message must be a CV editing request." });
    return;
  }

  try {
    // Step 1: apply user instruction
    const chatResult = await runCvChat(modelService, message, currentCv, history);

    // Step 2: verify the edited CV (same quality gate as the pipeline)
    const verifierResult = await runVerifier(modelService, chatResult.updatedCvHtml, history);

    res.json({
      updatedCvHtml: verifierResult.verifiedCv,
      flaggedClaims: [...chatResult.flaggedClaims, ...verifierResult.flaggedClaims],
    } satisfies ChatResponse);
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
    res.status(500).json({ error: "Chat agent failed" });
  }
});
