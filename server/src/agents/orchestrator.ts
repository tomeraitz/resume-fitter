import { ModelService } from "../services/model.service.js";
import type {
  AgentResult,
  PipelineRequest,
  PipelineResponse,
} from "../types/pipeline.types.js";
import { runHiringManager } from "./hiring-manager.js";
import { runRewriteResume } from "./rewrite-resume.js";
import { runAtsScanner } from "./ats-scanner.js";
import { runVerifier } from "./verifier.js";

// Instantiated once at module load so ModelService validates env vars at startup
const modelService = new ModelService();

export async function runPipeline(
  request: PipelineRequest,
): Promise<PipelineResponse> {
  const steps: AgentResult[] = [];

  const hiringManagerStart = Date.now();
  const hiringManagerResult = await runHiringManager(
    modelService,
    request.jobDescription,
    request.cvTemplate,
    request.history,
  );
  steps.push({ step: 1, name: "hiring-manager", output: hiringManagerResult, durationMs: Date.now() - hiringManagerStart });

  const rewriteResumeStart = Date.now();
  const rewriteResumeResult = await runRewriteResume(
    modelService,
    hiringManagerResult.missingKeywords,
    request.cvTemplate,
    hiringManagerResult.cvLanguage,
  );
  steps.push({ step: 2, name: "rewrite-resume", output: rewriteResumeResult, durationMs: Date.now() - rewriteResumeStart });

  const atsScannerStart = Date.now();
  const atsScannerResult = await runAtsScanner(modelService, rewriteResumeResult.updatedCvHtml);
  steps.push({ step: 3, name: "ats-scanner", output: atsScannerResult, durationMs: Date.now() - atsScannerStart });

  const verifierStart = Date.now();
  const verifierResult = await runVerifier(modelService, rewriteResumeResult.updatedCvHtml, request.history);
  steps.push({ step: 4, name: "verifier", output: verifierResult, durationMs: Date.now() - verifierStart });

  return { steps, finalCv: verifierResult.verifiedCv };
}
