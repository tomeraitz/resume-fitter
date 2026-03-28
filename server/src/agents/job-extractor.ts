import { readFileSync } from "fs";
import { join } from "path";
import type { ModelService } from "../services/model.service.js";
import { stripHtml } from "../utils/html-helpers.js";
import { ExtractionResultSchema, type ExtractionResult } from "../types/extract.types.js";

const systemPrompt = readFileSync(
  join(import.meta.dirname, "../prompts/job-extractor.md"),
  "utf8",
);

export async function runJobExtractor(
  modelService: ModelService,
  html: string,
): Promise<ExtractionResult> {
  const strippedText = stripHtml(html);
  console.log(`[extract] starting — htmlLen=${html.length} strippedLen=${strippedText.length}`);
  console.log(`[extract] strippedText (first 500): ${strippedText.slice(0, 500)}`);

  const userPrompt = `<page_content>\n${strippedText}\n</page_content>`;
  const raw = await modelService.completeFast(systemPrompt, userPrompt);
  const text = raw
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```\s*$/i, "")
    .trim();
  const parsed: unknown = JSON.parse(text);
  const result = ExtractionResultSchema.parse(parsed);

  if (result.isJobPosting) {
    const jd = result.jobDetails;
    console.log(`[extract] done — isJobPosting=true title="${jd.title}" company="${jd.company}" descriptionLen=${jd.description.length}`);
    console.log(`[extract] jobDescription (first 500): ${jd.description.slice(0, 500)}`);
  } else {
    console.log(`[extract] done — isJobPosting=false reason="${result.reason.slice(0, 200)}"`);
  }

  return result;
}
