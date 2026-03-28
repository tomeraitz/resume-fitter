import { readFileSync } from "fs";
import { join } from "path";
import { z } from "zod";
import type { ModelService } from "../services/model.service.js";
import { stripHtml } from "../utils/html-helpers.js";

const systemPrompt = readFileSync(
  join(import.meta.dirname, "../prompts/hiring-manager.md"),
  "utf8",
);

export const HiringManagerOutputSchema = z.object({
  matchScore: z.number(),
  cvLanguage: z.string(),
  missingKeywords: z.array(z.string()),
  rewriteInstructions: z.string(),
  summary: z.string(),
});

export type HiringManagerOutput = z.infer<typeof HiringManagerOutputSchema>;

export async function runHiringManager(
  modelService: ModelService,
  jobDescription: string,
  cvTemplate: string,
  history?: string,
): Promise<HiringManagerOutput> {
  console.log(`[hiring-manager] starting — jobDescLen=${jobDescription.length} cvTemplateLen=${cvTemplate.length} hasHistory=${!!history}`);
  console.log(`[hiring-manager] jobDescription (first 500): ${jobDescription.slice(0, 500)}`);

  const userPrompt = JSON.stringify({ jobDescription, cvTemplate: stripHtml(cvTemplate), history });
  const raw = await modelService.complete(systemPrompt, userPrompt);
  const text = raw
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```\s*$/i, "")
    .trim();
  const parsed: unknown = JSON.parse(text);
  const result = HiringManagerOutputSchema.parse(parsed);

  console.log(`[hiring-manager] done — matchScore=${result.matchScore} cvLanguage=${result.cvLanguage} missingKeywords(${result.missingKeywords.length})=${JSON.stringify(result.missingKeywords)}`);
  console.log(`[hiring-manager] rewriteInstructions: ${result.rewriteInstructions}`);

  return result;
}
