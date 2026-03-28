import { readFileSync } from "fs";
import { join } from "path";
import { z } from "zod";
import type { ModelService } from "../services/model.service.js";
import {
  isAbsolutePositionedHtml,
  extractSpanGroups,
  reinjectText,
  type SpanGroup,
} from "../utils/html-layout.js";

const systemPrompt = readFileSync(
  join(import.meta.dirname, "../prompts/rewrite-resume.md"),
  "utf8",
);

const systemPromptText = readFileSync(
  join(import.meta.dirname, "../prompts/rewrite-resume-text.md"),
  "utf8",
);

// ── Output schemas ────────────────────────────────────────────────────────────

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

const TextRewriteOutputSchema = z.object({
  rewrittenSections: z.record(z.string(), z.string()),
  keywordsNotAdded: z.array(
    z.object({
      keyword: z.string(),
      reason: z.string(),
    }),
  ),
});

type TextRewriteOutput = z.infer<typeof TextRewriteOutputSchema>;

// ── Helpers ───────────────────────────────────────────────────────────────────

function buildSectionsMap(groups: SpanGroup[]): Record<string, string> {
  const sections: Record<string, string> = {};
  for (const group of groups) {
    // Skip structural spans (headers, dates, contact info, section labels).
    // For inline groups, only the leader carries the text — followers are empty
    // placeholders, so deduplicate by collecting leaders only.
    const rewritableText = group.spans
      .filter((s) => !s.isStructural && s.inlineGroupLeader)
      .map((s) => s.text)
      .join(' ')
      .trim();

    // Only include sections that have rewritable content
    if (rewritableText.length > 0) {
      sections[group.sectionLabel] = rewritableText;
    }
  }
  return sections;
}

function stripCodeFence(raw: string): string {
  return raw
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```\s*$/i, "")
    .trim();
}

// ── Absolute-positioned path ──────────────────────────────────────────────────

async function runRewriteResumeAbsolute(
  modelService: ModelService,
  missingKeywords: string[],
  rewriteInstructions: string,
  jobDescription: string,
  cvTemplate: string,
  cvLanguage: string,
): Promise<RewriteResumeOutput> {
  console.log(`[rewrite-resume] absolute-positioned HTML detected — using text-only rewrite path`);

  const groups = extractSpanGroups(cvTemplate);
  console.log(`[rewrite-resume] extracted ${groups.length} span groups`);

  const sections = buildSectionsMap(groups);

  const userPrompt = JSON.stringify({
    missingKeywords,
    rewriteInstructions,
    jobDescription,
    cvLanguage,
    sections,
  });

  const raw = await modelService.complete(systemPromptText, userPrompt);
  console.log(`[rewrite-resume] text-rewrite response received — rawLen=${raw.length}`);

  const text = stripCodeFence(raw);
  const parsed: unknown = JSON.parse(text);
  const result: TextRewriteOutput = TextRewriteOutputSchema.parse(parsed);

  console.log(`[rewrite-resume] text-rewrite parsed OK — sections=${Object.keys(result.rewrittenSections).length} keywordsNotAdded=${JSON.stringify(result.keywordsNotAdded.map((k) => k.keyword))}`);

  const updatedCvHtml = reinjectText(cvTemplate, groups, result.rewrittenSections);

  console.log(`[rewrite-resume] re-injected text — outputLen=${updatedCvHtml.length}`);

  if (updatedCvHtml === cvTemplate) {
    console.warn(`[rewrite-resume] WARNING: updatedCvHtml is IDENTICAL to input cvTemplate after re-injection — LLM made no changes!`);
  }

  return { updatedCvHtml, keywordsNotAdded: result.keywordsNotAdded };
}

// ── Standard HTML path ────────────────────────────────────────────────────────

async function runRewriteResumeStandard(
  modelService: ModelService,
  missingKeywords: string[],
  rewriteInstructions: string,
  jobDescription: string,
  cvTemplate: string,
  cvLanguage: string,
): Promise<RewriteResumeOutput> {
  const userPrompt = JSON.stringify({
    missingKeywords,
    rewriteInstructions,
    jobDescription,
    cvTemplate,
    cvLanguage,
  });
  const raw = await modelService.complete(systemPrompt, userPrompt);

  console.log(`[rewrite-resume] model response received — rawLen=${raw.length} first500=${raw.slice(0, 500)}`);

  const text = stripCodeFence(raw);
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

// ── Public entry point ────────────────────────────────────────────────────────

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

  if (isAbsolutePositionedHtml(cvTemplate)) {
    return runRewriteResumeAbsolute(
      modelService,
      missingKeywords,
      rewriteInstructions,
      jobDescription,
      cvTemplate,
      cvLanguage,
    );
  }

  return runRewriteResumeStandard(
    modelService,
    missingKeywords,
    rewriteInstructions,
    jobDescription,
    cvTemplate,
    cvLanguage,
  );
}
