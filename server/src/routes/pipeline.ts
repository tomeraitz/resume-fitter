import { Router } from "express";
import type { PipelineRequest, PipelineResponse } from "../types/pipeline.types.js";

export const pipelineRouter = Router();

pipelineRouter.post("/", async (req, res) => {
  // TODO: auth middleware
  // TODO: validate request body with Zod
  // TODO: call orchestrator.runPipeline(body)
  // TODO: return PipelineResponse
  res.status(501).json({ error: "Not implemented" });
});
