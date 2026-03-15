# Refactor Job Extraction — Client-Side to Server POST `/extract`

> Branch: `extract`
> Moves extraction logic from client-side DOM scrapers to the server's `POST /extract` endpoint

---

## 1. Overview

Replace the current client-side extraction pipeline (`scrapeJobDetails` + 5 platform-specific scrapers + `extractSkills`) with a single `POST /extract` call to the backend server. The server already has this endpoint implemented — it accepts raw HTML, uses an LLM to extract structured job details, and returns them as JSON (or 422 if not a job page).

**Why:** The server-side LLM extraction handles any page structure, eliminating the need for per-platform DOM scrapers. It also consolidates "is this a job page?" detection into the server's 422 response, replacing most of `useJobPageDetection`.

---

## 2. Current State (What Exists)

| Component | Path | Role |
|---|---|---|
| `useExtractJob` | `extension/entrypoints/main-popup.content/hooks/useExtractJob.ts` | Hook that calls `scrapeJobDetails(document, url)` synchronously |
| `useJobPageDetection` | `extension/entrypoints/main-popup.content/hooks/useJobPageDetection.ts` | URL regex patterns to gate the "Extract Job" button |
| `scrapeJobDetails` | `extension/utils/scrapeJobDetails.ts` | Orchestrator: routes URL to platform-specific extractor |
| Platform scrapers | `extension/utils/extractors/{linkedin,indeed,greenhouse,lever,generic}.ts` | DOM scraping per platform |
| `extractSkills` | `extension/utils/extractSkills.ts` | Client-side skill extraction from text |
| Test files | `extension/utils/extractors/*.test.ts`, `extension/utils/scrapeJobDetails.test.ts`, `extension/utils/extractSkills.test.ts` | Unit tests for scrapers |
| `ExtractedJobDetails` type | `extension/types/extract.ts` | Type + runtime guard |
| `App.tsx` | `extension/entrypoints/main-popup.content/App.tsx` | Uses `isJobPage` to gate extraction; handles view transitions |
| `InitialPanel` | `extension/entrypoints/main-popup.content/components/InitialPanel.tsx` | Renders disabled button when `isJobPage=false` |
| `ExtractJobMessage` | `extension/types/messages.ts` | Message type (currently unused body) |
| Server endpoint | `server/src/routes/extract.ts` | `POST /extract` — accepts `{ html }`, returns job details or 422 |
| Server auth | `server/src/middleware/auth.ts` | JWT Bearer token validation |

---

## 3. Architecture Decision: Where Does the Server Call Live?

**Decision: Route through the background service worker.**

The content script sends `{ type: 'extract-job', html }` to the background SW, which then `fetch()`s the server. This follows the project's established messaging pattern (same as `run-pipeline`) and keeps server communication centralized in `background.ts`.

**Why not call from the content script directly?**
- The JWT session token should be read from `chrome.storage.local` in the background — centralizes auth.
- All server communication flows through the background SW per the project architecture diagram.
- Content scripts on some pages may have restrictive CSP that blocks fetch to `localhost`.

**Flow:**
```
Content Script                    Background SW                    Server
     │                                 │                              │
     │  sendMessage({                  │                              │
     │    type: 'extract-job',         │                              │
     │    html: outerHTML              │                              │
     │  })                             │                              │
     │ ──────────────────────────────► │                              │
     │                                 │  POST /extract               │
     │                                 │  { html }                    │
     │                                 │  Authorization: Bearer <jwt> │
     │                                 │ ────────────────────────────► │
     │                                 │                              │
     │                                 │  200 { title, company, ... } │
     │                                 │  or 422 { error, reason }    │
     │                                 │ ◄──────────────────────────── │
     │                                 │                              │
     │  response (job details or err)  │                              │
     │ ◄────────────────────────────── │                              │
```

---

## 4. Server URL & Auth Configuration

**Server URL:** `http://localhost:8007` (Docker maps port 3001→8007).

