# Implementation Plan: CV Rewrite Bug Fix

**Date:** 2026-03-28
**Branch:** pdf-issue
**Goal:** Make the LLM actually rewrite CV text to match the job description.

---

## Root Cause Analysis

Three compounding causes — all must be fixed:

### Cause A: `missingKeywords` capped at 3–7 (too few to drive meaningful rewriting)
The hiring-manager prompt defines `missingKeywords` as "3–7 keyword strings." With 3 keywords, the rewriter has almost nothing to change — especially when the HTML is noisy PDF output. The rewriter prompt says "for each missing keyword, examine the history." With 3 keywords it makes 3 tiny spot-replacements at best.

**Fix:** Change the hiring-manager prompt to produce 8–15 keywords. Also add a new `rewriteInstructions` field: a prose paragraph explaining what the CV needs to emphasise to fit the role. The rewriter should use this as its primary guidance, not just the keyword list.

### Cause B: Rewriter receives no job description context
`runRewriteResume` receives `missingKeywords`, `cvTemplate`, `cvLanguage` — but **not the job description**. The rewriter only knows what is missing, not what the job actually demands. It cannot intelligently rephrase bullets toward the role.

**Fix:** Pass `jobDescription` to `runRewriteResume`. Include it in `userPrompt`. Update the prompt to use it as context for how to rephrase.

### Cause C: Verifier with no `history` silently reverts changes
`runVerifier` receives `history?: string`. When `history` is undefined (user has no `professionalHistory`), the verifier prompt says: "for any claim that cannot be verified, flag it or soften it." With nothing to verify against, *every* rewritten sentence is unverifiable — the verifier softens everything back toward safe, vague language, approaching the original.

**Fix:** Make the verifier prompt explicitly state: "If `history` is null/empty, do NOT soften or change any claims — pass the CV through unchanged with an empty `flaggedClaims` array." Also log whether history was present.

---

## Files to Change

```
server/src/agents/orchestrator.ts          ← pass jobDescription to runRewriteResume
server/src/agents/hiring-manager.ts        ← add logging
server/src/agents/rewrite-resume.ts        ← accept + use jobDescription, add logging
server/src/agents/verifier.ts              ← already has logging (good)
server/src/prompts/hiring-manager.md       ← expand keywords to 8–15, add rewriteInstructions
server/src/prompts/rewrite-resume.md       ← add jobDescription field, improve instructions
server/src/prompts/verifier.md             ← add no-history passthrough rule
server/src/types/pipeline.types.ts         ← no changes needed
```

---

## Change 1: `hiring-manager.md` — Expand keywords, add `rewriteInstructions`

**File:** `server/src/prompts/hiring-manager.md`

Change the output contract section. Replace the `missingKeywords` definition and add a new field:

```markdown
- `missingKeywords`: array of 8–15 keyword strings from the job description that are absent
  or underrepresented in the CV. Include technical skills, tools, methodologies, soft skills,
  and domain terms. Prefer specific terms over generic ones.
- `rewriteInstructions`: a 3–5 sentence paragraph addressed directly to a resume writer,
  explaining what the CV needs to emphasise to fit this role. Reference the job title, key
  requirements, and the candidate's most relevant experience to anchor. Example:
  "This SRE role requires cloud infrastructure depth. The candidate's DevOps work at Acme
  should be reframed around reliability engineering — highlight incident response, SLOs, and
  on-call experience. Add Kubernetes and Terraform to the skills section where the history
  supports it."
```

Update the JSON example:
```json
{
  "matchScore": 72,
  "cvLanguage": "he",
  "missingKeywords": ["Kubernetes", "gRPC", "cost optimization", "oncall rotations", "SLO budgets", "Terraform", "Prometheus", "incident response"],
  "rewriteInstructions": "This SRE role requires cloud infrastructure depth...",
  "summary": "The CV lacks cloud infrastructure depth required by this SRE role."
}
```

---

## Change 2: `hiring-manager.ts` — Add `rewriteInstructions` to schema + logging

**File:** `server/src/agents/hiring-manager.ts`

