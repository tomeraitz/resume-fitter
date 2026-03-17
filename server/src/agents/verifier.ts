import { readFileSync } from "fs";
import { join } from "path";
import { z } from "zod";
import type { ModelService } from "../services/model.service.js";

const systemPrompt = readFileSync(
  join(import.meta.dirname, "../prompts/verifier.md"),
  "utf8",
);

export const VerifierOutputSchema = z.object({
  verifiedCv: z.string(),
  flaggedClaims: z.array(z.string()),
});

export type VerifierOutput = z.infer<typeof VerifierOutputSchema>;

export async function runVerifier(
  modelService: ModelService,
  updatedCvHtml: string,
  history?: string,
): Promise<VerifierOutput> {
  const userPrompt = JSON.stringify({ updatedCvHtml, history });
  const raw = await modelService.completeFast(systemPrompt, userPrompt);
  const text = raw
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```\s*$/i, "")
    .trim();
  const parsed: unknown = JSON.parse(text);
  return VerifierOutputSchema.parse(parsed);
}
