# E2E Pipeline Fixes Plan

Four issues found during E2E testing of the full CV pipeline flow.

---

## Issue 1 (CRITICAL): Verifier agent hangs — unreachable Ollama host

### Problem
`OLLAMA_BASE_URL=http://host.docker.internal:8001/v1` doesn't resolve outside Docker. Each `generateText()` attempt hangs waiting for TCP connection timeout (~30-120s on Windows). With `MAX_RETRIES=2`, the system wastes 3 × timeout before falling back. Steps 1-3 eventually fall back to Google, but by step 4 (verifier) the accumulated delay makes the pipeline appear hung.

### Root Cause
In `model-helpers.ts`, `ETIMEDOUT` is classified as **retriable** (line 47), so the system retries 2 more times against the dead host. It should be **provider-fatal** — if the host timed out once, retrying the same broken URL won't help. Skip straight to fallback.

### Fix

**`server/src/utils/model-helpers.ts`** — Move `ETIMEDOUT` from `isRetriable()` to `isFatalForProvider()`:

1. In `isFatalForProvider()` (line 60-75), add `ETIMEDOUT` and `ECONNABORTED` to the fatal checks alongside `ECONNREFUSED` and `ENOTFOUND`:
   ```typescript
   // line 65 — expand the check:
   if (
     msg.includes("ECONNREFUSED") ||
     msg.includes("ENOTFOUND") ||
     msg.includes("ETIMEDOUT") ||
     msg.includes("ECONNABORTED") ||
     msg.includes("Cannot connect to API")
   ) return true;
   ```

2. In `isRetriable()` (line 47), remove `ETIMEDOUT` since it's now handled as provider-fatal:
   ```typescript
   // Change line 47 from:
   if (msg.includes("ECONNRESET") || msg.includes("ETIMEDOUT")) return true;
   // To:
   if (msg.includes("ECONNRESET")) return true;
   ```

**Effect**: On first connection timeout, `isFatalForProvider` returns `true` → `withRetryMeta` throws immediately → `completeWithMeta` catches it and tries the fallback provider (Google). Each step fails fast (~30s for one TCP timeout) instead of 3× retries (~90-120s).

### Testing
- Set `OLLAMA_BASE_URL` to an unreachable host (e.g., `http://192.0.2.1:8001/v1` — TEST-NET, guaranteed unreachable)
- Run the pipeline — all 4 steps should fall back to Google after one timeout each
- Verify server logs show `[ModelService] fallback triggered` for each step
- Full pipeline should complete within ~2-3 minutes instead of hanging

---

## Issue 2: Port conflict — WXT dev server vs E2E mock server

### Problem
Both WXT dev server and E2E mock server bind to port 3006. WXT gets `0.0.0.0:3006`, mock server gets `[::1]:3006`. Using `localhost` hits WXT (404) instead of the mock server.

### Fix
Change mock server to port **3007**.

**Files to change** (find-and-replace `3006` → `3007`):
1. `e2e/serve.js` — line 5: `const PORT = 3007;`
2. `e2e/tests/01-empty-state.md` — all `localhost:3006` refs
3. `e2e/tests/02-profile-setup.md` — all `localhost:3006` refs
4. `e2e/tests/03-extract-loading-finished.md` — all `localhost:3006` refs
5. `e2e/tests/04-server-extraction.md` — all `localhost:3006` refs
6. `e2e/tests/05-pipeline-progress-complete.md` — all `localhost:3006` refs
7. `.claude/skills/debug-extension/SKILL.md` — lines 61, 62, 69

### Testing
- Start WXT dev server + E2E mock server concurrently
- Verify no port conflicts, both start cleanly
- `curl http://localhost:3007/test-comp/jobs/4488055101` returns 200

---

## Issue 3: Favicon 404 on mock server

### Problem
Browsers auto-request `/favicon.ico`. Mock server returns 404, polluting console.

### Fix

**`e2e/serve.js`** — Add early return for favicon inside the `createServer` callback, before the routes lookup:

```typescript
if (req.url === '/favicon.ico') {
  res.writeHead(204);
  res.end();
  return;
}
```

### Testing
- Navigate to mock page, verify no 404 in DevTools Network tab
- `/favicon.ico` returns 204

---

## Issue 4: UI lag on pipeline step transitions

### Problem
When a step completes, `background.ts` makes two sequential `storage.setValue()` calls: one to mark the step completed, one to mark the next step running. Chrome's `storage.onChanged` can coalesce rapid writes to the same key, so the watcher in `usePipelineSession.ts` may miss the intermediate state, causing a visible delay.

### Fix
Combine both writes into a single atomic mutation.

**`extension/services/storage/pipeline.actions.ts`** — Add new function:

```typescript
export async function completeStepAndStartNext(
  completedStep: AgentStep,
  completedData: AgentResultData | undefined,
  nextStep: AgentStep,
): Promise<void> {
  await mutatePipelineSession((session) => ({
    ...session,
    steps: {
      ...session.steps,
      [completedStep]: { step: completedStep, status: 'completed', data: completedData },
      [nextStep]: { step: nextStep, status: 'running' },
    },
  }));
}
```

**`extension/services/storage/index.ts`** — Export `completeStepAndStartNext`.

**`extension/entrypoints/background.ts`** — In `handleSSEEvent()`, replace the two separate calls (lines 129-137):

```typescript
// Before:
await updateStepResult(stepName, 'completed', { step: stepName, ...output } as AgentResultData);
const nextStep = STEP_NAMES[stepNum + 1];
if (nextStep) {
  await updateStepResult(nextStep, 'running');
}

// After:
const castData = { step: stepName, ...output } as AgentResultData;
const nextStep = STEP_NAMES[stepNum + 1];
if (nextStep) {
  await completeStepAndStartNext(stepName, castData, nextStep);
} else {
  await updateStepResult(stepName, 'completed', castData);
}
```

### Testing
- Run full pipeline, observe popup UI during step transitions
- Each transition should be near-instant (< 1s) with no visible "stuck" state

---

## Implementation Order

| Order | Issue | Risk | Effort |
|-------|-------|------|--------|
| 1 | Issue 1 — ETIMEDOUT provider-fatal | Critical | Small (2 lines in model-helpers.ts) |
| 2 | Issue 4 — Atomic step transitions | Medium | Small (new function + update background.ts) |
| 3 | Issue 2 — Port 3006 → 3007 | Low | Trivial (find-replace across 7 files) |
| 4 | Issue 3 — Favicon 204 | Low | Trivial (4 lines in serve.js) |

Issues 2+3 both touch `e2e/serve.js` — combine into one commit.
