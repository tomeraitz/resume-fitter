# Server Implementation Plan

> Status as of 2026-03-06. Based on: `server-tasks-05-03-26.md`, `project-structure.md`, and a full read of all existing server files.

---

## Current State

| File | Status |
|---|---|
| `src/agents/hiring-manager.ts` | Stub — throws "Not implemented" |
| `src/agents/rewrite-resume.ts` | Stub — throws "Not implemented" |
| `src/agents/ats-scanner.ts` | Stub — throws "Not implemented" |
| `src/agents/verifier.ts` | Stub — throws "Not implemented" |
| `src/agents/orchestrator.ts` | Stub — throws "Not implemented" |
| `src/routes/pipeline.ts` | Stub — returns 501 |
| `src/middleware/auth.ts` | Stub — just calls `next()` |
| `src/services/model.service.ts` | **Done** — full retry/fallback logic |
| `tests/model.service.test.ts` | **Done** — comprehensive unit tests |
| `tests/prompts/*.smoke.test.ts` | **Done** — call model directly via `runAgent()` |

---

## Schema / Interface Mismatches to Fix First

Before implementing agents, align the TypeScript interfaces with the Zod schemas in `tests/prompts/schemas.ts`:

| Agent | Current interface | Required (from schema) |
|---|---|---|
| `hiring-manager.ts` | `{ matchScore, missingKeywords }` | `{ matchScore, cvLanguage, missingKeywords, summary }` |
| `rewrite-resume.ts` | `{ updatedCvHtml }` | `{ updatedCvHtml, keywordsNotAdded: { keyword, reason }[] }` |
| `ats-scanner.ts` | `{ atsScore, problemAreas }` | same — OK |
| `verifier.ts` | `{ verifiedCv, flaggedClaims }` | same — OK |

Also update `PipelineResponse.finalCv` source: comes from `verifier.verifiedCv`.

---

## Implementation Order

### Step 1 — Fix output interfaces

Delete the hand-written `HiringManagerOutput` and `RewriteResumeOutput` interfaces. Define the Zod schema first, then derive the TypeScript type from it — one source of truth, no drift:

```ts
const HiringManagerOutputSchema = z.object({
  matchScore: z.number(),
  cvLanguage: z.string(),
  missingKeywords: z.array(z.string()),
  summary: z.string(),
});
export type HiringManagerOutput = z.infer<typeof HiringManagerOutputSchema>;
```

Do the same for `RewriteResumeOutput`.

### Step 2 — Implement the 4 agents

Each agent follows the same pattern:

