import { readFileSync } from "fs";
import { join } from "path";
import { z } from "zod";
import type { ModelService } from "../services/model.service.js";

const systemPrompt = readFileSync(
  join(import.meta.dirname, "../prompts/cv-chat.md"),
  "utf8",
);

export const CvChatOutputSchema = z.object({
  updatedCvHtml: z.string(),
  flaggedClaims: z.array(z.string()),
});

export type CvChatOutput = z.infer<typeof CvChatOutputSchema>;

export async function runCvChat(
  modelService: ModelService,
  userMessage: string,
  currentCv: string,
  history?: string,
): Promise<CvChatOutput> {
  const userPrompt = JSON.stringify({ userMessage, currentCv, history });
  const raw = await modelService.complete(systemPrompt, userPrompt);
  const text = raw
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```\s*$/i, "")
    .trim();
  const parsed: unknown = JSON.parse(text);
  return CvChatOutputSchema.parse(parsed);
}
