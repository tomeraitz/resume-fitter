import type { ModelService } from "../services/model.service.js";

export interface HiringManagerOutput {
  matchScore: number;
  missingKeywords: string[];
}

export async function runHiringManager(
  modelService: ModelService,
  jobDescription: string,
  cvTemplate: string,
  history: string,
): Promise<HiringManagerOutput> {
  // TODO: load hiring-manager.md system prompt
  // TODO: call modelService.complete(systemPrompt, userPrompt)
  // TODO: parse and Zod-validate the JSON response
  void modelService;
  void jobDescription;
  void cvTemplate;
  void history;
  throw new Error("Not implemented");
}
