# DOM Extraction Plan — Pure Client-Side Scraping

> Branch: `extract`
> No LLM, no server calls — pure DOM scraping in the content script

---

## 1. Overview

Replace the mock `MOCK_JOB` / `setTimeout` in `useExtractJob.ts` with real DOM scraping. The content script runs on the host page and has direct `document` access. The scraping logic will be organized as:

- A new module `extension/utils/scrapeJobDetails.ts` containing all extraction logic
- Per-board extractor functions keyed off URL patterns (reusing the same patterns from `useJobPageDetection.ts`)
- A generic fallback extractor using heuristics (ld+json, meta tags, largest text block)
- A shared skills extraction utility that scans description text for known tech keywords

The `useExtractJob` hook replaces the `setTimeout` + `MOCK_JOB` with a call to `scrapeJobDetails(document, window.location.href)`, validates the result with `isExtractedJobDetails`, and sets state accordingly.

## 2. Architecture

```
useExtractJob.ts  (hook - calls scrapeJobDetails, validates, manages state)
    |
    v
utils/scrapeJobDetails.ts  (orchestrator - picks extractor by URL, runs it)
    |
    +-- utils/extractors/greenhouse.ts
    +-- utils/extractors/linkedin.ts
    +-- utils/extractors/indeed.ts
    +-- utils/extractors/lever.ts
    +-- utils/extractors/generic.ts   (fallback)
    +-- utils/extractSkills.ts        (shared skill keyword matcher)
```

**Key design decision:** All extractors live under `extension/utils/extractors/` as simple pure functions that take a `Document` and return a partial `ExtractedJobDetails`. No classes, no registries -- just functions with a shared signature. The orchestrator in `scrapeJobDetails.ts` does a URL match and dispatches.

## 3. Detailed File Plan

### 3a. `extension/utils/extractSkills.ts` (new, ~40 lines)

A curated list of ~80-100 common tech skills and a function to scan text for them.

```ts
// Signature
export function extractSkills(text: string): string[]
```

**Logic:**
- Define `KNOWN_SKILLS: string[]` with entries like `'React'`, `'TypeScript'`, `'Node.js'`, `'Python'`, `'AWS'`, `'Docker'`, `'Kubernetes'`, `'GraphQL'`, `'PostgreSQL'`, `'MongoDB'`, `'Redis'`, `'Java'`, `'Go'`, `'Rust'`, `'C++'`, `'C#'`, `.NET`, `'Angular'`, `'Vue'`, `'Next.js'`, `'Express'`, `'Django'`, `'Flask'`, `'Spring'`, `'Terraform'`, `'CI/CD'`, `'Git'`, `'REST'`, `'gRPC'`, `'Kafka'`, `'RabbitMQ'`, `'Elasticsearch'`, `'Linux'`, `'Agile'`, `'Scrum'`, etc.
- For each skill, do a case-insensitive word-boundary regex match against the input text: `new RegExp('\\b' + escapeRegex(skill) + '\\b', 'i')`
- Return deduplicated matched skills in the order they appear in the known list (deterministic)
- Cap at 30 skills max (to stay within `isExtractedJobDetails` validation of <= 50)
- Handle edge cases: skills with dots (`Node.js`), `C++`, `C#` need regex escaping

### 3b. `extension/utils/extractors/greenhouse.ts` (new, ~40 lines)

```ts
export function extractGreenhouse(doc: Document): Partial<ExtractedJobDetails>
```

Greenhouse job boards follow a consistent structure. Selectors:
- **Title:** `doc.querySelector('h1')?.textContent` or `doc.querySelector('.job-title')?.textContent`
- **Company:** `doc.querySelector('.company-name')?.textContent` or extract from `<title>` (format is typically "Job Title at Company")
- **Location:** `doc.querySelector('.location')?.textContent` or `doc.querySelector('[class*="location"]')?.textContent`
- **Description:** `doc.querySelector('#content')?.textContent` or `doc.querySelector('.content')?.textContent` or `doc.querySelector('[class*="description"]')?.textContent`
- **Skills:** `extractSkills(description)` from the extracted description text

Trim all text values. Return empty string for missing fields (graceful fallback).

### 3c. `extension/utils/extractors/linkedin.ts` (new, ~50 lines)

```ts
export function extractLinkedIn(doc: Document): Partial<ExtractedJobDetails>
```