```ts
// 1. Load prompt (once per module, at top level — not per call)
const systemPrompt = readFileSync(
  join(import.meta.dirname, '../prompts/<agent>.md'), 'utf8'
);

// 2. Build Zod schema (inline or imported from a shared location)
const OutputSchema = z.object({ ... });

// 3. Export function
export async function run<Agent>(modelService, ...inputs): Promise<Output> {
  const userPrompt = JSON.stringify({ ...inputs });
  const raw = await modelService.complete(systemPrompt, userPrompt);
  const text = raw.replace(/^```(?:json)?\s*/i, '').replace(/\s*```\s*$/i, '').trim();
  const parsed = JSON.parse(text);             // throws SyntaxError on bad JSON
  return OutputSchema.parse(parsed);           // throws ZodError on schema mismatch
}
```

Agent-specific inputs and function signatures:

| Agent | Function signature | `userPrompt` fields |
|---|---|---|
| `hiring-manager` | `runHiringManager(modelService, jobDescription, cvTemplate, history)` | `{ jobDescription, cvTemplate, history }` |
| `rewrite-resume` | `runRewriteResume(modelService, missingKeywords, cvTemplate, cvLanguage)` | `{ missingKeywords, cvTemplate, cvLanguage }` |
| `ats-scanner` | `runAtsScanner(modelService, updatedCvHtml)` | `{ updatedCvHtml }` |
| `verifier` | `runVerifier(modelService, updatedCvHtml, history)` | `{ updatedCvHtml, history }` |

> Note: `rewrite-resume` requires `cvLanguage` as a 4th parameter — sourced from `hm.cvLanguage` in the orchestrator. The existing stub is missing this parameter and must be updated.

### Step 3 — Implement orchestrator

Wire the 4 agents sequentially. Pass only what each agent needs:

```ts
export async function runPipeline(request: PipelineRequest): Promise<PipelineResponse> {
  const steps: AgentResult[] = [];

  // Step 1
  const t1 = Date.now();
  const hm = await runHiringManager(modelService, request.jobDescription, request.cvTemplate, request.history);
  steps.push({ step: 1, name: 'hiring-manager', output: hm, durationMs: Date.now() - t1 });

  // Step 2
  const t2 = Date.now();
  const rr = await runRewriteResume(modelService, hm.missingKeywords, request.cvTemplate, hm.cvLanguage);
  steps.push({ step: 2, name: 'rewrite-resume', output: rr, durationMs: Date.now() - t2 });

  // Step 3
  const t3 = Date.now();
  const ats = await runAtsScanner(modelService, rr.updatedCvHtml);
  steps.push({ step: 3, name: 'ats-scanner', output: ats, durationMs: Date.now() - t3 });

  // Step 4
  const t4 = Date.now();
  const v = await runVerifier(modelService, rr.updatedCvHtml, request.history);
  steps.push({ step: 4, name: 'verifier', output: v, durationMs: Date.now() - t4 });

  return { steps, finalCv: v.verifiedCv };
}
```

### Step 4 — Implement pipeline route

```ts
import { z } from 'zod';
import { requireAuth } from '../middleware/auth.js';
import { rateLimiter } from '../middleware/rateLimit.js';
import { runPipeline } from '../agents/orchestrator.js';

const PipelineRequestSchema = z.object({
  jobDescription: z.string().min(1).max(50_000),
  cvTemplate: z.string().min(1).max(100_000),
  // history is optional — first-ever call has no prior history
  history: z.string().max(100_000).optional(),
});

// Note: ensure express.json({ limit: '512kb' }) in index.ts to accommodate
// cvTemplate + history combined payload (default 256kb is too small).

pipelineRouter.post('/', requireAuth, rateLimiter, async (req, res) => {
  const parsed = PipelineRequestSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Invalid request', details: parsed.error.issues });
    return;
  }
  try {
    const result = await runPipeline(parsed.data);
    res.json(result);
  } catch (err) {
    // Categorize errors — never leak raw messages or user content
    if (err instanceof SyntaxError) {
      res.status(502).json({ error: 'Model returned invalid JSON' });
      return;
    }
    if (err instanceof ZodError) {
      res.status(502).json({ error: 'Model returned unexpected schema' });
      return;
    }
    res.status(500).json({ error: 'Pipeline failed' });
  }
});
```

### Step 5 — Implement auth middleware

Add `SESSION_SECRET` startup validation to `index.ts` before `app.listen()`:

```ts
// index.ts — add before app.listen()
if (!process.env['SESSION_SECRET']) {
  console.error('[server] FATAL: SESSION_SECRET env var is required');
  process.exit(1);
}
```

Add Express type extension so `req.user` is typed without `any`:

```ts
// src/types/express.d.ts
import type { JwtPayload } from 'jsonwebtoken';

declare global {
  namespace Express {
    interface Request {
      user?: string | JwtPayload;
    }
  }
}
```

Then implement auth middleware:

```ts
import jwt from 'jsonwebtoken';

export function requireAuth(req, res, next) {
  const authHeader = req.headers['authorization'];
  if (!authHeader?.startsWith('Bearer ')) {
    res.status(401).json({ error: 'Missing or malformed Authorization header' });
    return;
  }
  const token = authHeader.slice(7);
  const secret = process.env['SESSION_SECRET']!; // guaranteed by startup check
  try {
    // Pin algorithm to prevent alg:none attacks
    const payload = jwt.verify(token, secret, { algorithms: ['HS256'] });
    req.user = payload;
    next();
  } catch {
    res.status(401).json({ error: 'Invalid or expired token' });
  }
}
```

---

## Tests

### Unit tests — agents (`tests/agents/*.test.ts`)

For each agent: mock `modelService.complete()`, test happy path, bad JSON, and Zod validation failure.

```
tests/agents/
  hiring-manager.test.ts
  rewrite-resume.test.ts
  ats-scanner.test.ts
  verifier.test.ts
```

Pattern:

> Agents use dependency injection — **no `vi.mock` needed**. Create a typed mock object directly, matching `complete(systemPrompt, userPrompt): Promise<string>`.

```ts
import { vi, describe, it, expect, beforeEach } from 'vitest';
import type { ModelService } from '../../src/services/model.service.js';
import { runHiringManager } from '../../src/agents/hiring-manager.js';

const mockComplete = vi.fn<[string, string], Promise<string>>();
const mockService = { complete: mockComplete } as unknown as ModelService;

beforeEach(() => {
  mockComplete.mockReset();
});

it('parses a valid response', async () => {
  mockComplete.mockResolvedValueOnce(JSON.stringify({ matchScore: 82, cvLanguage: 'en', missingKeywords: ['k1'], summary: 's' }));
  const result = await runHiringManager(mockService, 'job', 'cv', 'hist');
  expect(result.matchScore).toBe(82);
});

it('throws on invalid JSON', async () => {
  mockComplete.mockResolvedValueOnce('not json');
  await expect(runHiringManager(mockService, 'job', 'cv', 'hist')).rejects.toThrow(SyntaxError);
});

it('throws ZodError when schema does not match', async () => {
  mockComplete.mockResolvedValueOnce(JSON.stringify({ matchScore: 'bad' }));
  await expect(runHiringManager(mockService, 'job', 'cv', 'hist')).rejects.toThrow();
});
```

### Unit tests — orchestrator (`tests/agents/orchestrator.test.ts`)

Mock all 4 agent functions. Verify:
- Agents called in order with correct inputs
- `steps` array has 4 items with correct `step` values and `durationMs >= 0`
- `finalCv` equals `verifier.verifiedCv`
- Rejects when any agent throws (pipeline fails fast)

### Unit tests — pipeline route (`tests/routes/pipeline.test.ts`)

Use `supertest` against the Express app. Mock `runPipeline` and `requireAuth`.

Test cases:
- `POST /pipeline` with valid body → 200 + PipelineResponse shape
- Missing `jobDescription` → 400 with error details
- `cvTemplate` too long → 400
- `runPipeline` throws → 500 with `{ error, message }`
- No Bearer token → 401 (integration with real auth middleware)
- Expired JWT → 401

### Unit tests — auth middleware (`tests/middleware/auth.test.ts`)

Mock `req/res/next` directly. Test:
- Valid JWT → calls `next()` and attaches `req.user`
- Missing header → 401
- Invalid token → 401
- `SESSION_SECRET` not set → 500

### Updating `test:eval` smoke tests

The current smoke tests in `tests/prompts/` call `runAgent()` (a helper that calls `modelService.complete()` directly). After the agents are implemented, **update `test-utils.ts`** to call the actual agent functions instead:

```ts
// tests/prompts/test-utils.ts  (updated)
import { runHiringManager } from '../../src/agents/hiring-manager.js';
import { runRewriteResume } from '../../src/agents/rewrite-resume.js';
// ...

type AgentName = 'hiring-manager' | 'rewrite-resume' | 'ats-scanner' | 'verifier';
const agentMap: Record<AgentName, (inputs: Record<string, unknown>) => Promise<unknown>> = {
  'hiring-manager': (inputs) => runHiringManager(modelService, inputs['jobDescription'] as string, inputs['cvTemplate'] as string, inputs['history'] as string | undefined),
  'rewrite-resume': (inputs) => runRewriteResume(modelService, inputs['missingKeywords'] as string[], inputs['cvTemplate'] as string, inputs['cvLanguage'] as string),
  'ats-scanner': (inputs) => runAtsScanner(modelService, inputs['updatedCvHtml'] as string),
  'verifier': (inputs) => runVerifier(modelService, inputs['updatedCvHtml'] as string, inputs['history'] as string | undefined),
};

export async function runAgent(agentName: AgentName, inputs: Record<string, unknown>) {
  return agentMap[agentName](inputs);
}
```

This makes the smoke/eval tests exercise the real agent code (prompt loading + Zod parsing), not just raw model responses.

Also add a `test:eval` script variant for the orchestrator end-to-end:

```ts
// tests/prompts/orchestrator.smoke.test.ts
describeIf(RUN)('orchestrator — end-to-end smoke test', () => {
  it('runs all 4 agents and returns PipelineResponse shape', async () => {
    const result = await runPipeline({ jobDescription, cvTemplate, history });
    expect(result.steps).toHaveLength(4);
    expect(result.finalCv).toBeTruthy();
    expect(result.steps.every(s => s.durationMs >= 0)).toBe(true);
  });
});
```

---

## Files to Create / Modify

| Action | File |
|---|---|
| Modify | `src/agents/hiring-manager.ts` — fix interface + implement |
| Modify | `src/agents/rewrite-resume.ts` — fix interface + implement |
| Modify | `src/agents/ats-scanner.ts` — implement |
| Modify | `src/agents/verifier.ts` — implement |
| Modify | `src/agents/orchestrator.ts` — implement |
| Modify | `src/routes/pipeline.ts` — Zod validation + auth + orchestrator call |
| Modify | `src/middleware/auth.ts` — JWT verify with `algorithms: ['HS256']` |
| Modify | `src/index.ts` — add `SESSION_SECRET` startup validation + raise body limit to `512kb` |
| Create | `src/types/express.d.ts` — typed `req.user` extension |
| Modify | `tests/prompts/test-utils.ts` — call real agents instead of raw modelService |
| Create | `tests/agents/hiring-manager.test.ts` |
| Create | `tests/agents/rewrite-resume.test.ts` |
| Create | `tests/agents/ats-scanner.test.ts` |
| Create | `tests/agents/verifier.test.ts` |
| Create | `tests/agents/orchestrator.test.ts` |
| Create | `tests/routes/pipeline.test.ts` |
| Create | `tests/middleware/auth.test.ts` |
| Create | `tests/prompts/orchestrator.smoke.test.ts` |

---

## Notes

- Prompt files already exist in `src/prompts/*.md` — agents just need to `readFileSync` them.
- `ModelService` is already instantiated once in `orchestrator.ts` at module load — do not instantiate again in individual agents; pass it as a parameter (already done in stubs).
- Keep Zod schemas colocated in each agent file (not in the test schemas file) — the test schemas can import from the agent or duplicate for test isolation.
- Add `supertest` and `@types/supertest` to `devDependencies` before implementing `tests/routes/pipeline.test.ts`.
- `ZodError` must be imported in `pipeline.ts` for the catch block error categorization to work.
