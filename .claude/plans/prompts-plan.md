# System Prompts Plan — 05-03-26

> Scope: Write the 4 agent system prompts only. Includes evaluation strategy and test fixtures.

---

## What Each Prompt Must Produce

Each prompt governs one isolated `generateText()` call. The model must return **valid JSON only** — no prose, no markdown fences. The agent code will `JSON.parse()` the response and Zod-validate the shape.

| Agent | Input (user message) | Required JSON output |
|---|---|---|
| `hiring-manager.md` | jobDescription + cvTemplate + history | `{ matchScore: number, cvLanguage: string, missingKeywords: string[], summary: string }` |
| `rewrite-resume.md` | missingKeywords + cvTemplate + cvLanguage | `{ updatedCvHtml: string, keywordsNotAdded: {keyword, reason}[] }` |
| `ats-scanner.md` | updatedCvHtml + cvLanguage + jobDescription | `{ atsScore: number, problemAreas: string[] }` |
| `verifier.md` | updatedCvHtml + history + cvLanguage | `{ verifiedCv: string, flaggedClaims: string[] }` |

> `cvLanguage` is detected once by Agent 1 (ISO 639-1 code, e.g. `"he"`, `"en"`) and threaded through to all downstream agents.

> **TS stub alignment required** — the existing agent stubs do not yet match these contracts. Update before implementing:
> - `hiring-manager.ts`: add `cvLanguage: string` and `summary: string` to `HiringManagerOutput`
> - `rewrite-resume.ts`: add `cvLanguage: string` input param; add `keywordsNotAdded: { keyword: string; reason: string }[]` to `RewriteResumeOutput`
> - `ats-scanner.ts`: add `cvLanguage: string` and `jobDescription: string` input params
> - `verifier.ts`: add `cvLanguage: string` input param

---

## Prompt Anatomy (apply to all 4)

Every system prompt must contain these sections in order:

1. **Role** — one sentence, who the model is pretending to be
2. **Task** — what it must do with the user message
3. **Output contract** — exact JSON schema it must emit, with field descriptions
4. **Constraints** — rules: no fabrication, no markdown, only JSON, field types/ranges
5. **Examples** — at minimum one good output example (helps reliability)

---

## Source Definitions

Each server prompt must be **adapted** from the existing Claude Code agent/skill definitions. Do not write from scratch — translate the existing logic into a JSON-only system prompt.

| Server prompt | Source definition | Notes |
|---|---|---|
| `hiring-manager.md` | `.claude/agents/hiring-manager-reviewer.md` | Strip the markdown-formatted output section; replace with JSON output contract |
| `rewrite-resume.md` | `.claude/agents/rewrite-resume.md` | Keep X-Y-Z formula rules; replace file-save instruction with JSON return |
| `ats-scanner.md` | `.claude/agents/application-tracking-system.md` | Already ATS-focused; replace the markdown report format with JSON output contract; add `cvLanguage`/`jobDescription` input handling and language-mismatch rule |
| `verifier.md` | `.claude/skills/create-cv/SKILL.md` — Step 4 "Verify Accuracy" | Expand the brief step description into a full system prompt with JSON contract |

---

## Prompt-by-Prompt Spec

### 1. `hiring-manager.md`

**Source**: `.claude/agents/hiring-manager-reviewer.md`

