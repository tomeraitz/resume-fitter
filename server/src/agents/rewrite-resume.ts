import { readFileSync } from "fs";
import { join } from "path";
import { z } from "zod";
import type { ModelService } from "../services/model.service.js";

const systemPrompt = readFileSync(
  join(import.meta.dirname, "../prompts/rewrite-resume.md"),
  "utf8",
);

export const RewriteResumeOutputSchema = z.object({
  updatedCvHtml: z.string(),
  keywordsNotAdded: z.array(
    z.object({
      keyword: z.string(),
      reason: z.string(),
    }),
  ),
});

export type RewriteResumeOutput = z.infer<typeof RewriteResumeOutputSchema>;

export async function runRewriteResume(
  modelService: ModelService,
  missingKeywords: string[],
  cvTemplate: string,
  cvLanguage: string,
): Promise<RewriteResumeOutput> {
  const userPrompt = JSON.stringify({ missingKeywords, cvTemplate, cvLanguage });
  const raw = await modelService.complete(systemPrompt, userPrompt);
  const text = raw
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```\s*$/i, "")
    .trim();
  const parsed: unknown = JSON.parse(text);
  return RewriteResumeOutputSchema.parse(parsed);
}