**Auth:** The server's `/extract` route requires a JWT Bearer token (`requireAuth` middleware, HS256). The extension will sign its own JWTs using the same `SESSION_SECRET` shared between server and extension via `.env` files.

- **Server `.env`** already has `SESSION_SECRET=<hex>`
- **Extension `.env`** (NEW) will contain `WXT_SESSION_SECRET=<same value>` and `WXT_SERVER_URL=http://localhost:8007`
- WXT exposes `import.meta.env.WXT_*` variables at build time (Vite convention — `WXT_` prefix is required)
- The background SW will use `jsonwebtoken` (or a lightweight alternative like `jose`) to sign a short-lived JWT on each request

---

## 5. Task List

### Task 1: Update `ExtractedJobDetails` type to match server response

**File:** `extension/types/extract.ts`
**Action:** MODIFY

- Add `extras?: Record<string, string>` field to match server's `ExtractedJobDetailsSchema`
- Update the `isExtractedJobDetails` guard to allow the optional `extras` field
- Keep existing length validations (server already validates, but defense-in-depth)
- **Security:** In the guard, validate `extras` bounds -- max 20 keys, key length <= 100, value length <= 2000. The server's Zod schema uses an unbounded `z.record()` for extras, so the client guard is the only defense against an oversized extras object from a compromised server or LLM hallucination

### Task 2: Update `ExtractJobMessage` to carry HTML payload

**File:** `extension/types/messages.ts`
**Action:** MODIFY

- Change `ExtractJobMessage` to include the HTML and add a typed response:
  ```ts
  interface ExtractJobMessage {
    type: 'extract-job';
    html: string;
  }

  // Must be a `type` alias — `interface` cannot express a union
  type ExtractJobResponse =
    | { success: true; job: ExtractedJobDetails }
    | { success: false; error: string; notJobPage?: boolean };
  ```
- Import `ExtractedJobDetails` from `./extract` and re-export both `ExtractJobMessage` and `ExtractJobResponse`

### Task 3: Add extension `.env` and env config

**Files:**
- `extension/.env` (NEW) — CREATE
- `extension/.env.example` (NEW) — CREATE
- `extension/.gitignore` — MODIFY (add `.env` if not already ignored)

**Action:**

1. Create `extension/.env`:
   ```env
   # Server URL (Docker maps 3001→8007)
   WXT_SERVER_URL=http://localhost:8007

   # Must match the server's SESSION_SECRET for JWT signing
   WXT_SESSION_SECRET=6ffb8a6dbf016e628cf55587943cf072db7f2b7f40974d00cbd39da399f85b6fc20b7db7d20257e4e076b23b093b8405e8d2c0d16149f456821478c3b0272f3a
   ```

2. Create `extension/.env.example` (without real secret):
   ```env
   WXT_SERVER_URL=http://localhost:8007
   WXT_SESSION_SECRET=<copy from server/.env SESSION_SECRET>
   ```

3. Ensure `extension/.gitignore` has `.env` (never commit secrets).

**Note:** WXT (Vite) auto-exposes `import.meta.env.WXT_*` variables at build time. The `WXT_` prefix is required. Access via `import.meta.env.WXT_SERVER_URL` and `import.meta.env.WXT_SESSION_SECRET` — no constants file needed.

### Task 4: Add server fetch logic in background service worker

**Files:**
- `extension/utils/handleExtractJob.ts` (NEW) — CREATE (extracted for testability per "entrypoints thin" rule)
- `extension/entrypoints/background.ts` — MODIFY

**Action:**

Create `extension/utils/handleExtractJob.ts`:
- Import `isExtractedJobDetails` from `../types/extract`
- Import `ExtractJobResponse` from `../types/messages`
- Add a `signJwt()` helper that creates an HS256 JWT using `import.meta.env.WXT_SESSION_SECRET`:
  - Use the `jose` library (lightweight, works in service workers — no Node.js `crypto` needed): `new SignJWT({}).setProtectedHeader({ alg: 'HS256' }).setIssuedAt().setExpirationTime('5m').sign(secret)`
  - Add `jose` as a dependency: `cd extension && pnpm add jose`
  - The JWT payload can be minimal (just `iat` and `exp`) — the server only verifies the signature
