import { readFileSync } from 'fs';
import { join } from 'path';
import { describe, it, expect } from 'vitest';
import { z } from 'zod';
import { runAgent, runJudge } from './test-utils.js';
import { RewriteResumeOutputSchema } from './schemas.js';

const fixtures = join(import.meta.dirname, '../fixtures');
const singleColumnCv = readFileSync(join(fixtures, 'cv-templates/single-column-cv.html'), 'utf8');
const candidateHistory = readFileSync(join(fixtures, 'histories/candidate-history.md'), 'utf8');

const runEval = process.env['TEST_EVAL'] === 'true';
const evalIt = runEval ? it : it.skip;

// ---- Schemas ----

const RulesJudgeSchema = z.object({
  passes: z.boolean(),
  violations: z.array(z.string()),
});

const FabricationJudgeSchema = z.object({
  fabricatedClaims: z.array(z.string()),
});

// ---- Prompts ----

const RULES_JUDGE_SYSTEM_PROMPT = `You are a strict CV-rewriting auditor.
You will receive an original CV template in <original_cv> tags, a rewritten CV in <rewritten_cv> tags, and the list of keywords in <requested_keywords> tags.
Your task is to check whether the rewritten CV obeys all of the following rules:

1. No new bullet points were added beyond what existed in the original.
2. No new section headers were added that did not exist in the original.
3. The HTML structure was not changed: class names, nesting, and element types are identical to the original.
4. No job title, company name, or date was fabricated — every one that appears in the rewritten CV also appeared in the original template.
5. Each requested keyword appears naturally within existing text, not appended as a standalone list at the bottom.
6. No single sentence repeats the same keyword more than once.

Return ONLY a JSON object with no extra text or markdown fences, in this exact shape:
{"passes": true, "violations": []}
or
{"passes": false, "violations": ["<description of violation>", ...]}`;

const FABRICATION_JUDGE_SYSTEM_PROMPT = `You are a factual-accuracy auditor for AI-rewritten CVs.
You will receive three inputs:
- <original_cv>: the candidate's original CV template before rewriting
- <rewritten_cv>: the CV after AI rewriting
- <candidate_history>: the candidate's verified professional history (including an explicit "Notable Gaps" section listing what the candidate has NOT done)

Your job is to identify claims that the rewrite agent INVENTED — i.e., claims that appear in <rewritten_cv> but were NOT already present in <original_cv> AND are not supported by <candidate_history>.

Important: if a claim (including specific numbers, metrics, or client counts) already existed in <original_cv>, it is NOT a fabrication — the agent preserved it. Only flag claims the agent added that have no basis in the original template or the history.

Fabrication is defined as a claim the agent newly introduced that:
- Mentions a technology listed under "Notable Gaps" in the history
- Mentions a managerial or leadership role the candidate has never held
- Mentions a company, project, or client not in the original CV or history
- Introduces a specific metric or percentage not present in the original CV and not supported by the history
- Inflates seniority or scope beyond what the original CV and history describe

Return ONLY a JSON object with no extra text or markdown fences, in this exact shape:
{"fabricatedClaims": []}
or
{"fabricatedClaims": ["<exact fabricated phrase from the rewritten CV>", ...]}`;

// ---- Tests ----

describe('rewrite-resume integrity evals', () => {
  evalIt('rewritten CV follows all rewriting rules', async () => {
    const missingKeywords = ['PostgreSQL', 'CI/CD', 'REST APIs'];

    const rewrittenRaw = await runAgent('rewrite-resume', {
      missingKeywords,
      cvTemplate: singleColumnCv,
      cvLanguage: 'en',
    });
    const rewritten = RewriteResumeOutputSchema.parse(rewrittenRaw);

    const judgeUserPrompt = [
      '<original_cv>',
      singleColumnCv,
      '</original_cv>',
      '<rewritten_cv>',
      rewritten.updatedCvHtml,
      '</rewritten_cv>',
      '<requested_keywords>',
      missingKeywords.join(', '),
      '</requested_keywords>',
    ].join('\n');

    const judgeResult = await runJudge(
      RULES_JUDGE_SYSTEM_PROMPT,
      judgeUserPrompt,
      RulesJudgeSchema,
    );

    expect(judgeResult.passes, judgeResult.violations.join('\n')).toBe(true);
  }, 120_000);

  evalIt('rewritten CV contains no fabricated claims', async () => {
    const missingKeywords = ['PostgreSQL', 'CI/CD', 'REST APIs'];

    const rewrittenRaw = await runAgent('rewrite-resume', {
      missingKeywords,
      cvTemplate: singleColumnCv,
      cvLanguage: 'en',
    });
    const rewritten = RewriteResumeOutputSchema.parse(rewrittenRaw);

    const fabricationUserPrompt = [
      '<original_cv>',
      singleColumnCv,
      '</original_cv>',
      '<rewritten_cv>',
      rewritten.updatedCvHtml,
      '</rewritten_cv>',
      '<candidate_history>',
      candidateHistory,
      '</candidate_history>',
    ].join('\n');

    const judgeResult = await runJudge(
      FABRICATION_JUDGE_SYSTEM_PROMPT,
      fabricationUserPrompt,
      FabricationJudgeSchema,
    );

    expect(
      judgeResult.fabricatedClaims,
      'Fabricated claims found:\n' + judgeResult.fabricatedClaims.join('\n'),
    ).toHaveLength(0);
  }, 120_000);
});
