import type { ModelService } from "../services/model.service.js";

export interface RewriteResumeOutput {
  updatedCvHtml: string;
}

export async function runRewriteResume(
  modelService: ModelService,
  missingKeywords: string[],
  cvTemplate: string,
): Promise<RewriteResumeOutput> {
  // TODO: load rewrite-resume.md system prompt
  // TODO: call modelService.complete(systemPrompt, userPrompt)
  // TODO: parse and Zod-validate the JSON response
  void modelService;
  void missingKeywords;
  void cvTemplate;
  throw new Error("Not implemented");
}