- Export `handleExtractJob(html: string): Promise<ExtractJobResponse>` async function
- Sends `POST ${import.meta.env.WXT_SERVER_URL}/extract` with `{ html }` body
- Includes `Authorization: Bearer <signed-jwt>` header
- **Validate the 200 response body** with `isExtractedJobDetails()` before returning — defense-in-depth per rules (Input validation)
- Handles response codes:
  - 200 + valid shape → return `{ success: true, job }`
  - 200 + invalid shape → return `{ success: false, error: 'Unexpected response format' }`
  - 422 → return `{ success: false, error: reason, notJobPage: true }`
  - 401 → return `{ success: false, error: 'Authentication failed' }`
  - 500/502/503 → return `{ success: false, error: 'Server error, try again' }`
  - Any other non-OK status → return `{ success: false, error: 'Extraction failed' }`
  - Network error (catch block) → return `{ success: false, error: 'Cannot reach server' }`
- **Security: Message validation** -- add an `isExtractJobMessage` type guard (same pattern as existing `isRunPipelineMessage`). Verify `typeof html === 'string'` and `html.length > 0` and `html.length <= 500_000`. The existing `sender.id !== browser.runtime.id` check already prevents external extensions from sending messages -- keep it
- **Security: Do NOT log the raw HTML payload** in console.error or console.warn -- it may contain sensitive page content (passwords in form fields, session tokens in hidden inputs). Log only the message type and response status code
- Register handler in `browser.runtime.onMessage.addListener`:
  - Match with `isExtractJobMessage(message)`, then call `handleExtractJob(message.html)` and **return the Promise directly**. WXT's `browser.runtime.onMessage` supports Promise-returning listeners (the webextension-polyfill handles it). Do NOT use `return true` + `sendResponse` callback — that is the raw `chrome.*` pattern and is inconsistent with `browser.*` usage per project rules.
  - Note: The existing `run-pipeline` handler uses `return true` (fire-and-forget, no response needed). The extract handler is different — it must return a value to the caller, so it **must** return a Promise.

**Important MV3 note:** Background service workers have no DOM and can terminate after ~30s of inactivity. The fetch call is async I/O which keeps the SW alive for its duration. No special keep-alive logic is needed for a single fetch.

### Task 5: Rewrite `useExtractJob` hook to call background SW

**File:** `extension/entrypoints/main-popup.content/hooks/useExtractJob.ts`
**Action:** MODIFY (full rewrite)

- Remove imports of `scrapeJobDetails` and `isExtractedJobDetails`
- Add import of `ExtractJobResponse` from `@/types/messages`
- `startExtraction()` now:
  1. Gets `document.documentElement.outerHTML`
  2. **Security: Strip `<script>`, `<style>`, and `<svg>` tags** (with content) before truncation -- `html.replace(/<(script|style|svg)\b[^>]*>[\s\S]*?<\/\1>/gi, '')`. This serves dual purpose: reduces payload size to stay within 500KB, and avoids sending inline script content (which may contain tokens, nonces, or sensitive app state) to the server. The server's `stripHtml` does this too, but stripping client-side avoids transmitting the data at all
  3. Truncates to 500,000 chars — `html.slice(0, 500_000)` — as a final safety net (server rejects > 500KB)
  4. Calls `browser.runtime.sendMessage({ type: 'extract-job', html })` and awaits the typed response (`ExtractJobResponse`)
  5. On `success: true`: sets `extractedJob` from `response.job`
  6. On `notJobPage: true`: sets error to `"This page doesn't appear to be a job posting"`
  7. On other `success: false`: sets `response.error` as the error message
