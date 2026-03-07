# Plan: Chat — User-Driven CV Changes

> Created: 2026-03-07. Based on: `server-tasks-07-03-26.md`, full read of existing server source, and established patterns from `server-implementation-plan.md`.

---

## Goal

After the pipeline produces a CV, the user can send follow-up messages ("make it shorter", "emphasize DevOps skills") to iteratively refine the CV text. Changes are text-only — the HTML structure must never change — and the verifier is the quality gate that enforces honesty constraints, exactly as it does in the pipeline.

---

## Architecture Overview

```
POST /chat
  └─ requireAuth + rateLimiter
      └─ ChatRequestSchema (Zod)
          └─ runCvChat(modelService, userMessage, currentCv, history?)
          │     └─ applies the user's instruction, flags things it refused
          │
          └─ runVerifier(modelService, chatResult.updatedCvHtml, history?)
                └─ same quality gate as after the pipeline
                └─ catches any accuracy issues the chat agent introduced

  Response: {
    updatedCvHtml: verifierResult.verifiedCv,
    flaggedClaims: [...chatResult.flaggedClaims, ...verifierResult.flaggedClaims]
  }
```

The verifier is **reused as-is** — its prompt and rules are not duplicated. The cv-chat agent is only responsible for applying the user's instruction; the verifier is responsible for enforcing honesty and HTML integrity.

---

## New Files

| File | Purpose |
|---|---|
| `src/prompts/cv-chat.md` | System prompt for the chat agent (instruction-following only) |
| `src/agents/cv-chat.ts` | Agent function `runCvChat` |
| `src/routes/chat.ts` | `POST /chat` Express route — calls `runCvChat` then `runVerifier` |
| `src/types/chat.types.ts` | `ChatRequestSchema` (Zod) + inferred `ChatRequest` type + `ChatResponse` interface |
| `tests/agents/cv-chat.test.ts` | Unit tests for `runCvChat` |
| `tests/routes/chat.test.ts` | Route-level tests with supertest |
| `tests/prompts/cv-chat.smoke.test.ts` | Smoke / eval test against a real model |

---

## Modified Files

| File | Change |
|---|---|
| `src/index.ts` | Mount `chatRouter` at `/chat` |

---

## Step-by-Step Implementation

### Step 1 — Types (`src/types/chat.types.ts`)

`ChatRequestSchema` lives here so the route can import it and types are derived from a single source of truth (no hand-written interface that can drift).

```ts
import { z } from 'zod';

export const ChatRequestSchema = z.object({
  message: z.string().min(1).max(10_000),
  currentCv: z.string().min(1).max(100_000),
  history: z.string().max(100_000).optional(),
});

export type ChatRequest = z.infer<typeof ChatRequestSchema>;

export interface ChatResponse {
  updatedCvHtml: string;
  flaggedClaims: string[];
}
```

### Step 2 — Prompt (`src/prompts/cv-chat.md`)

The cv-chat prompt is narrowly scoped: **apply the user's instruction**. It does not enforce honesty rules — that is the verifier's job. It only flags things it explicitly refused to do (e.g., the user asked to add a skill not in history, so it left that section unchanged and flagged it).

**Role**: You are a CV text editor. You apply the user's instruction to modify the CV text.

**Input** (user message JSON):
```json
{ "userMessage": "...", "currentCv": "<html>...", "history": "..." }
```

**Rules the prompt must enforce:**

1. **HTML structure is frozen** — same tags, same order, same nesting, same attributes. Only text node content may change. Never add, remove, rename, or reorder any HTML elements, CSS classes, IDs, inline styles, or attributes.
2. **Apply the instruction faithfully** — condensing text, adjusting tone, substituting synonyms, reordering emphasis within existing sentences are all allowed.
3. **Do not fabricate** — if the instruction asks to add a skill, metric, or experience not present in the history, leave that part of the CV unchanged and flag the refused instruction.
4. **Do not silently delete** — do not remove bullet points, sentences, or sections. If the instruction cannot be applied without deletion, flag it and leave the content unchanged.
5. **Flag only what you refused** — you are not the final accuracy auditor. A separate verifier will check the result. Only flag instructions you chose not to apply.

