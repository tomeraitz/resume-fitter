# LLM Optimization Plan

## Pipeline Overview (Current)

```
Step 1: Hiring Manager   → missingKeywords, cvLanguage
Step 2: Rewrite Resume   → updatedCvHtml
Step 3: ATS Scanner      → atsScore, problemAreas         ← does NOT fix HTML (bug)
Step 4: Verifier         → verifiedCv, flaggedClaims      ← uses Step 2 output, not Step 3
```

## Pipeline Overview (Target)

```
Step 1: Hiring Manager   → missingKeywords, cvLanguage
Step 2: Rewrite Resume   → updatedCvHtml
Step 3: ATS Scanner      → atsScore, problemAreas, updatedCvHtml  ← fixes ATS issues in HTML
Step 4: Verifier         → verifiedCv, flaggedClaims              ← uses Step 3 updatedCvHtml
```

---

## Task 1: Fix ATS Scanner — Output `updatedCvHtml`

**Priority**: High (correctness fix, not just optimization)
**Feature flag**: N/A — this is a correctness bug fix, always enabled

**Problem**: ATS Scanner detects HTML issues (tables, non-standard headers, hidden text, etc.) but returns only a report. The CV passed to the Verifier comes from Step 2 — meaning ATS issues are never corrected in the final output.

**Changes required**:

### `server/src/prompts/ats-scanner.md`
- Update system prompt to instruct the agent to return a corrected `updatedCvHtml` alongside the score and problem areas
- HTML fixes must address the detected `problemAreas` (e.g. replace tables with single-column layout, normalize section headers, remove hidden elements)
- Same constraints as rewrite-resume: preserve content, don't fabricate, keep language

### `server/src/agents/ats-scanner.ts`
- Add `updatedCvHtml: z.string()` to the Zod output schema
- Return `updatedCvHtml` from the agent function

### `server/src/agents/orchestrator.ts`
- Pass `atsScannerResult.updatedCvHtml` to `runVerifier()` instead of `rewriteResult.updatedCvHtml`

### `server/src/types/pipeline.types.ts`
- Update ATS Scanner result type to include `updatedCvHtml: string`

### Tests
- `tests/agents/ats-scanner.test.ts` — update mock output to include `updatedCvHtml`
- `tests/agents/orchestrator.test.ts` — assert Verifier receives `atsScannerResult.updatedCvHtml`, not `rewriteResult.updatedCvHtml`
- Use existing fixture `tests/fixtures/cv-templates/table-layout-cv.html` as the ATS-problematic CV input

---

## Task 2: Anthropic Prompt Caching

**Priority**: Medium (cost reduction)
**Feature flag**: `OPTIMIZATION_PROMPT_CACHING=true/false` (default: `false`)

**Problem**: System prompts are static `.md` files loaded fresh on every request. On Anthropic, this means full prompt tokens are billed each time even though the content never changes.

**Solution**: Add `cache_control: { type: "ephemeral" }` to the system prompt message in each `generateText()` call. Anthropic caches up to 4 breakpoints per request with a 5-minute TTL — warm cache reads cost ~10% of normal input token price.

**Changes required**:

### `server/src/services/model.service.ts`
- The caching logic must go in `attemptCompletion()` (not `complete()`), since that is where `generateText()` is called with the `system` param
- In `attemptCompletion()`, when `config.provider === 'anthropic'` AND `OPTIMIZATION_PROMPT_CACHING=true`, pass system prompt via `messages` array with `providerOptions: { anthropic: { cacheControl: { type: "ephemeral" } } }` instead of the `system` parameter
- For all other providers (openai, google, ollama), keep the existing `system` param — never apply caching
- `complete()` currently returns `string` only — it discards the `generateText` result object. To expose cache metrics for benchmarking, add a `completeWithMeta()` method (or change `complete()` to return `{ text: string; metadata?: unknown }`) so callers can read `result.experimental_providerMetadata?.anthropic`

**Prompt priority order** (largest first for max savings):
1. `rewrite-resume.md`
2. `ats-scanner.md`
3. `verifier.md`
4. `hiring-manager.md`
5. `cv-chat.md`

**A/B metric**: `cache_creation_input_tokens` vs `cache_read_input_tokens` from Anthropic response usage — only accessible via `result.experimental_providerMetadata?.anthropic` inside `attemptCompletion()`, requires `completeWithMeta()` to surface it to benchmark callers

---

## Task 3: Strip HTML for Hiring Manager Input

**Priority**: Low-Medium (token reduction)
**Feature flag**: `OPTIMIZATION_HTML_STRIP=true/false` (default: `false`)

**Problem**: Hiring Manager receives `cvTemplate` as full HTML. It only needs CV text content to score keyword/skills fit — HTML tags are noise that inflate input token count.

**Solution**: Strip HTML tags from `cvTemplate` before passing it to the Hiring Manager agent. A lightweight regex or HTML parser (no new dependency needed — Node.js `DOMParser` or a simple tag-stripping utility) converts `<p>5 years experience in React</p>` → `5 years experience in React`.