- Keep `cancelExtraction`, `resetExtraction`, `cancelledRef` pattern
- Keep the cleanup `useEffect` that sets `cancelledRef.current = true` on unmount
- Note: `AbortController` cannot abort `browser.runtime.sendMessage` — stick with the `cancelledRef` pattern (check after await, skip state updates if cancelled)

### Task 6: Simplify `useJobPageDetection` to a lightweight pre-filter

**File:** `extension/entrypoints/main-popup.content/hooks/useJobPageDetection.ts`
**Action:** MODIFY

- **Keep it**, but simplify its purpose: it is now a quick pre-filter for obviously non-job pages
- Rename to a **block-list** approach — instead of trying to match job pages (allowlist), block known non-job sites:
  ```ts
  const NON_JOB_PATTERNS = [
    /^chrome:\/\//,
    /^chrome-extension:\/\//,
    /^about:/,
    /youtube\.com/i,
    /google\.com\/search/i,
    /facebook\.com/i,
    /twitter\.com|x\.com/i,
    /instagram\.com/i,
    /reddit\.com/i,
    /wikipedia\.org/i,
  ];
  ```
- `isJobPage` becomes `!NON_JOB_PATTERNS.some(p => p.test(url))` — defaults to `true` for unknown sites
- The server's 422 handles the real detection; this just prevents wasting a server call on obvious non-job pages

**Why blocklist over allowlist:** The old allowlist (`/linkedin.com\/jobs\//`, etc.) was too restrictive — it blocked extraction on any site not in the list. The LLM-based server extraction works on any site, so we should allow attempts and let the server decide.

### Task 7: Update App.tsx for new error handling

**File:** `extension/entrypoints/main-popup.content/App.tsx`
**Action:** MODIFY

- No structural changes needed — the view state machine (`initial → extracting → extract-done`) still applies
- The `useExtractJob` hook's interface (`extractedJob`, `isExtracting`, `error`, `startExtraction`, `cancelExtraction`, `resetExtraction`) stays the same
- The `useJobPageDetection` hook still returns `isJobPage` — same interface
- One change: when `extractError` contains a "not a job posting" message (from 422), the `InitialPanel` already displays it. Verify this works correctly

### Task 8: Update InitialPanel messaging

**File:** `extension/entrypoints/main-popup.content/components/InitialPanel.tsx`
**Action:** MODIFY (minor)

- Update the disabled-button hint text from "Navigate to a job posting to extract" to something like "This page can't be scanned" (since the blocklist is now broader)
- No other changes -- the `isJobPage` / `extractError` props still work
- **Security (XSS): Verify that `extractError` and all `job.*` fields are rendered as text content only** (via `{extractError}` / `{job.title}` in JSX), never via `dangerouslySetInnerHTML`. Current code in `InitialPanel` and `ExtractFinishedPanel` is correct -- React auto-escapes text interpolation. Keep it that way; do not introduce `dangerouslySetInnerHTML` for any server-returned field

### Task 9: Delete client-side extractors

**Action:** DELETE the following files:

```
extension/utils/extractors/linkedin.ts
extension/utils/extractors/linkedin.test.ts
extension/utils/extractors/indeed.ts
extension/utils/extractors/indeed.test.ts
extension/utils/extractors/greenhouse.ts
extension/utils/extractors/greenhouse.test.ts
extension/utils/extractors/lever.ts
extension/utils/extractors/lever.test.ts
extension/utils/extractors/generic.ts
extension/utils/extractors/generic.test.ts
extension/utils/scrapeJobDetails.ts
extension/utils/scrapeJobDetails.test.ts
extension/utils/extractSkills.ts
extension/utils/extractSkills.test.ts
```

**Total: 14 files deleted.**

After deletion, remove the `extension/utils/extractors/` directory if empty.

### Task 10: Verify build and types

**Action:** RUN

- `cd extension && pnpm tsc --noEmit` — verify no type errors from removed imports
- `cd extension && pnpm build` — verify WXT builds successfully
- Manually test: open a job page, click Extract, verify server call works

### Task 11: Unit test — `useExtractJob` hook

