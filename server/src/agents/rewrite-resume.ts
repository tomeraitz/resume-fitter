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
  rewriteInstructions: string,
  jobDescription: string,
  cvTemplate: string,
  cvLanguage: string,
): Promise<RewriteResumeOutput> {
  console.log(`[rewrite-resume] starting — missingKeywords(${missingKeywords.length})=${JSON.stringify(missingKeywords)}`);
  console.log(`[rewrite-resume] rewriteInstructions: ${rewriteInstructions}`);
  console.log(`[rewrite-resume] cvTemplateLen=${cvTemplate.length} cvLanguage=${cvLanguage}`);

  const userPrompt = JSON.stringify({
    missingKeywords,
    rewriteInstructions,
    jobDescription,
    cvTemplate,
    cvLanguage,
  });
  const raw = await modelService.complete(systemPrompt, userPrompt);

  console.log(`[rewrite-resume] model response received — rawLen=${raw.length} first500=${raw.slice(0, 500)}`);

  const text = raw
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```\s*$/i, "")
    .trim();
  const parsed: unknown = JSON.parse(text);
  const result = RewriteResumeOutputSchema.parse(parsed);

  console.log(`[rewrite-resume] parsed OK — updatedCvHtmlLen=${result.updatedCvHtml.length} keywordsNotAdded=${JSON.stringify(result.keywordsNotAdded.map((k) => k.keyword))}`);

  if (result.updatedCvHtml === cvTemplate) {
    console.warn(`[rewrite-resume] WARNING: updatedCvHtml is IDENTICAL to input cvTemplate — LLM made no changes!`);
  } else {
    console.log(`[rewrite-resume] CV was changed (input=${cvTemplate.length} chars, output=${result.updatedCvHtml.length} chars)`);
  }

  return result;
}
