import type { ModelService } from "../services/model.service.js";

export interface VerifierOutput {
  verifiedCv: string;
  flaggedClaims: string[];
}

export async function runVerifier(
  modelService: ModelService,
  updatedCvHtml: string,
  history: string,
): Promise<VerifierOutput> {
  // TODO: load verifier.md system prompt
  // TODO: call modelService.complete(systemPrompt, userPrompt)
  // TODO: parse and Zod-validate the JSON response
  void modelService;
  void updatedCvHtml;
  void history;
  throw new Error("Not implemented");
}