```typescript
export const HiringManagerOutputSchema = z.object({
  matchScore: z.number(),
  cvLanguage: z.string(),
  missingKeywords: z.array(z.string()),
  rewriteInstructions: z.string(),
  summary: z.string(),
});

export async function runHiringManager(
  modelService: ModelService,
  jobDescription: string,
  cvTemplate: string,
  history?: string,
): Promise<HiringManagerOutput> {
  console.log(`[hiring-manager] starting — jobDescLen=${jobDescription.length} cvTemplateLen=${cvTemplate.length} hasHistory=${!!history}`);
  console.log(`[hiring-manager] jobDescription (first 500): ${jobDescription.slice(0, 500)}`);

  const userPrompt = JSON.stringify({ jobDescription, cvTemplate: stripHtml(cvTemplate), history });
  const raw = await modelService.complete(systemPrompt, userPrompt);
  const text = raw
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```\s*$/i, "")
    .trim();
  const parsed: unknown = JSON.parse(text);
  const result = HiringManagerOutputSchema.parse(parsed);

  console.log(`[hiring-manager] done — matchScore=${result.matchScore} cvLanguage=${result.cvLanguage} missingKeywords(${result.missingKeywords.length})=${JSON.stringify(result.missingKeywords)}`);
  console.log(`[hiring-manager] rewriteInstructions: ${result.rewriteInstructions}`);
  return result;
}
```

---

## Change 3: `rewrite-resume.ts` — Accept `jobDescription` + `rewriteInstructions`, add logging

**File:** `server/src/agents/rewrite-resume.ts`

```typescript
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

  console.log(`[rewrite-resume] parsed OK — updatedCvHtmlLen=${result.updatedCvHtml.length} keywordsNotAdded=${JSON.stringify(result.keywordsNotAdded.map(k => k.keyword))}`);

  // Detect no-op: if output equals input, log a clear warning
  if (result.updatedCvHtml === cvTemplate) {
    console.warn(`[rewrite-resume] WARNING: updatedCvHtml is IDENTICAL to input cvTemplate — LLM made no changes!`);
  } else {
    console.log(`[rewrite-resume] CV was changed (input=${cvTemplate.length} chars, output=${result.updatedCvHtml.length} chars)`);
  }

  return result;
}
```

---

## Change 4: `rewrite-resume.md` — Add `jobDescription` + `rewriteInstructions` fields, improve instructions

**File:** `server/src/prompts/rewrite-resume.md`

Update the Task section to describe the new fields:

```markdown
## Task

You will receive a user message containing five fields:
- `missingKeywords`: array of keyword strings to incorporate into the CV
- `rewriteInstructions`: a paragraph written by a hiring manager explaining what the CV needs
  to emphasise for this role — use this as your primary rewriting guidance
- `jobDescription`: the full text of the job posting (use for context when rephrasing bullets)
- `cvTemplate`: the candidate's current CV in HTML format
- `cvLanguage`: ISO 639-1 code for the language of the CV (e.g. `"en"`, `"he"`)

Your job is to rewrite the CV to fit the role. Use `rewriteInstructions` as your guide for
emphasis and framing. Use `jobDescription` as context to understand the role's language and
priorities. Integrate every keyword from `missingKeywords` that the candidate's experience
supports.

**Do not just insert keywords in isolation.** Rewrite bullet points and descriptions so they
read naturally and are role-relevant. The CV should feel like it was written for this job.

### Handling absolute-positioned PDF-converted HTML
The CV HTML may consist of many `<span>` elements with absolute `left`/`top` positions
(from PDF conversion). In that case, find the `<span>` elements that contain job titles,
bullet text, and skill names — these are the text nodes to rewrite. Do not change `left`,
`top`, `font-size`, `color`, or any CSS. Only change the text between `>` and `</span>`.
```

---

## Change 5: `orchestrator.ts` — Pass new arguments to `runRewriteResume`

**File:** `server/src/agents/orchestrator.ts`

```typescript
// Step 2: rewrite-resume
const rewriteResumeResult = await runRewriteResume(
  modelService,
  hiringManagerResult.missingKeywords,
  hiringManagerResult.rewriteInstructions,  // NEW
  request.jobDescription,                    // NEW
  request.cvTemplate,
  hiringManagerResult.cvLanguage,
);
```

Also add orchestrator-level logging after each step:

```typescript
// After step 1:
console.log(`[orchestrator] hiring-manager output — missingKeywords=${JSON.stringify(hiringManagerResult.missingKeywords)} rewriteInstructions="${hiringManagerResult.rewriteInstructions.slice(0, 200)}"`);

// After step 2:
console.log(`[orchestrator] rewrite-resume output — updatedCvHtmlLen=${rewriteResumeResult.updatedCvHtml.length} keywordsNotAdded=${JSON.stringify(rewriteResumeResult.keywordsNotAdded.map(k => k.keyword))}`);

// After step 3 (verifier):
console.log(`[orchestrator] verifier output — verifiedCvLen=${verifierResult.verifiedCv.length} flaggedClaims=${verifierResult.flaggedClaims.length}`);
```

---

## Change 6: `verifier.md` — Add no-history passthrough rule

**File:** `server/src/prompts/verifier.md`

Add a section before the Output Contract:

```markdown
## When `history` is absent