**Adapt**: The agent already has role, review process, and keyword gap analysis. Convert the markdown-formatted output (### Match Score, ### Top 5 Missing Keywords, etc.) into a strict JSON output contract. Keep the three-category breakdown logic (skills, experience, keywords) as the internal reasoning, but the final output must be pure JSON.

**Output**:
```json
{
  "matchScore": 72,
  "cvLanguage": "he",
  "missingKeywords": ["Kubernetes", "gRPC", "cost optimization", "oncall rotations", "SLO budgets"],
  "summary": "The CV lacks cloud infrastructure depth required by this SRE role."
}
```

> `summary` is surfaced to the UI as a one-line human-readable explanation of the match score. It is not consumed by downstream agents.

**Constraints**:
- `matchScore` must be 0–100 integer
- `cvLanguage` must be a valid ISO 639-1 code (`"en"`, `"he"`, `"fr"`, etc.) — detected from the CV template content
- `missingKeywords` must be 3–7 items — use fewer when the JD has few genuine gaps, more when gaps are extensive; verbatim from job description where possible
- No hallucination of skills not present in the JD
- Pure JSON only — no commentary outside the object

---

### 2. `rewrite-resume.md`

**Source**: `.claude/agents/rewrite-resume.md`

**Adapt**: Keep the X-Y-Z formula definition and the "never fabricate" rule verbatim. Remove the file-save instruction (`new-cvs/<position-name>.html`) — the server agent returns HTML in JSON instead. Keep the "Keywords NOT Added" logic but surface it as a field in the JSON output rather than a markdown summary. Add language rule: preserve the CV's language (`cvLanguage`) throughout — do not switch to English when incorporating English keywords; find natural equivalents in the CV's language.

**Output**:
```json
{
  "updatedCvHtml": "<html>...</html>",
  "keywordsNotAdded": [
    { "keyword": "Terraform", "reason": "No supporting experience in history" }
  ]
}
```

**Constraints**:
- Must return the complete HTML, not a diff or partial snippet
- Must not add new roles, companies, or dates that don't exist in the template
- Keywords must be woven in naturally — no keyword-stuffing
- **Modify only text node content** — do not add, remove, rename, or reorder HTML tags, CSS classes, IDs, inline styles, or attributes. The HTML structure must be identical to the input except for text content.
- Pure JSON only — no commentary outside the object

**Post-processing guard (in agent `.ts`, not in prompt)** — implement when the agent `.ts` task runs:
After parsing the JSON response, the agent code must verify structural integrity before returning:
```ts
const extractTagSequence = (html: string) =>
  [...html.matchAll(/<([a-z][^\s/>]*)/gi)].map(m => m[1]).join(',');

if (extractTagSequence(input.cvTemplate) !== extractTagSequence(result.updatedCvHtml)) {
  throw new Error('rewrite-resume: HTML structure was modified by the model');
}
```

---

### 3. `ats-scanner.md`

**Source**: `.claude/agents/application-tracking-system.md`

**Adapt**: The agent already has the right ATS focus (parsing issues, formatting problems, structural checks, HTML-specific rules). Replace the markdown report format with the JSON output contract. Add `cvLanguage` and `jobDescription` as inputs. Add language rule: if `cvLanguage` does not match the target language implied by the job description keywords, include a language mismatch entry in `problemAreas`. Remove the `new-cvs/` file-read instruction — the CV HTML is passed directly in the user message.

**Output**:
```json
{
  "atsScore": 85,
  "problemAreas": [
    "Skills section uses non-standard header 'Tech Stack' — prefer 'Skills'",
    "Date format inconsistency: mix of 'Jan 2023' and '2023-01'"
  ]
}
```

**Constraints**:
- `atsScore` must be 0–100 integer
- `problemAreas` must be 0–10 items; empty array `[]` if no issues
- Each problem area must be a concrete, actionable observation (not generic advice)
- Pure JSON only — no commentary outside the object

---

### 4. `verifier.md`

**Source**: `.claude/skills/create-cv/SKILL.md` — Step 4 "Verify Accuracy"

**Adapt**: The skill's Step 4 is a brief 3-bullet description ("re-read history, verify no fabrication, flag discrepancies"). Expand this into a full system prompt with role, detailed task instructions, and a JSON output contract. The core rule from the skill — "never lie or fabricate" — must be the central constraint. Add language rule: do not flag a claim as fabricated solely because it is phrased differently due to language/translation differences; compare meaning, not literal strings.

**Output**:
```json
{
  "verifiedCv": "<html>...</html>",
  "flaggedClaims": [
    "Claim 'Led team of 12 engineers' not supported — history says 'contributed to team projects'",
    "Python listed as primary language — history shows JavaScript-primary background"
  ]
}
```

**Constraints**:
- `flaggedClaims` is empty array `[]` if nothing is suspicious
- Do NOT remove claims silently — either keep them and flag, or soften them and flag
- `verifiedCv` must be the complete HTML of the final CV
- Pure JSON only — no commentary outside the object

---

## Evaluation Strategy

### What "good" looks like for each prompt

| Agent | Green | Red |
|---|---|---|
| hiring-manager | matchScore correlates with obvious fit/mismatch; keywords are verbatim from JD | Hallucinated keywords; score 100 for clearly weak match |
| rewrite-resume | All missing keywords appear in output HTML; no new jobs/companies invented | Keyword-stuffed; changed dates or company names; truncated HTML |
| ats-scanner | Detects known formatting issues (tables, non-standard headers); score < 100 for imperfect CVs | Score 100 for CVs with clear problems; vague problem descriptions |
| verifier | Flags metrics not in history; returns clean CV if history matches | Passes fabricated claims; silently removes content |

---

### Test Fixtures (files to create under `server/src/__tests__/fixtures/`)

#### CV Template Research Step (do this before writing fixtures)

Before creating the CV template fixtures, search the web for real HTML resume/CV design patterns. Look for designs that differ structurally — not just visually — so the structure-preservation test is meaningful:

```
WebSearch queries to run:
- "html css resume template single column"
- "html resume template two column sidebar"
- "html cv template timeline design"
- "html resume template skills grid table layout"
```

Pick 3 designs that differ in their HTML skeleton:
- one uses `<table>` for layout
- one uses CSS Grid / flexbox `<div>` columns
- one uses a single-column `<section>` list

The `hebrew-cv.html` can reuse whichever structure `base-cv.html` uses — same skeleton, translated text.

```
fixtures/
├── job-descriptions/
│   ├── sre-role.txt               # Cloud/infra-heavy JD with Kubernetes, SLOs, oncall
│   ├── fullstack-role.txt         # React + Node + PostgreSQL JD
│   └── ml-engineer-role.txt       # Python, PyTorch, MLOps JD
├── cv-templates/
│   ├── single-column-cv.html      # Design A: single <section> list, no sidebar
│   ├── two-column-cv.html         # Design B: CSS grid with sidebar (skills left, experience right)
│   ├── table-layout-cv.html       # Design C: <table>-based layout (tests ATS table detection)
│   └── hebrew-cv.html             # Design A structure, content translated to Hebrew
├── histories/
│   └── candidate-history.md       # Shared candidate history — same person across all templates
└── expected-outputs/
    ├── hiring-manager-sre.json         # Expected matchScore range + required keywords present
    ├── hiring-manager-fullstack.json
    ├── hiring-manager-ml-engineer.json # Third axis of variation: Python/PyTorch/MLOps role
    ├── hiring-manager-hebrew.json      # cvLanguage must be "he"; missingKeywords still in English
    └── verifier-flagged.json           # Claims that MUST be flagged given weak history
```

---

### Test Types

#### 1. Unit-style prompt smoke tests (manual, in `server/src/__tests__/prompts/`)

Run each prompt against one fixture, assert the JSON shape is valid and Zod schema passes. No assertion on exact values — only structure.

```ts
// Example: hiring-manager.smoke.test.ts
it('returns valid JSON matching HiringManagerOutput schema', async () => {
  const result = await runAgent('hiring-manager', {
    jobDescription: fixtures.sreRole,
    cvTemplate: fixtures.baseCv,
    history: fixtures.candidateHistory,
  });
  expect(() => HiringManagerOutputSchema.parse(result)).not.toThrow();
});
```

#### 2. Semantic evaluation tests (LLM-as-judge, opt-in)

These are not run in CI by default — they use a second LLM call to evaluate quality. Run with `TEST_EVAL=true`.

```ts
// hiring-manager.eval.test.ts
it('keywords are present in job description', async () => {
  const result = await runAgent('hiring-manager', { ... });
  for (const keyword of result.missingKeywords) {
    expect(fixtures.sreRole.toLowerCase()).toContain(keyword.toLowerCase());
  }
});

it('ml-engineer role: keywords are present in job description', async () => {
  const result = await runAgent('hiring-manager', {
    jobDescription: fixtures.mlEngineerRole,
    cvTemplate: fixtures.singleColumnCv,
    history: fixtures.candidateHistory,
  });
  HiringManagerOutputSchema.parse(result);
  for (const keyword of result.missingKeywords) {
    expect(fixtures.mlEngineerRole.toLowerCase()).toContain(keyword.toLowerCase());
  }
});
```

#### 3. Contract tests (always in CI)

Assert the output shape exactly matches the Zod schema that the agent code uses. These act as a regression guard if the prompt drifts and starts adding extra fields or changing types.

#### 4. HTML structure preservation test (smoke, always in CI — depends on agent `.ts` implementation)

> This test will fail until `rewrite-resume.ts` and `verifier.ts` implement the `extractTagSequence` post-processing guard. Gate it in CI with a skip condition until the agent implementation task is complete.

Runs Agent 2 against all 3 different HTML designs and asserts the tag sequence is unchanged. This catches the model restructuring the HTML regardless of which design pattern it receives.

```ts
// html-structure.smoke.test.ts
const extractTagSequence = (html: string) =>
  [...html.matchAll(/<([a-z][^\s/>]*)/gi)].map(m => m[1]).join(',');

const designs = [
  { name: 'single-column', template: fixtures.singleColumnCv },
  { name: 'two-column',    template: fixtures.twoColumnCv },
  { name: 'table-layout',  template: fixtures.tableLayoutCv },
];

for (const { name, template } of designs) {
  it(`preserves HTML tag structure for ${name} design`, async () => {
    const result = await runAgent('rewrite-resume', {
      missingKeywords: ['PostgreSQL', 'CI/CD', 'REST APIs'],
      cvTemplate: template,
      cvLanguage: 'en',
    });
    RewriteResumeOutputSchema.parse(result);
    expect(extractTagSequence(result.updatedCvHtml)).toBe(extractTagSequence(template));
  });
}
```

Also applies to Agent 4 (`verifier`) — it returns `verifiedCv` which must preserve structure too:

```ts
it('verifier preserves HTML tag structure', async () => {
  const result = await runAgent('verifier', {
    updatedCvHtml: fixtures.twoColumnCv,
    history: fixtures.candidateHistory,
    cvLanguage: 'en',
  });
  VerifierOutputSchema.parse(result);
  expect(extractTagSequence(result.verifiedCv)).toBe(extractTagSequence(fixtures.twoColumnCv));
});
```

#### 5. Non-English CV scenario test (smoke, always in CI)

This tests the full language-threading contract across all 4 agents using `hebrew-cv.html` + `fullstack-role.txt`.

```ts
// language.smoke.test.ts
it('Agent 1 detects Hebrew CV and sets cvLanguage="he"', async () => {
  const result = await runAgent('hiring-manager', {
    jobDescription: fixtures.fullstackRole,
    cvTemplate: fixtures.hebrewCv,
    history: fixtures.candidateHistory,
  });
  HiringManagerOutputSchema.parse(result);
  expect(result.cvLanguage).toBe('he');
});

it('Agent 2 preserves Hebrew in rewritten CV', async () => {
  const result = await runAgent('rewrite-resume', {
    missingKeywords: ['PostgreSQL', 'CI/CD', 'REST APIs'],
    cvTemplate: fixtures.hebrewCv,
    cvLanguage: 'he',
  });
  RewriteResumeOutputSchema.parse(result);
  // HTML must still contain Hebrew characters
  expect(result.updatedCvHtml).toMatch(/[\u0590-\u05FF]/);
});

it('Agent 3 flags language mismatch when CV is Hebrew and JD is English', async () => {
  const result = await runAgent('ats-scanner', {
    updatedCvHtml: fixtures.hebrewCv,
    cvLanguage: 'he',
    jobDescription: fixtures.fullstackRole,
  });
  AtsScannerOutputSchema.parse(result);
  const hasLanguageFlag = result.problemAreas.some(p =>
    p.toLowerCase().includes('language')
  );
  expect(hasLanguageFlag).toBe(true);
});

it('Agent 4 does not flag Hebrew phrasing as fabrication', async () => {
  const result = await runAgent('verifier', {
    updatedCvHtml: fixtures.hebrewCv,
    history: fixtures.candidateHistory,
    cvLanguage: 'he',
  });
  VerifierOutputSchema.parse(result);
  // Should not flag claims that exist in history just because they're in Hebrew
  expect(result.flaggedClaims.length).toBe(0);
});
```

#### 5. Adversarial inputs (manual QA)

| Input | What to check |
|---|---|
| Job description in a foreign language | Model still returns valid JSON, doesn't crash |
| CV template with `<script>` tags | verifier doesn't execute or echo scripts |
| Empty history (`""`) | verifier returns empty `flaggedClaims`, not an error |
| 10,000-word job description | Model doesn't truncate output JSON |
| RTL language CV (Hebrew/Arabic) | Agent 2 HTML output preserves RTL text direction |

---

## Implementation Order

1. **Search the web** for 3 structurally different HTML resume designs (single-column, two-column sidebar, table-based) — pick real open-source templates
2. Write CV template fixtures: adapt the 3 designs with the same candidate content (`candidate-history.md` as source); create `hebrew-cv.html` as a translated copy of the single-column design
3. Write job description fixtures: `sre-role.txt`, `fullstack-role.txt`, `ml-engineer-role.txt` (can be realistic synthetic content)
4. Write `hiring-manager.md` — simplest input/output, good for calibrating JSON-only behavior
5. Write smoke test for hiring-manager (validates approach works before writing remaining 3)
6. Write `rewrite-resume.md`, `ats-scanner.md`, `verifier.md` in pipeline order
7. Write smoke tests for remaining 3
8. Write semantic eval tests for hiring-manager and verifier (highest risk of hallucination), including ml-engineer eval test
9. Document prompt iteration notes in `prompts/CHANGELOG.md` as prompts are tuned

---

## Files to Create

| File | Purpose |
|---|---|
| `server/src/prompts/hiring-manager.md` | Agent 1 system prompt |
| `server/src/prompts/rewrite-resume.md` | Agent 2 system prompt |
| `server/src/prompts/ats-scanner.md` | Agent 3 system prompt |
| `server/src/prompts/verifier.md` | Agent 4 system prompt |
| `server/src/__tests__/fixtures/job-descriptions/sre-role.txt` | Test fixture |
| `server/src/__tests__/fixtures/job-descriptions/fullstack-role.txt` | Test fixture |
| `server/src/__tests__/fixtures/job-descriptions/ml-engineer-role.txt` | Test fixture |
| `server/src/__tests__/fixtures/expected-outputs/hiring-manager-ml-engineer.json` | Expected output for ml-engineer eval test |
| `server/src/__tests__/fixtures/cv-templates/single-column-cv.html` | Test fixture — Design A: single `<section>` list (source from web search) |
| `server/src/__tests__/fixtures/cv-templates/two-column-cv.html` | Test fixture — Design B: CSS grid sidebar (source from web search) |
| `server/src/__tests__/fixtures/cv-templates/table-layout-cv.html` | Test fixture — Design C: `<table>`-based layout (source from web search) |
| `server/src/__tests__/fixtures/cv-templates/hebrew-cv.html` | Test fixture — Design A structure, content in Hebrew |
| `server/src/__tests__/fixtures/histories/candidate-history.md` | Test fixture |
| `server/src/__tests__/prompts/hiring-manager.smoke.test.ts` | Smoke test |
| `server/src/__tests__/prompts/rewrite-resume.smoke.test.ts` | Smoke test |
| `server/src/__tests__/prompts/ats-scanner.smoke.test.ts` | Smoke test |
| `server/src/__tests__/prompts/verifier.smoke.test.ts` | Smoke test |
| `server/src/__tests__/prompts/html-structure.smoke.test.ts` | HTML structure preservation — all 3 designs + verifier |
| `server/src/__tests__/prompts/language.smoke.test.ts` | Non-English CV scenario — all 4 agents |

---

## Out of Scope for This Plan

- Implementing agent `.ts` files (separate task per `server-tasks-05-03-26.md`)
- Auth middleware, orchestrator, pipeline route
- Prompt versioning / A/B testing infrastructure
