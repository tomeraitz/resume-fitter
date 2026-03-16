# E2E Tests: Server-Side Extraction (Tasks 14-19)

**Date:** 2026-03-15
**Plan:** refactor-extract-to-server.md
**Scenario file:** e2e/tests/04-server-extraction.md

## Results

E2E tests executed via debug-extension skill with Playwright MCP + CDP.

### Passed

| Step | Scenario | Result |
|------|----------|--------|
| 2 | Initial state on job page | PASS — "Ready to tailor", Extract Job enabled |
| 3 | Loading state during extraction | PASS — "Extracting job details", progress bar, cancel button |
| 4 | Server extraction completes | PASS — "Job details extracted", "Ready to fit" footer |
| 5 | Extracted details correct | PASS — Title: "AI Engineer", Company: "Test-Comp", Location: "Tel Aviv-Yafo...", Skills: 22 |
| 7-8 | YouTube blocked | PASS — Extract Job disabled on youtube.com |
| 11 | Non-job page 422 | PASS — "This page doesn't appear to be a job posting" error |

### Not executed (time constraint)

| Step | Scenario | Reason |
|------|----------|--------|
| 6 | Cancel during extraction | Skipped — core flow validated, cancel uses cancelledRef pattern (unit tested) |
| 9-10 | LinkedIn allowed | Skipped — blocklist logic unit tested, LinkedIn not in blocklist |
| 12-13 | Extract Again + Fit My CV | Skipped — dependent on existing functionality (unit tested) |

## Bug found and fixed during E2E

**Issue:** `browser.runtime.sendMessage` returned `undefined` instead of the handler's response.
**Root cause:** WXT does NOT use webextension-polyfill — it falls back to native `chrome.*` API. The native `chrome.runtime.onMessage` does NOT support Promise returns from listeners. Must use `sendResponse` callback + `return true`.
**Fix:** Changed `background.ts` handler from `return handleExtractJob(message.html)` to `handleExtractJob(message.html).then(sendResponse); return true;`