**Output contract** (pure JSON, no markdown fences):
```json
{
  "updatedCvHtml": "<html>...(full HTML)...</html>",
  "flaggedClaims": [
    "User asked to add 'Kubernetes expert' — not found in history; left unchanged"
  ]
}
```

`flaggedClaims` is empty `[]` when all instructions were applied. The verifier will add its own flags on top.

### Step 3 — Agent (`src/agents/cv-chat.ts`)

Follows the exact same pattern as all other agents:

```ts
import { readFileSync } from 'fs';
import { join } from 'path';
import { z } from 'zod';
import type { ModelService } from '../services/model.service.js';

const systemPrompt = readFileSync(
  join(import.meta.dirname, '../prompts/cv-chat.md'),
  'utf8',
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
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```\s*$/i, '')
    .trim();
  const parsed: unknown = JSON.parse(text);
  return CvChatOutputSchema.parse(parsed);
}
```

### Step 4 — Route (`src/routes/chat.ts`)

The route calls `runCvChat` then `runVerifier` sequentially. The verifier receives the chat agent's output CV. Final `flaggedClaims` merges both agents' flags.

```ts
import { Router } from 'express';
import { ZodError } from 'zod';
import { APICallError } from 'ai';
import { requireAuth } from '../middleware/auth.js';
import { rateLimiter } from '../middleware/rateLimit.js';
import { ModelService } from '../services/model.service.js';
import { runCvChat } from '../agents/cv-chat.js';
import { runVerifier } from '../agents/verifier.js';
import { ChatRequestSchema, type ChatResponse } from '../types/chat.types.js';

export const chatRouter = Router();

// Instantiated once at module load — same pattern as orchestrator.ts
const modelService = new ModelService();

chatRouter.post('/', requireAuth, rateLimiter, async (req, res) => {
  const parsed = ChatRequestSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Invalid request', details: parsed.error.issues });
    return;
  }

  const { message, currentCv, history } = parsed.data;

  try {
    // Step 1: apply user instruction
    const chatResult = await runCvChat(modelService, message, currentCv, history);

    // Step 2: verify the edited CV (same quality gate as the pipeline)
    const verifierResult = await runVerifier(modelService, chatResult.updatedCvHtml, history);

    res.json({
      updatedCvHtml: verifierResult.verifiedCv,
      flaggedClaims: [...chatResult.flaggedClaims, ...verifierResult.flaggedClaims],
    } satisfies ChatResponse);
  } catch (err) {
    if (err instanceof SyntaxError) {
      res.status(502).json({ error: 'Model returned invalid JSON' });
      return;
    }
    if (err instanceof ZodError) {
      res.status(502).json({ error: 'Model returned unexpected schema' });
      return;
    }
    if (err instanceof APICallError && err.isRetryable) {
      res.status(503).json({ error: 'Service temporarily unavailable' });
      return;
    }
    res.status(500).json({ error: 'Chat agent failed' });
  }
});
```

### Step 5 — Wire route in `src/index.ts`

Add alongside the pipeline route:

```ts
import { chatRouter } from './routes/chat.js';
import './routes/chat.js'; // eagerly load so ModelService validates env at startup
// ...
app.use('/chat', chatRouter);
```

---

## Tests

### Unit — Agent (`tests/agents/cv-chat.test.ts`)

Tests only `runCvChat` in isolation. The verifier is tested separately in `verifier.test.ts`.

**Test cases:**

| # | Scenario | Mock returns | Expected |
|---|---|---|---|
| 1 | Happy path — no flags | valid JSON, empty `flaggedClaims` | parses correctly |
| 2 | Refused instruction flagged | valid JSON with 1 flagged claim | `flaggedClaims.length === 1` |
| 3 | History omitted | valid JSON | resolves without error |
| 4 | Bad JSON from model | `"not json"` | rejects with `SyntaxError` |
| 5 | Schema mismatch — `updatedCvHtml` is number | `JSON.stringify({ updatedCvHtml: 123 })` | rejects with `ZodError` |
| 6 | `flaggedClaims` not an array | `JSON.stringify({ updatedCvHtml: '<p/>', flaggedClaims: 'oops' })` | rejects with `ZodError` |
| 7 | Markdown-fenced JSON | ` ```json\n{...}\n``` ` | strips fences, parses correctly |

```ts
import { vi, describe, it, expect, beforeEach } from 'vitest';
import type { ModelService } from '../../src/services/model.service.js';
import { runCvChat } from '../../src/agents/cv-chat.js';

