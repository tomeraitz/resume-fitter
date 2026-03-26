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
  console.log(`[verifier] starting — cvHtmlLen=${updatedCvHtml.length} hasHistory=${!!history}`);
  const userPrompt = JSON.stringify({ updatedCvHtml, history });
  const raw = await modelService.completeFast(systemPrompt, userPrompt);
  console.log(`[verifier] model response received — rawLen=${raw.length}`);
  const text = raw
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```\s*$/i, "")
    .trim();
  console.log(`[verifier] cleaned text — len=${text.length} first100=${text.slice(0, 100)}`);
  const parsed: unknown = JSON.parse(text);
  const result = VerifierOutputSchema.parse(parsed);
  console.log(`[verifier] parsed OK — verifiedCvLen=${result.verifiedCv.length} flaggedClaims=${result.flaggedClaims.length}`);
  return result;
}
