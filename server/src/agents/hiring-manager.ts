import { readFileSync } from "fs";
import { join } from "path";
import { z } from "zod";
import type { ModelService } from "../services/model.service.js";

const systemPrompt = readFileSync(
  join(import.meta.dirname, "../prompts/hiring-manager.md"),
  "utf8",
);

export const HiringManagerOutputSchema = z.object({
  matchScore: z.number(),
  cvLanguage: z.string(),
  missingKeywords: z.array(z.string()),
  summary: z.string(),
});

export type HiringManagerOutput = z.infer<typeof HiringManagerOutputSchema>;

export async function runHiringManager(
  modelService: ModelService,
  jobDescription: string,
  cvTemplate: string,
  history?: string,
): Promise<HiringManagerOutput> {
  const userPrompt = JSON.stringify({ jobDescription, cvTemplate, history });
  const raw = await modelService.complete(systemPrompt, userPrompt);
  const text = raw
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```\s*$/i, "")
    .trim();
  const parsed: unknown = JSON.parse(text);
  return HiringManagerOutputSchema.parse(parsed);
}
