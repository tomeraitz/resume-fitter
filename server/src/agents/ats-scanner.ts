import { readFileSync } from "fs";
import { join } from "path";
import { z } from "zod";
import type { ModelService } from "../services/model.service.js";

const systemPrompt = readFileSync(
  join(import.meta.dirname, "../prompts/ats-scanner.md"),
  "utf8",
);

export const AtsScannerOutputSchema = z.object({
  atsScore: z.number(),
  problemAreas: z.array(z.string()),
  updatedCvHtml: z.string(),
});

export type AtsScannerOutput = z.infer<typeof AtsScannerOutputSchema>;

export async function runAtsScanner(
  modelService: ModelService,
  updatedCvHtml: string,
  cvLanguage: string = 'en',
  jobDescription: string = '',
): Promise<AtsScannerOutput> {
  const userPrompt = JSON.stringify({ updatedCvHtml, cvLanguage, jobDescription });
  const raw = await modelService.completeFast(systemPrompt, userPrompt);
  const text = raw
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```\s*$/i, "")
    .trim();
  const parsed: unknown = JSON.parse(text);
  return AtsScannerOutputSchema.parse(parsed);
}
