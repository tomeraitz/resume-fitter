# Plan: Eval Integrity Tests — CV Rules + No-Lies

## Goal

Add 2 new LLM-evaluated (`TEST_EVAL=true`) tests that check semantic output quality:

1. **Rules compliance** — the rewritten CV follows all rewriting rules (no hallucinated sections, formatting preserved, etc.)
2. **No fabrication** — the rewritten CV does not contain claims that aren't backed by the candidate's history

These two tests should also be runnable in isolation via a dedicated npm script.

---

## New File

**`tests/prompts/rewrite-resume.integrity.eval.test.ts`**

Place alongside the existing eval files. Separate file so it can be targeted independently.

---

## Test 1: CV follows rewriting rules

### What it checks

Run the `rewrite-resume` agent, then pass the original template, the rewritten CV, and the list of missing keywords to an **LLM judge** (a second `generateObject` call). The judge returns:

```ts
{
  passes: boolean;
  violations: string[]; // list of specific rule breaches
}
```

### Rules to evaluate (judge prompt)

The judge should check whether the rewritten CV:
- Did not add new bullet points beyond the original count
- Did not add new section headers that weren't in the original
- Did not change the HTML structure/layout (classes, nesting)
- Did not fabricate a job title, company name, or date that wasn't in the original
- Inserted the requested keywords naturally (not just appended at the bottom)
- Did not repeat the same keyword in the same sentence multiple times

### Fixture

Use `single-column-cv.html` + keywords `['PostgreSQL', 'CI/CD', 'REST APIs']` (same as existing eval tests for consistency).

### Assertion

```ts
expect(judgeResult.passes, judgeResult.violations.join('\n')).toBe(true);
```

---

## Test 2: No fabrication (CV doesn't lie)

### What it checks

Run the `rewrite-resume` agent, then pass the rewritten CV and `candidate-history.md` to an **LLM judge**. The judge identifies any claims in the CV that contradict or go beyond what the history confirms.

Judge returns:

```ts
{
  fabricatedClaims: string[]; // each is a specific claim found in the CV that has no basis in history
}
```

### Fabrication definition for the judge prompt

Flag a claim if:
- It mentions a technology that appears in "Explicit gaps" in the history (e.g., Kubernetes, Python, PyTorch)
- It mentions a role (team lead, manager) the candidate never held
- It mentions a company, project, or metric that is not referenced anywhere in the history
- It inflates scope (e.g., "led a team of 10" when history says individual contributor)

### Fixture

Use `single-column-cv.html` + keywords `['PostgreSQL', 'CI/CD', 'REST APIs']` + `candidate-history.md`.

The existing fixture is well-suited: `candidate-history.md` has an explicit **"Notable Gaps"** section listing things that must never appear in the CV.

### Assertion

```ts
expect(
  judgeResult.fabricatedClaims,
  `Fabricated claims found:\n${judgeResult.fabricatedClaims.join('\n')}`
).toHaveLength(0);
```

---

## Running only these two tests

### Add a new npm script to `server/package.json`

```json
"test:eval:quality": "cross-env TEST_EVAL=true vitest run --reporter=verbose tests/prompts/rewrite-resume.integrity.eval.test.ts"
```

This lets you run:
```bash
npm run test:eval:quality
```

Without touching the other eval tests.

---

## LLM Judge pattern

Both tests use the same judge pattern — a second `generateObject` call using `modelService` (already available via `test-utils.ts`). The judge model can be the default model from `ModelService` or a hardcoded fast model (e.g., `claude-haiku`).

### What to expose from `test-utils.ts`

Export `modelService` directly (or a `getModelService()` helper) so the integrity test file can call `generateObject` directly without going through `runAgent`.

Alternatively, add a `runJudge(prompt: string, schema: ZodSchema)` helper to `test-utils.ts`.

---

## Files to create/modify

| File | Action |
|---|---|
| `tests/prompts/rewrite-resume.integrity.eval.test.ts` | **Create** — the two new tests |
| `test-utils.ts` | **Modify** — export `modelService` or add `runJudge` helper |
| `server/package.json` | **Modify** — add `test:eval:integrity` script |

---

## Notes

- Both tests make 2 LLM calls each (agent call + judge call) — they're slower and costlier than structural eval tests
- Judge prompt quality is critical — needs to be specific enough to avoid false positives
- Consider a `judgeModel` fixture (e.g., Haiku) separate from the agent model to keep costs low
- The "Notable Gaps" section in `candidate-history.md` is already structured for this — use it verbatim in the judge prompt