**File:** `extension/entrypoints/main-popup.content/hooks/useExtractJob.test.ts` (NEW)
**Action:** CREATE
**Runner:** `cd extension && pnpm vitest run useExtractJob.test`

Mock `browser.runtime.sendMessage` (via `vi.mock('wxt/browser')` or manual mock on the global). Test the following scenarios:

1. **Success flow:** `sendMessage` resolves with `{ success: true, job: { title: 'Engineer', company: 'Acme', ... } }`. Assert `extractedJob` is set with the returned job, `isExtracting` transitions to false, `error` is null.
2. **422 not-a-job flow:** `sendMessage` resolves with `{ success: false, error: 'Not a job page', notJobPage: true }`. Assert `error` contains "not a job posting" text, `extractedJob` remains null, `isExtracting` is false.
3. **Network error flow:** `sendMessage` rejects with `new Error('Cannot reach server')`. Assert `error` is set with a user-friendly message, `isExtracting` is false, `extractedJob` remains null.
4. **Cancellation flow:** Call `startExtraction()`, then immediately call `cancelExtraction()` before the sendMessage promise resolves. Assert `isExtracting` is false, `extractedJob` remains null, and the late-arriving response does not update state.
5. **HTML truncation:** Mock `document.documentElement.outerHTML` with a string > 500,000 chars. Assert the `html` field in the sent message is at most 500,000 characters.
6. **Unmount cleanup:** Render the hook, call `startExtraction()`, unmount before completion. Assert no React state-update warnings.

**Testing pattern:** Use `@testing-library/react`'s `renderHook` + `act`. The vitest config already has jsdom environment and globals enabled.

### Task 12: Unit test — `useJobPageDetection` hook

**File:** `extension/entrypoints/main-popup.content/hooks/useJobPageDetection.test.ts` (NEW)
**Action:** CREATE
**Runner:** `cd extension && pnpm vitest run useJobPageDetection.test`

Test the blocklist logic by mocking `window.location.href` for each case:

| # | URL | Expected `isJobPage` |
|---|---|---|
| 1 | `https://www.youtube.com/watch?v=abc` | `false` |
| 2 | `https://www.google.com/search?q=jobs` | `false` |
| 3 | `https://www.facebook.com/somepage` | `false` |
| 4 | `https://x.com/user/status/123` | `false` |
| 5 | `https://www.instagram.com/p/abc` | `false` |
| 6 | `https://www.reddit.com/r/jobs` | `false` |
| 7 | `https://en.wikipedia.org/wiki/Job` | `false` |
| 8 | `chrome://extensions` | `false` |
| 9 | `chrome-extension://abc/popup.html` | `false` |
| 10 | `about:blank` | `false` |
| 11 | `https://www.linkedin.com/jobs/view/123` | `true` |
| 12 | `https://www.indeed.com/viewjob?jk=abc` | `true` |
| 13 | `https://boards.greenhouse.io/company/jobs/123` | `true` |
| 14 | `https://careers.somecompany.com/job/456` | `true` |
| 15 | `http://localhost:3006/test-comp/jobs/123` | `true` |

**Testing pattern:** Use `renderHook`. Before each test, use `vi.stubGlobal` or `Object.defineProperty(window, 'location', ...)` to set the URL.

### Task 13: Unit test — `handleExtractJob` in background.ts

**File:** `extension/utils/handleExtractJob.test.ts` (NEW)
**Action:** CREATE
**Runner:** `cd extension && pnpm vitest run handleExtractJob.test`

To make `handleExtractJob` directly testable, extract it into `extension/utils/handleExtractJob.ts` and import it in both `background.ts` and the test file. This follows the "entrypoints thin, delegate to utilities" rule. Update Task 4 accordingly during implementation.

Mock `fetch` globally via `vi.stubGlobal('fetch', ...)`. Test:

| # | Scenario | Mock `fetch` returns | Expected result |
|---|---|---|---|
| 1 | 200 success | `{ ok: true, status: 200, json: () => validJobDetails }` | `{ success: true, job: { ... } }` |
| 2 | 422 not-a-job | `{ ok: false, status: 422, json: () => ({ error: '...', reason: '...' }) }` | `{ success: false, error: '...', notJobPage: true }` |
| 3 | 401 unauthorized | `{ ok: false, status: 401 }` | `{ success: false, error: 'Authentication failed' }` |
| 4 | 502 server error | `{ ok: false, status: 502 }` | `{ success: false, error: 'Server error, try again' }` |
| 5 | 503 server error | `{ ok: false, status: 503 }` | `{ success: false, error: 'Server error, try again' }` |
| 6 | Network error | `fetch` throws `TypeError('Failed to fetch')` | `{ success: false, error: 'Cannot reach server' }` |
| 7 | Malformed 200 | `{ ok: true, status: 200, json: () => ({ bad: 'data' }) }` | `{ success: false, error: 'Unexpected response format' }` |
| 8 | Auth header | Any | Verify `fetch` was called with `Authorization: Bearer <token>` and `Content-Type: application/json` |

### Task 14: E2E test — Server extraction success flow

**Action:** RUN via `/debug-extension` skill
**Scenario file:** `e2e/tests/04-server-extraction.md`, Steps 1-5

Run the E2E scenario for extracting a job from the mock Greenhouse page via the server. Verify:
- "Extract Job" is enabled on the mock job page
- Loading panel appears during server extraction (visible for 2-8 seconds)
- Server returns extracted job details
- Extract finished panel displays title, company, location, skills from server response

### Task 15: E2E test — Blocked page (YouTube)

**Action:** RUN via `/debug-extension` skill
**Scenario file:** `e2e/tests/04-server-extraction.md`, Steps 7-8

Navigate to YouTube and verify:
- "Extract Job" button is disabled
- Hint text shows "This page can't be scanned"
- No server call is made

### Task 16: E2E test — Server 422 on non-job page

**Action:** RUN via `/debug-extension` skill
**Scenario file:** `e2e/tests/04-server-extraction.md`, Step 11

Navigate to a non-job page that passes the blocklist (e.g. `localhost:3006` root). Click "Extract Job" and verify:
- Loading panel appears while server processes
- Server returns 422
- UI returns to initial panel with "not a job posting" error message

### Task 17: E2E test — Cancel during server extraction

**Action:** RUN via `/debug-extension` skill
**Scenario file:** `e2e/tests/04-server-extraction.md`, Step 6

Start extraction on a job page, cancel after 1 second while the server call is in-flight. Verify:
- Cancel returns to initial panel immediately
- No stale server response updates the UI after cancel

### Task 18: E2E test — Extract Again and Fit My CV after server extraction

**Action:** RUN via `/debug-extension` skill
**Scenario file:** `e2e/tests/04-server-extraction.md`, Steps 12-13

After a successful server extraction:
- Click "Extract Again" and verify re-extraction completes with same data
- Click "Fit My CV" and verify `run-pipeline` message is sent to background SW

### Task 19: E2E test — LinkedIn allowed (blocklist bypass)

**Action:** RUN via `/debug-extension` skill
**Scenario file:** `e2e/tests/04-server-extraction.md`, Steps 9-10

Navigate to a LinkedIn job page. Verify:
- LinkedIn is NOT in the blocklist
- "Extract Job" button is enabled

---

## 6. Files Summary