If `history` is null, empty, or not provided, you have no ground truth to verify against.
In this case: return `updatedCvHtml` completely unchanged and return an empty `flaggedClaims`
array. Do NOT soften, remove, or rephrase any claims when there is no history to compare against.
```

---

## Change 7: `verifier.ts` — Add `cvLanguage` pass-through + logging (already has logging, minor fix)

**File:** `server/src/agents/verifier.ts`

The verifier currently does not receive `cvLanguage`. The verifier prompt references it. Pass it:

```typescript
export async function runVerifier(
  modelService: ModelService,
  updatedCvHtml: string,
  cvLanguage: string,   // NEW param
  history?: string,
): Promise<VerifierOutput> {
  console.log(`[verifier] starting — cvHtmlLen=${updatedCvHtml.length} hasHistory=${!!history} cvLanguage=${cvLanguage}`);
  const userPrompt = JSON.stringify({ updatedCvHtml, history, cvLanguage });
  // ... rest unchanged
```

Update the orchestrator call:
```typescript
const verifierResult = await runVerifier(
  modelService,
  rewriteResumeResult.updatedCvHtml,
  hiringManagerResult.cvLanguage,  // NEW
  request.history,
);
```

---

## Change 8: `pipeline.types.ts` — Add `rewriteInstructions` (no structural change needed)

The `AgentResult.output` is `Record<string, unknown>` so the new field flows through SSE automatically. No type change needed.

However, update `PipelineRequest` to document that `cvTemplate` is always required (PDF mode already converts on the client before posting — confirmed from `background.ts`):

```typescript
// No structural change — cvTemplate is already required. Just verify the Zod schema
// in pipeline.ts has max set to 1_000_000 (PDF HTML can be large).
// Current: cvTemplate: z.string().min(1).max(100_000) — THIS IS TOO SMALL FOR PDF HTML
```

**Fix in `pipeline.ts`:**
```typescript
const PipelineRequestSchema = z.object({
  jobDescription: z.string().min(1).max(50_000),
  cvTemplate: z.string().min(1).max(1_000_000),  // was 100_000 — PDF HTML can be 300KB+
  history: z.string().max(100_000).optional(),
});
```

---

## Logging Summary (what will now appear in Docker logs)

| Log line | Source |
|----------|--------|
| `[hiring-manager] jobDescription (first 500): ...` | hiring-manager.ts |
| `[hiring-manager] missingKeywords(10)=[...]` | hiring-manager.ts |
| `[hiring-manager] rewriteInstructions: ...` | hiring-manager.ts |
| `[orchestrator] hiring-manager output — ...` | orchestrator.ts |
| `[rewrite-resume] missingKeywords(10)=[...]` | rewrite-resume.ts |
| `[rewrite-resume] rewriteInstructions: ...` | rewrite-resume.ts |
| `[rewrite-resume] model response first500: ...` | rewrite-resume.ts |
| `[rewrite-resume] CV was changed (input=X chars, output=Y chars)` | rewrite-resume.ts |
| `[rewrite-resume] WARNING: IDENTICAL — LLM made no changes!` | rewrite-resume.ts (no-op guard) |
| `[orchestrator] rewrite-resume output — ...` | orchestrator.ts |
| `[verifier] starting — cvHtmlLen=X hasHistory=true cvLanguage=he` | verifier.ts |
| `[verifier] parsed OK — verifiedCvLen=X flaggedClaims=N` | verifier.ts |
| `[orchestrator] verifier output — ...` | orchestrator.ts |

---

## Implementation Order

1. `hiring-manager.md` — expand keywords + add `rewriteInstructions` field
2. `hiring-manager.ts` — add field to schema + logging
3. `rewrite-resume.md` — add `jobDescription`/`rewriteInstructions` fields + PDF HTML guidance
4. `rewrite-resume.ts` — add new params + full logging
5. `orchestrator.ts` — wire new params, add step-level logging
6. `verifier.md` — add no-history passthrough rule
7. `verifier.ts` — add `cvLanguage` param
8. `pipeline.ts` — raise `cvTemplate` max to 1_000_000 (if not already)

---

## Testing Checklist

After implementation, run a test pipeline and verify these log lines appear:

- [ ] `[hiring-manager] missingKeywords` has 8+ entries
- [ ] `[hiring-manager] rewriteInstructions` is non-empty prose
- [ ] `[rewrite-resume] model response first500` shows HTML content (not original)
- [ ] `[rewrite-resume] CV was changed` (not the WARNING variant)
- [ ] `[verifier] flaggedClaims=0` when history is absent (passthrough mode)
- [ ] Final `finalCv` in the SSE `done` event differs from input `cvTemplate`