LinkedIn job pages have well-known selectors (though they change occasionally):
- **Title:** `doc.querySelector('.job-details-jobs-unified-top-card__job-title h1')?.textContent` or `doc.querySelector('.top-card-layout__title')?.textContent` or `doc.querySelector('h1')?.textContent`
- **Company:** `doc.querySelector('.job-details-jobs-unified-top-card__company-name a')?.textContent` or `doc.querySelector('.top-card-layout__company')?.textContent`
- **Location:** `doc.querySelector('.job-details-jobs-unified-top-card__bullet')?.textContent` or `doc.querySelector('.top-card-layout__bullet')?.textContent`
- **Description:** `doc.querySelector('.jobs-description__content')?.textContent` or `doc.querySelector('.description__text')?.textContent` or `doc.querySelector('#job-details')?.textContent`
- **Skills:** `extractSkills(description)`

LinkedIn has both logged-in and logged-out views with different class names. Try multiple selectors with fallback.

### 3d. `extension/utils/extractors/indeed.ts` (new, ~40 lines)

```ts
export function extractIndeed(doc: Document): Partial<ExtractedJobDetails>
```

- **Title:** `doc.querySelector('.jobsearch-JobInfoHeader-title')?.textContent` or `doc.querySelector('h1')?.textContent`
- **Company:** `doc.querySelector('[data-company-name]')?.textContent` or `doc.querySelector('.jobsearch-InlineCompanyRating a')?.textContent`
- **Location:** `doc.querySelector('[data-testid="job-location"]')?.textContent` or `doc.querySelector('.jobsearch-JobInfoHeader-subtitle > div:nth-child(2)')?.textContent`
- **Description:** `doc.querySelector('#jobDescriptionText')?.textContent`
- **Skills:** `extractSkills(description)`

### 3e. `extension/utils/extractors/lever.ts` (new, ~35 lines)

```ts
export function extractLever(doc: Document): Partial<ExtractedJobDetails>
```

Lever pages have a clean, consistent structure:
- **Title:** `doc.querySelector('.posting-headline h2')?.textContent`
- **Company:** `doc.querySelector('.main-header-logo img')?.getAttribute('alt')` or extract from `<title>`
- **Location:** `doc.querySelector('.posting-categories .location')?.textContent` or `doc.querySelector('.posting-categories .workplaceTypes')?.textContent`
- **Description:** `doc.querySelector('.posting-page .content')?.textContent` or concatenate `.section-wrapper` text nodes
- **Skills:** `extractSkills(description)`

### 3f. `extension/utils/extractors/generic.ts` (new, ~60 lines)

```ts
export function extractGeneric(doc: Document): Partial<ExtractedJobDetails>
```

Fallback for unknown job boards. Uses heuristics:

1. **Structured data (ld+json):** Look for `<script type="application/ld+json">` containing `"@type": "JobPosting"`. Parse the JSON and extract `title`, `hiringOrganization.name`, `jobLocation.address.addressLocality`, `description`. This is the highest-quality signal when available.

2. **Meta tags:**
   - Company: `doc.querySelector('meta[property="og:site_name"]')?.getAttribute('content')`
   - Title: `doc.querySelector('meta[property="og:title"]')?.getAttribute('content')` (fallback)

3. **DOM heuristics (last resort):**
   - Title: first `h1`, then first `h2`
   - Description: find the element with the most text content among `article`, `main`, `[role="main"]`, `.description`, `.job-description`, `#job-description`. If none match, find the `div` or `section` with the longest `textContent`.
   - Company/Location: if not found via ld+json or meta, leave as empty string

4. **Skills:** `extractSkills(description)` from whatever description was found

**ld+json parsing** should be wrapped in try/catch -- malformed JSON should not crash extraction.

### 3g. `extension/utils/scrapeJobDetails.ts` (new, ~50 lines)

The orchestrator module.

