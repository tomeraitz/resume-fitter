import type { ModelService } from "../services/model.service.js";

export interface AtsScannerOutput {
  atsScore: number;
  problemAreas: string[];
}

export async function runAtsScanner(
  modelService: ModelService,
  updatedCvHtml: string,
): Promise<AtsScannerOutput> {
  // TODO: load ats-scanner.md system prompt
  // TODO: call modelService.complete(systemPrompt, userPrompt)
  // TODO: parse and Zod-validate the JSON response
  void modelService;
  void updatedCvHtml;
  throw new Error("Not implemented");
}