**Changes required**:

### `server/src/utils/model-helpers.ts` (or new `server/src/utils/html-helpers.ts`)
- Add `stripHtml(html: string): string` utility function

### `server/src/agents/hiring-manager.ts`
- Call `stripHtml(cvTemplate)` before constructing the user prompt JSON when `OPTIMIZATION_HTML_STRIP=true`

**Constraints**:
- Strip only for Hiring Manager — all other agents need the HTML
- Preserve whitespace/newlines between elements so content remains readable to the LLM

**A/B metric**: Character count (and estimated token count) of the user prompt before vs after stripping — measurable in unit tests without real API calls

---

## Task 4: Stream Pipeline Results via SSE

**Priority**: Medium (UX improvement)
**Feature flag**: `OPTIMIZATION_SSE=true/false` (default: `false`) — when `false`, route returns existing JSON response

**Problem**: The `/pipeline` route blocks until all 4 steps complete (~15–30s depending on model). Users see nothing until the full result arrives.

**Solution**: Switch `/pipeline` from a single JSON response to Server-Sent Events (SSE). Emit each step result as it completes. Frontend can render progressive updates.

**SSE event structure**:
```
event: step
data: { "step": "hiring-manager", "result": { ... }, "durationMs": 1200 }

event: step
data: { "step": "rewrite-resume", "result": { ... }, "durationMs": 3400 }

event: step
data: { "step": "ats-scanner", "result": { ... }, "durationMs": 2100 }

event: step
data: { "step": "verifier", "result": { ... }, "durationMs": 1800 }

event: done
data: { "finalCv": "<html>...</html>" }
```

**Changes required**:

### `server/src/routes/pipeline.ts`
- Set `Content-Type: text/event-stream`, `Cache-Control: no-cache`, `Connection: keep-alive`
- After each agent completes, call `res.write()` with the step event
- Send `event: done` with `finalCv` at the end
- Handle client disconnect (`req.on('close', ...)`) to abort in-flight requests
- When `OPTIMIZATION_SSE=false`, fall through to existing JSON response logic

### `server/src/agents/orchestrator.ts`
- Accept an optional `onStepComplete` callback so the route can emit SSE events without the orchestrator knowing about HTTP

### Frontend
- **Do not use native `EventSource`** — it only supports GET requests. The pipeline endpoint uses POST (body contains `jobDescription`, `cvTemplate`, `history`).
- Use `fetch()` with `ReadableStream` to consume SSE: read the response body as a stream, split on `\n\n` boundaries, parse `event:` and `data:` lines manually

### Tests
- Update pipeline route tests to handle SSE response format

**A/B metric**: Time-to-first-step-result (TTFSR) vs total pipeline duration — measured by recording `Date.now()` at first SSE event emission vs final response

---

## Task 5: A/B Benchmark Test Suite

**Priority**: High — implement alongside each task above so every optimization is validated before merging

**Goal**: For each feature-flagged optimization, run the pipeline twice (flag OFF vs flag ON) and assert measurable improvement. Prevents merging optimizations that don't actually help or that degrade output quality.

### Benchmark structure

One file, one test script. Follows the `cross-env` + `vitest run --reporter=verbose` pattern from existing scripts.

```
server/tests/benchmarks/
└── pipeline.bench.ts   ← runs full pipeline twice: flags OFF then ON, compares results
```

### New `package.json` script
```json
"test:benchmark": "cross-env RUN_BENCHMARK_TESTS=true vitest run --reporter=verbose tests/benchmarks/pipeline.bench.ts"
```

### `pipeline.bench.ts`
- Gated by `RUN_BENCHMARK_TESTS=true` — skipped in normal `vitest run` / CI
- Uses existing fixtures: `tests/fixtures/cv-templates/single-column-cv.html` + `tests/fixtures/job-descriptions/fullstack-role.txt` + `tests/fixtures/histories/candidate-history.md`
- For each feature flag (`OPTIMIZATION_HTML_STRIP`, `OPTIMIZATION_PROMPT_CACHING`, `OPTIMIZATION_SSE`):
  1. Run full pipeline with flag `false` → record `{ totalDurationMs, perStepDurationMs, promptCharCounts }`
  2. Run full pipeline with flag `true` → record same metrics
  3. Log a side-by-side diff to console (duration, char counts, cache tokens if Anthropic)
  4. Assert: optimized run produces valid output (non-empty `finalCv`, Zod schemas pass)
- Does not assert a specific % improvement — logs results for human review (real API latency varies too much to assert)

---

## Implementation Order

1. **Task 5** — Set up benchmark utils first (needed to validate all other tasks)
2. **Task 1** — Fix ATS Scanner (correctness bug, unblocks correct Verifier input)
3. **Task 3** — Strip HTML for Hiring Manager + `html-strip.bench.ts`
4. **Task 2** — Prompt caching + `prompt-caching.bench.ts`
5. **Task 4** — SSE streaming + `sse-timing.bench.ts`