```ts
import type { ExtractedJobDetails } from '@/types/extract';
import { extractGreenhouse } from './extractors/greenhouse';
import { extractLinkedIn } from './extractors/linkedin';
import { extractIndeed } from './extractors/indeed';
import { extractLever } from './extractors/lever';
import { extractGeneric } from './extractors/generic';

interface BoardMatcher {
  pattern: RegExp;
  extract: (doc: Document) => Partial<ExtractedJobDetails>;
}

const BOARD_MATCHERS: BoardMatcher[] = [
  { pattern: /greenhouse\.io\/.*\/jobs\//i, extract: extractGreenhouse },
  { pattern: /linkedin\.com\/jobs\//i, extract: extractLinkedIn },
  { pattern: /indeed\.com\/(viewjob|jobs)/i, extract: extractIndeed },
  { pattern: /lever\.co\//i, extract: extractLever },
];

export function scrapeJobDetails(
  doc: Document,
  url: string,
): ExtractedJobDetails {
  const matcher = BOARD_MATCHERS.find((m) => m.pattern.test(url));
  const raw = matcher ? matcher.extract(doc) : extractGeneric(doc);

  return {
    title: (raw.title ?? '').trim().slice(0, 200),
    company: (raw.company ?? '').trim().slice(0, 200),
    location: (raw.location ?? '').trim().slice(0, 200),
    skills: (raw.skills ?? []).slice(0, 50),
    description: (raw.description ?? '').trim().slice(0, 50_000),
  };
}
```

Key points:
- The orchestrator always returns a complete `ExtractedJobDetails` object with safe defaults (empty string / empty array)
- All string values are trimmed and capped to the max lengths enforced by `isExtractedJobDetails`
- The URL patterns mirror those in `useJobPageDetection.ts`
- Glassdoor and Workday are intentionally omitted from specialized extractors (they will fall through to the generic extractor which handles ld+json well). They can be added later when we have test pages.

### 3h. Modify `extension/entrypoints/main-popup.content/hooks/useExtractJob.ts`

Replace the mock implementation with real scraping.

**Changes:**
1. Remove `MOCK_DELAY` constant and `MOCK_JOB` constant
2. Remove `timeoutRef` -- no longer needed
3. Import `scrapeJobDetails` from `@/utils/scrapeJobDetails`
4. Import `isExtractedJobDetails` from `@/types/extract`
5. `startExtraction` becomes an async function that:
   - Sets `isExtracting: true`, clears error/result
   - Wraps `scrapeJobDetails(document, window.location.href)` in a try/catch
   - Checks `cancelledRef.current` before setting state (race condition guard preserved)
   - Validates result with `isExtractedJobDetails()` before setting `extractedJob`
   - If validation fails, sets error: `'Could not extract job details from this page'`
   - If an exception is thrown, sets error with the exception message
   - Sets `isExtracting: false` in all paths

The updated hook signature and return type remain identical -- no changes to consumers.

```ts
const startExtraction = useCallback(async () => {
  if (isExtracting) return;

  cancelledRef.current = false;
  setIsExtracting(true);
  setError(null);
  setExtractedJob(null);

  try {
    // Small yield to let React render the loading state
    await new Promise((r) => setTimeout(r, 0));

    if (cancelledRef.current) return;

    const result = scrapeJobDetails(document, window.location.href);

    if (cancelledRef.current) return;

    if (isExtractedJobDetails(result) && result.title !== '') {
      setExtractedJob(result);
    } else {
      setError('Could not extract job details from this page');
    }
  } catch (err) {
    if (!cancelledRef.current) {
      setError(err instanceof Error ? err.message : 'Extraction failed');
    }
  } finally {
    if (!cancelledRef.current) {
      setIsExtracting(false);
    }
  }
}, [isExtracting]);
```

**Why `await new Promise(r => setTimeout(r, 0))`?** The DOM scraping itself is synchronous and fast, but we need to yield to the event loop so React can render the `ExtractLoadingPanel` before the scraping runs. Without this, the loading UI would never appear because `setIsExtracting(true)` and `setExtractedJob(result)` would batch together. This also makes the `cancelledRef` check meaningful.

### 3i. Update `extension/entrypoints/main-popup.content/hooks/useExtractJob.test.tsx`

The existing tests use `vi.useFakeTimers()` and `vi.advanceTimersByTime(2000)` to control the mock delay. With the new async implementation:

- Replace `vi.advanceTimersByTime(2000)` with `await act(async () => { vi.advanceTimersByTime(0); })` to flush the microtask
- Mock `scrapeJobDetails` via `vi.mock('@/utils/scrapeJobDetails')` to return controlled data
- Keep all existing test scenarios (initial state, startExtraction, cancel, reset, no-op double-start, race condition guard)
- Add new test: when `scrapeJobDetails` throws, error state is set
- Add new test: when `scrapeJobDetails` returns data that fails `isExtractedJobDetails` validation (e.g., empty title), error state is set

