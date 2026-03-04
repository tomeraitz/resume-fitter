import { ModelService } from "../services/model.service.js";
import type {
  AgentResult,
  PipelineRequest,
  PipelineResponse,
} from "../types/pipeline.types.js";

// Instantiated once at module load so ModelService validates env vars at startup
const modelService = new ModelService();

export async function runPipeline(
  request: PipelineRequest,
): Promise<PipelineResponse> {
  // TODO: call each agent in sequence, passing only required context
  // TODO: collect AgentResult for each step
  // TODO: return PipelineResponse
  void request;
  void modelService;
  throw new Error("Not implemented");
}
