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
  const userPrompt = `<page_content>\n${strippedText}\n</page_content>`;
  const raw = await modelService.completeFast(systemPrompt, userPrompt);
  const text = raw
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```\s*$/i, "")
    .trim();
  const parsed: unknown = JSON.parse(text);
  return ExtractionResultSchema.parse(parsed);
}