## 4. Task Breakdown

| # | Task | File(s) | Depends On |
|---|------|---------|------------|
| 1 | Create `extractSkills` utility with known tech keywords list | `extension/utils/extractSkills.ts` | -- |
| 2 | Create Greenhouse extractor | `extension/utils/extractors/greenhouse.ts` | Task 1 |
| 3 | Create LinkedIn extractor | `extension/utils/extractors/linkedin.ts` | Task 1 |
| 4 | Create Indeed extractor | `extension/utils/extractors/indeed.ts` | Task 1 |
| 5 | Create Lever extractor | `extension/utils/extractors/lever.ts` | Task 1 |
| 6 | Create generic fallback extractor (ld+json, meta, heuristics) | `extension/utils/extractors/generic.ts` | Task 1 |
| 7 | Create `scrapeJobDetails` orchestrator | `extension/utils/scrapeJobDetails.ts` | Tasks 2-6 |
| 8 | Replace mock in `useExtractJob.ts` with real scraping | `extension/entrypoints/main-popup.content/hooks/useExtractJob.ts` | Task 7 |
| 9 | Update `useExtractJob.test.tsx` for async scraping | `extension/entrypoints/main-popup.content/hooks/useExtractJob.test.tsx` | Task 8 |
| 10 | Write unit tests for `extractSkills` | `extension/utils/extractSkills.test.ts` | Task 1 |
| 11 | Write unit tests for `scrapeJobDetails` orchestrator | `extension/utils/scrapeJobDetails.test.ts` | Task 7 |
| 12 | Write unit tests for individual extractors | `extension/utils/extractors/*.test.ts` | Tasks 2-6 |

Tasks 1-6 can be done in parallel. Task 7 depends on all extractors. Task 8 depends on 7. Tasks 10-12 can run in parallel with tasks 8-9.

## 5. Testing Strategy

**Unit tests for extractors:** Each extractor test creates a minimal DOM using `DOMParser`. Create a helper that builds a `Document` from an HTML string:

```ts
function createDoc(html: string): Document {
  const parser = new DOMParser();
  return parser.parseFromString(html, 'text/html');
}
```

Test each extractor with:
- Happy path: full HTML with all expected elements
- Missing elements: should return empty strings, not throw
- Malformed content: should handle gracefully

**Unit tests for `extractSkills`:**
- Input with known skills returns them
- Case insensitivity works
- Skills with special chars (C++, C#, Node.js) are matched
- Empty input returns empty array
- Duplicate mentions return unique list

**Integration: `useExtractJob` tests:**
- Mock `scrapeJobDetails` at the module level
- Test the hook's state transitions with controlled return values
- Test error handling when scraper throws

## 6. Security Considerations

- All extracted text is rendered via React JSX `{value}` interpolation (no `dangerouslySetInnerHTML`), as already established in the `ExtractFinishedPanel`
- `isExtractedJobDetails` validates all field types and lengths before state is set
- `scrapeJobDetails` enforces max lengths via `.slice()` as a defense-in-depth measure
- ld+json parsing is wrapped in try/catch to prevent malformed JSON from crashing extraction
- No `eval` or `innerHTML` anywhere in the extraction pipeline

## 7. Edge Cases and Failure Modes

| Scenario | Handling |
|----------|----------|
| Page has no job content at all | Generic extractor returns mostly empty strings; `isExtractedJobDetails` passes but title check (`result.title !== ''`) in hook fails; error state set |
| ld+json is malformed | try/catch in generic extractor; falls through to DOM heuristics |
| LinkedIn is logged out (different DOM) | Multiple selector fallbacks in LinkedIn extractor |
| Page is still loading (SPA) | Content script runs on `document_idle` by default in WXT; most content should be rendered. If not, the extraction returns whatever is available. User can click "Extract Again" |
| Very long description (>50K chars) | Truncated to 50K by orchestrator `.slice(0, 50_000)` |
| No skills found in description | Returns empty array; UI shows empty skills row (graceful) |
| User cancels during extraction | `cancelledRef` check prevents stale result from updating state |
