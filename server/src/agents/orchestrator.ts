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
  onStepComplete?: (step: AgentResult) => void,
): Promise<PipelineResponse> {
  const steps: AgentResult[] = [];

  const hiringManagerStart = Date.now();
  const hiringManagerResult = await runHiringManager(
    modelService,
    request.jobDescription,
    request.cvTemplate,
    request.history,
  );
  const hmStep: AgentResult = { step: 1, name: "hiring-manager", output: hiringManagerResult, durationMs: Date.now() - hiringManagerStart };
  steps.push(hmStep);
  onStepComplete?.(hmStep);

  const rewriteResumeStart = Date.now();
  const rewriteResumeResult = await runRewriteResume(
    modelService,
    hiringManagerResult.missingKeywords,
    request.cvTemplate,
    hiringManagerResult.cvLanguage,
  );
  const rrStep: AgentResult = { step: 2, name: "rewrite-resume", output: rewriteResumeResult, durationMs: Date.now() - rewriteResumeStart };
  steps.push(rrStep);
  onStepComplete?.(rrStep);

  const atsScannerStart = Date.now();
  const atsScannerResult = await runAtsScanner(
    modelService,
    rewriteResumeResult.updatedCvHtml,
    hiringManagerResult.cvLanguage,
    request.jobDescription,
  );
  const atsStep: AgentResult = { step: 3, name: "ats-scanner", output: atsScannerResult, durationMs: Date.now() - atsScannerStart };
  steps.push(atsStep);
  onStepComplete?.(atsStep);

  const verifierStart = Date.now();
  const verifierResult = await runVerifier(
    modelService,
    atsScannerResult.updatedCvHtml,
    request.history,
  );
  const verifierStep: AgentResult = { step: 4, name: "verifier", output: verifierResult, durationMs: Date.now() - verifierStart };
  steps.push(verifierStep);
  onStepComplete?.(verifierStep);

  return { steps, finalCv: verifierResult.verifiedCv };
}