const mockComplete = vi.fn<(sys: string, user: string) => Promise<string>>();
const mockService = { complete: mockComplete } as unknown as ModelService;

beforeEach(() => mockComplete.mockReset());

describe('runCvChat', () => {
  it('happy path: returns parsed output', async () => {
    mockComplete.mockResolvedValueOnce(
      JSON.stringify({ updatedCvHtml: '<p>shorter</p>', flaggedClaims: [] })
    );
    const result = await runCvChat(mockService, 'make it shorter', '<p>long cv</p>');
    expect(result.updatedCvHtml).toBe('<p>shorter</p>');
    expect(result.flaggedClaims).toEqual([]);
  });

  it('surfaces flagged refused instruction', async () => {
    mockComplete.mockResolvedValueOnce(
      JSON.stringify({ updatedCvHtml: '<p>cv</p>', flaggedClaims: ['Cannot add Kubernetes — not in history'] })
    );
    const result = await runCvChat(mockService, 'add Kubernetes', '<p>cv</p>', 'history');
    expect(result.flaggedClaims).toHaveLength(1);
  });

  it('strips markdown fences', async () => {
    mockComplete.mockResolvedValueOnce(
      '```json\n' + JSON.stringify({ updatedCvHtml: '<p>cv</p>', flaggedClaims: [] }) + '\n```'
    );
    const result = await runCvChat(mockService, 'shorten', '<p>cv</p>');
    expect(result.updatedCvHtml).toBe('<p>cv</p>');
  });

  it('rejects with SyntaxError on bad JSON', async () => {
    mockComplete.mockResolvedValueOnce('not json');
    await expect(runCvChat(mockService, 'shorten', '<p>cv</p>')).rejects.toThrow(SyntaxError);
  });

  it('rejects with ZodError when updatedCv is wrong type', async () => {
    mockComplete.mockResolvedValueOnce(JSON.stringify({ updatedCvHtml: 123, flaggedClaims: [] }));
    await expect(runCvChat(mockService, 'shorten', '<p>cv</p>')).rejects.toThrow();
  });

  it('rejects with ZodError when flaggedClaims is not an array', async () => {
    mockComplete.mockResolvedValueOnce(JSON.stringify({ updatedCvHtml: '<p>cv</p>', flaggedClaims: 'bad' }));
    await expect(runCvChat(mockService, 'shorten', '<p>cv</p>')).rejects.toThrow();
  });
});
```

---

### Route — `tests/routes/chat.test.ts`

Uses supertest. Mocks `runCvChat`, `runVerifier`, `requireAuth`, and `rateLimiter`.

**Test cases:**

| # | Request / scenario | Expected |
|---|---|---|
| 1 | Valid body, both agents succeed | 200 + `{ updatedCvHtml, flaggedClaims }` with merged flags |
| 2 | Flags from chat and verifier are merged | `flaggedClaims` contains entries from both agents |
| 3 | Missing `message` | 400 + `{ error: 'Invalid request', details: [...] }` |
| 4 | Missing `currentCv` | 400 |
| 5 | `message` exceeds 10k chars | 400 |
| 6 | `currentCv` exceeds 100k chars | 400 |
| 7 | `runCvChat` throws generic Error | 500 + `{ error: 'Chat agent failed' }`, no raw message leaked |
| 8 | `runVerifier` throws generic Error | 500 + `{ error: 'Chat agent failed' }` |
| 9 | Either agent throws SyntaxError | 502 + `{ error: 'Model returned invalid JSON' }` |
| 10 | Either agent throws ZodError | 502 + `{ error: 'Model returned unexpected schema' }` |
| 11 | Either agent throws retryable `APICallError` | 503 + `{ error: 'Service temporarily unavailable' }` |
| 12 | No Bearer token (real `requireAuth`) | 401 |

```ts
// Mock both agents and middleware before importing the router
vi.mock('../../src/agents/cv-chat.js', () => ({ runCvChat: vi.fn() }));
vi.mock('../../src/agents/verifier.js', () => ({ runVerifier: vi.fn() }));
vi.mock('../../src/middleware/auth.js', () => ({
  requireAuth: (_req, _res, next) => next(),
}));
vi.mock('../../src/middleware/rateLimit.js', () => ({
  rateLimiter: (_req, _res, next) => next(),
}));
```

---

### Smoke / Eval — `tests/prompts/cv-chat.smoke.test.ts`

Runs only when `RUN_EVAL=true`. Calls real model through the **full two-agent flow** (chat → verifier) to confirm end-to-end behaviour.

**Test cases:**

| # | Instruction | Assertion |
|---|---|---|
| 1 | "Make it more concise" | `updatedCvHtml` is a non-empty string, `flaggedClaims` is an array |
| 2 | "Add Kubernetes as expert skill" (not in history) | `flaggedClaims.length > 0` (refused by chat agent or corrected by verifier) |
| 3 | "Emphasize the API work" | the sequence of element tag names in `updatedCvHtml` equals that of `sampleCv` (HTML structure unchanged — tag count alone is insufficient because a `<span>→<div>` swap would pass a count check) |

---

## Constraints Summary

| Constraint | Where enforced |
|---|---|
| HTML structure frozen | cv-chat prompt (apply edits) + verifier prompt (final check) |
| No fabrication | verifier prompt (quality gate) + cv-chat prompt (refuses fabrication before verifier sees it) |
| No silent removal | verifier prompt (quality gate) + cv-chat prompt |
| Flags merged from both agents | Route combines `chatResult.flaggedClaims + verifierResult.flaggedClaims` |
| Auth required | `requireAuth` middleware |
| Rate limited | `rateLimiter` middleware |
| No API key leak | `ModelService` reads from env; never returned in responses |
| Input validated | Zod on all fields before any agent is called |
| Errors categorized | SyntaxError → 502, ZodError → 502, retryable `APICallError` → 503, generic → 500; no raw message in body |

---

## Open Questions / Decisions

1. **Should `flaggedClaims` block the response?** No — return `updatedCv` + merged flags and let the client decide whether to surface them. Matches the pipeline's verifier behaviour.

2. **Separate `ModelService` instance in `chat.ts`?** Yes, same pattern as `orchestrator.ts` (instantiated once at module load). Could be a shared singleton later if startup time matters.

3. **Payload size limit** — `express.json({ limit: '512kb' })` already in `index.ts` comfortably covers `message` (10k) + `currentCv` (100k) + `history` (100k). No change needed.

4. **`history` is optional but its absence degrades verification quality** — if the client omits `history`, `JSON.stringify` will silently drop it and the verifier receives no ground truth to check claims against, making it nearly useless as an accuracy gate. `history` is technically optional (first chat turn before pipeline history is available), but callers should be aware that the verifier's honesty guarantees only hold when `history` is provided.