| Task | Action | Path | Notes |
|---|---|---|---|
| 1 | MODIFY | `extension/types/extract.ts` | Add `extras?` field |
| 2 | MODIFY | `extension/types/messages.ts` | Update `ExtractJobMessage` + add `ExtractJobResponse` type union |
| 3 | CREATE | `extension/.env`, `extension/.env.example` | Server URL + SESSION_SECRET for JWT signing |
| 4 | MODIFY | `extension/entrypoints/background.ts` | Add message handler, import `handleExtractJob` |
| 4 | CREATE | `extension/utils/handleExtractJob.ts` | Server fetch logic extracted for testability |
| 5 | MODIFY | `extension/entrypoints/main-popup.content/hooks/useExtractJob.ts` | Full rewrite: sendMessage + HTML sanitization |
| 6 | MODIFY | `extension/entrypoints/main-popup.content/hooks/useJobPageDetection.ts` | Switch from allowlist to blocklist |
| 7 | MODIFY | `extension/entrypoints/main-popup.content/App.tsx` | Minor: verify error flow (likely no code changes) |
| 8 | MODIFY | `extension/entrypoints/main-popup.content/components/InitialPanel.tsx` | Update hint text |
| 9 | DELETE | `extension/utils/extractors/*.ts` (5 scrapers + 5 tests) | All platform-specific scrapers |
| 9 | DELETE | `extension/utils/scrapeJobDetails.ts` + `.test.ts` | Orchestrator no longer needed |
| 9 | DELETE | `extension/utils/extractSkills.ts` + `.test.ts` | Server extracts skills now |
| 11 | CREATE | `extension/entrypoints/main-popup.content/hooks/useExtractJob.test.ts` | Unit tests for rewritten hook |
| 12 | CREATE | `extension/entrypoints/main-popup.content/hooks/useJobPageDetection.test.ts` | Unit tests for blocklist logic |
| 13 | CREATE | `extension/utils/handleExtractJob.test.ts` | Unit tests for server fetch handler |
| 14-19 | RUN | `e2e/tests/04-server-extraction.md` | E2E scenarios via `/debug-extension` skill |

---

## 7. Rules Compliance Checklist

| Rule | Status | Notes |
|---|---|---|
| Max 300 lines per file | OK | `background.ts` gains ~40 lines; well under limit |
| Single responsibility | OK | Background handles server comms; hook handles UI state |
| `browser.*` not `chrome.*` | OK | Using `browser.runtime.sendMessage` throughout |
| No hardcoded API keys | OK | `SESSION_SECRET` in `.env` (gitignored), JWT signed at runtime via `jose` |
| Input validation | OK | Server validates with Zod; background validates response with `isExtractedJobDetails()` guard (bounded lengths); content script strips script/style/svg before sending; background validates inbound message shape and length |
| No `eval` or `innerHTML` | OK | No DOM manipulation in new code |
| Token budget awareness | OK | HTML truncated to 500KB before sending |
| No premature abstraction | OK | `SERVER_URL` is a simple constant, not a service class |
| Content script isolation | OK | Content script sends message to background, never fetches directly |
| TypeScript strict | OK | All new types are explicit |
| Entrypoints thin | OK | Background delegates to handler function |
| Shadow DOM isolation | N/A | No UI changes to shadow DOM setup |

---

## 8. Risk / Open Questions

1. **Auth token:** The extension signs its own JWTs using `jose` with the shared `WXT_SESSION_SECRET` from `.env`. This is a symmetric shared-secret approach — acceptable for a local dev/self-hosted setup. For production, consider asymmetric keys or a proper auth server.

2. **HTML size:** `document.documentElement.outerHTML` on heavy pages can exceed 500KB. Task 5 now strips `<script>`, `<style>`, `<svg>` tags before truncation to preserve meaningful content. The 500KB hard truncation remains as a safety net. On exceptionally heavy pages, some content may still be lost — monitor in practice.

3. **Extraction latency:** Client-side extraction was near-instant (DOM scraping). Server extraction involves a network round-trip + LLM inference (2-8 seconds). The `ExtractLoadingPanel` already exists and handles this visually, but users may notice the increased wait time. No code changes needed, just a UX expectation shift.

4. **Offline / server-down handling:** If the server is unreachable, the user gets "Cannot reach server." Consider adding a retry button or more helpful messaging in a follow-up.

5. **Port:** Docker maps server port 3001→8007. The extension uses `http://localhost:8007` via `WXT_SERVER_URL`.
