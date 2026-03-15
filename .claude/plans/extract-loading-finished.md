# Extract Loading & Finished Panels — Implementation Plan

> Branch: `extract`
> UI Design source: `.claude/docs/resume-fitter-ui-design.pen`
> - Extract Loading State: node `WaLCb`
> - Extract Finished State: node `paZSO`

---

## 1. Overview

Two new body panels that plug into the existing `MainPopup` shell:

```
MainPopup (header + footer + children slot)   ← exists
  └── children (swapped per AppView)
       ├── InitialPanel         ← exists
       ├── ProfilePanel         ← exists
       ├── ExtractLoadingPanel  ← NEW (this plan)
       ├── ExtractFinishedPanel ← NEW (this plan)
       ├── ProgressPanel        (future)
       └── ResultPanel          (future)
```

**Flow:** User clicks "Extract Job" on InitialPanel --> App transitions to `extracting` view --> `ExtractLoadingPanel` shows scanning animation --> extraction completes --> App transitions to `extract-done` view --> `ExtractFinishedPanel` shows extracted details --> User clicks "Fit My CV" or "Extract Again".

**Non-job page guard:** When the current page is not a recognized job posting (e.g., dev.to homepage, Google, etc.), the "Extract Job" button on `InitialPanel` must be **disabled** with a hint explaining the user needs to navigate to a job page first. Detection is done via URL pattern matching in a `useJobPageDetection` hook.

---

## 2. New Types

### 2a. `ExtractedJobDetails` — `extension/types/extract.ts` (~20 lines)

The data shape returned by the extraction process. Stored in the pipeline session.

```ts
// extension/types/extract.ts

interface ExtractedJobDetails {
  title: string;
  company: string;
  location: string;
  skills: string[];       // e.g. ["React", "TypeScript", "Node.js"]
  description: string;    // full job description text for pipeline
}

export type { ExtractedJobDetails };
```

**Why a separate file?** This type is used by the extraction hook, both panels, the pipeline session storage, and the background script. It needs a shared location, and `pipeline.ts` already covers agent pipeline types, not extraction.

### 2b. Extend `PipelineSession` in `extension/types/pipeline.ts`

Add an optional `extractedJob` field to hold extraction results before the pipeline runs:

```ts
// Add to PipelineSession interface
interface PipelineSession {
  // ... existing fields
  extractedJob?: ExtractedJobDetails;  // NEW — populated after extraction
}
```

---

## 3. New Hook: `useExtractJob` — `extension/entrypoints/main-popup.content/hooks/useExtractJob.ts` (~60 lines)

Encapsulates the job extraction logic. Sends a message to the background script to scrape the current page, receives results.

```ts
interface UseExtractJobReturn {
  extractedJob: ExtractedJobDetails | null;
  isExtracting: boolean;
  error: string | null;
  startExtraction: () => void;
  cancelExtraction: () => void;
  resetExtraction: () => void;
}
```

**State management approach:**
- Uses local React state for `isExtracting`, `error`, and `extractedJob`. This is UI-only transient state (not pipeline state).
- Sends `{ type: 'extract-job' }` message to background SW.
- Background SW sends the current tab's URL + content to a simple extraction function (or later to an LLM endpoint).
- On success, sets `extractedJob` with the parsed result.
- On cancel, resets to idle.
- `resetExtraction` clears the result so the user can re-extract.

**Why local React state, not browser.storage?**
- Extraction state is purely UI-local — it only matters while the popup is open.
- It is short-lived (seconds) and does not need to survive SW restarts.
- Only after the user clicks "Fit My CV" does the extracted data get persisted into `pipelineSession`.

---

## 3b. New Hook: `useJobPageDetection` — `extension/entrypoints/main-popup.content/hooks/useJobPageDetection.ts` (~30 lines)

Detects whether the current tab URL is a recognized job posting page. Used to disable the "Extract Job" button on non-job pages.

```ts
interface UseJobPageDetectionReturn {
  isJobPage: boolean;
  isDetecting: boolean;  // true while fetching the current tab URL
}
```

**Detection logic — URL pattern matching:**
- Uses `browser.tabs.query({ active: true, currentWindow: true })` to get the current tab URL.
- Checks the URL against known job board patterns:
  - LinkedIn: `/jobs/view/`, `/jobs/search/`, `/jobs/collections/`
  - Indeed: `/viewjob`, `/jobs`
  - Glassdoor: `/job-listing/`, `/Job/`
  - Custom patterns can be added later
- Returns `isJobPage: true` if the URL matches any known pattern.
- Returns `isJobPage: false` for non-matching URLs (e.g., `dev.to`, `google.com`, blank pages).
- Re-checks when the popup opens (runs once on mount).

```ts
const JOB_PAGE_PATTERNS = [
  /linkedin\.com\/jobs\//i,
  /indeed\.com\/(viewjob|jobs)/i,
  /glassdoor\.com\/(job-listing|Job)\//i,
  /greenhouse\.io\/.*\/jobs\//i,
  /lever\.co\//i,
  /workday\.com\/.*\/job\//i,
  /careers\./i,
  /\/jobs?\//i,           // generic fallback: any URL with /job/ or /jobs/
];
```

**Why a separate hook?** Single responsibility — extraction logic (`useExtractJob`) should not be coupled to page detection. The detection result flows into `App.tsx` which conditionally enables/disables the extract button.

---

## 4. New Message Types — `extension/types/messages.ts`

Add the extraction request message to the existing message types. Result/error message types are **deferred** until the real background handler is implemented (no-premature-abstraction rule — the hook uses a local mock stub in this plan):

```ts
interface ExtractJobMessage {
  type: 'extract-job';
}

// Update the union
type ExtensionMessage =
  | RunPipelineMessage
  | CancelPipelineMessage
  | ExtractJobMessage;
```

---

## 5. Extend `AppView` and `App.tsx`

### 5a. Updated `AppView` type

```ts
type AppView = 'initial' | 'profile' | 'extracting' | 'extract-done';
```

### 5b. Updated `App.tsx` flow (~90 lines, within 300 limit)

**Note:** Export `derivePopupStatus` as a named export so Task 13 can unit-test it directly.

```tsx
function App() {
  const { profile, isLoading } = useUserProfile();
  const { isJobPage } = useJobPageDetection();
  const [view, setView] = useState<AppView>('initial');
  const {
    extractedJob,
    isExtracting,
    error: extractError,
    startExtraction,
    cancelExtraction,
    resetExtraction,
  } = useExtractJob();

  // ... existing hasProfile + derivePopupStatus logic

  const handleExtractJob = () => {
    startExtraction();
    setView('extracting');
  };

  const handleCancelExtraction = () => {
    cancelExtraction();
    setView('initial');
  };

  const handleFitCv = () => {
    if (!extractedJob) return;
    // Send run-pipeline message with extracted data
    browser.runtime.sendMessage({
      type: 'run-pipeline',
      jobDescription: extractedJob.description,
      jobTitle: extractedJob.title,
      jobCompany: extractedJob.company,
    });
    // TODO: transition to pipeline progress view (future)
  };

  const handleExtractAgain = () => {
    resetExtraction();
    startExtraction();
    setView('extracting');
  };

  // Transition from extracting -> extract-done on success, or back to initial on error
  useEffect(() => {
    if (view === 'extracting' && !isExtracting && extractedJob) {
      setView('extract-done');
    }
    if (view === 'extracting' && !isExtracting && extractError) {
      // TODO: show error UI or toast — for now, return to initial
      setView('initial');
    }
  }, [view, isExtracting, extractedJob, extractError]);

  return (
    <MainPopup status={popupStatus} onClose={handleClose}>
      {view === 'initial' && (
        <InitialPanel
          ...
          isJobPage={isJobPage}  // NEW — disables Extract Job on non-job pages
        />
      )}
      {view === 'profile' && (
        <ProfilePanel ... />
      )}
      {view === 'extracting' && (
        <ExtractLoadingPanel onCancel={handleCancelExtraction} />
      )}
      {view === 'extract-done' && extractedJob && (
        <ExtractFinishedPanel
          job={extractedJob}
          onFitCv={handleFitCv}
          onExtractAgain={handleExtractAgain}
        />
      )}
    </MainPopup>
  );
}
```

### 5c. Updated `derivePopupStatus`

```ts
function derivePopupStatus(
  hasProfile: boolean,
  isLoading: boolean,
  view: AppView,
): PopupStatus {
  if (isLoading) return 'connected';
  if (view === 'extracting') return 'connected';   // NEW — footer shows "Extracting..."
  if (view === 'extract-done') return 'complete';   // NEW — footer shows "Ready to fit"
  if (view === 'profile') return hasProfile ? 'complete' : 'incomplete';
  return hasProfile ? 'connected' : 'incomplete';
}
```

### 5d. Updated `PopupFooter` status

The footer STATUS_CONFIG needs two new statuses to match the designs:

**Extract Loading design** shows: amber dot + "Extracting..."
**Extract Finished design** shows: green dot + "Ready to fit"

Options:
- Option A: Add new status values to `PopupStatus` type (`'extracting'`, `'ready-to-fit'`).
- Option B: Allow the parent to pass a custom label override.

**Decision: Option A** — add `'extracting'` and `'ready'` to `PopupStatus`. The existing `'complete'` keeps its "Profile complete" label unchanged.

Final `PopupStatus` type (in `MainPopup.tsx`):
```ts
export type PopupStatus = 'connected' | 'incomplete' | 'complete' | 'error' | 'extracting' | 'ready';
```

Final `STATUS_CONFIG` (in `PopupFooter.tsx`):
```ts
const STATUS_CONFIG = {
  connected: { color: 'bg-success-500', label: 'Connected' },
  incomplete: { color: 'bg-warning-500', label: 'Profile incomplete' },
  complete: { color: 'bg-success-500', label: 'Profile complete' },
  extracting: { color: 'bg-accent-400', label: 'Extracting...' },
  ready: { color: 'bg-success-500', label: 'Ready to fit' },
  error: { color: 'bg-error-500', label: 'Error' },
} as const;
```

**Important:** `PopupFooter.tsx` currently defines its own inline `PopupFooterProps` with a hardcoded status union type. Update it to import and use the canonical `PopupStatus` type from `MainPopup.tsx` instead of duplicating the union.

Update `derivePopupStatus`:
```ts
if (view === 'extract-done') return 'ready';
```

---

## 6. Component: `ExtractLoadingPanel` — `extension/entrypoints/main-popup.content/components/ExtractLoadingPanel.tsx` (~80 lines)

### Props

```ts
interface ExtractLoadingPanelProps {
  onCancel: () => void;
}
```

### Design Specifications (from pencil node `WaLCb`)

**Layout:** Vertical flex, centered items, `gap-5`, `p-5`

**Pulsing Icon (3-ring concentric circles):**
- **Outer ring:** 72x72px, `rounded-full`, `bg-accent-50` (#FFF8ED), `shadow-[0_0_20px_rgba(245,166,35,0.09),0_0_40px_rgba(245,166,35,0.03)]`
- **Middle ring:** 56x56px, `rounded-full`, `bg-accent-100` (#FEECD0), centered inside outer (8px inset)
- **Inner circle:** 40x40px, `rounded-full`, `bg-accent-400` (#F5A623), centered inside middle (8px inset)
- **Icon:** lucide `ScanSearch`, 20px, white, centered in inner circle
- **Animation:** The entire icon assembly pulses with `animate-pulse-soft` (existing keyframe: `rf-pulse-soft 2s ease-in-out infinite`, opacity 1 -> 0.6 -> 1)

Implementation — absolute positioning with concentric div nesting:
```tsx
<div className="relative h-[72px] w-[72px]">
  {/* Outer */}
  <div className="absolute inset-0 rounded-full bg-accent-50 shadow-glow animate-pulse-soft" />
  {/* Middle */}
  <div className="absolute inset-2 rounded-full bg-accent-100" />
  {/* Inner */}
  <div className="absolute inset-4 flex items-center justify-center rounded-full bg-accent-400">
    <ScanSearch size={20} strokeWidth={1.5} className="text-white" />
  </div>
</div>
```

**Text Group:**
- Title: "Extracting job details" — `font-display text-xl text-surface-900 text-center` (Instrument Serif, 20px)
- Subtitle: "Scanning the current page for job information..." — `font-body text-sm text-surface-500 text-center max-w-[280px] leading-relaxed` (DM Sans, 13px, line-height 1.5)
- Gap between title and subtitle: `gap-1` (4px)

**Progress Bar:**
- Track: full width, 4px height, `rounded-full`, `bg-surface-200` (#E8E4DD)
- Fill: 4px height, `rounded-full`, `bg-accent-400` (#F5A623)
- Animation: uses existing `animate-progress` keyframe (`rf-progress 1.5s ease-in-out infinite`, translateX -100% -> 250%)
- The fill element width is a fraction of the track (about 40%); the animation slides it across
- Track has `overflow-hidden` to clip the moving fill

```tsx
<div className="w-full overflow-hidden rounded-full bg-surface-200 h-1">
  <div className="h-full w-2/5 rounded-full bg-accent-400 animate-progress" />
</div>
```

**Cancel Button:**
- Full width, 40px height, `rounded` (10px), `bg-surface-100` (#F3F0EB), `border border-surface-200` (#E8E4DD)
- Icon: lucide `X`, 14px, `text-surface-600` (#6B655B)
- Text: "Cancel" — DM Sans, 13px, font-weight 600, `text-surface-600`
- Gap between icon and text: `gap-1.5` (6px)
- Hover: `hover:bg-surface-200`

```tsx
<button
  type="button"
  onClick={onCancel}
  className="flex h-10 w-full items-center justify-center gap-1.5 rounded bg-surface-100 border border-surface-200 font-body text-sm font-semibold text-surface-600 transition-colors hover:bg-surface-200"
>
  <X size={14} strokeWidth={1.5} />
  Cancel
</button>
```

---

## 7. Component: `ExtractFinishedPanel` — `extension/entrypoints/main-popup.content/components/ExtractFinishedPanel.tsx` (~130 lines)

### Props

```ts
interface ExtractFinishedPanelProps {
  job: ExtractedJobDetails;
  onFitCv: () => void;
  onExtractAgain: () => void;
}
```

### Design Specifications (from pencil node `paZSO`)

**Layout:** Vertical flex, centered items, `gap-5`, `p-5`

**Success Icon (2-ring):**
- **Outer ring:** 56x56px, `rounded-full`, `bg-success-50` (#ECFDF3), `shadow-[0_0_20px_rgba(34,197,94,0.09)]`
- **Inner circle:** 40x40px, `rounded-full`, `bg-success-500` (#22C55E), centered (8px inset)
- **Icon:** lucide `Check`, 22px, white, centered in inner circle

```tsx
<div className="relative h-14 w-14">
  <div className="absolute inset-0 rounded-full bg-success-50 shadow-[0_0_20px_rgba(34,197,94,0.09)]" />
  <div className="absolute inset-2 flex items-center justify-center rounded-full bg-success-500">
    <Check size={22} strokeWidth={2} className="text-white" />
  </div>
</div>
```

**Text:**
- Title: "Job details extracted" — `font-display text-xl text-surface-900 text-center` (Instrument Serif, 20px)
- Subtitle: "Found the following from this page" — `font-body text-sm text-surface-500 text-center` (DM Sans, 13px)

**Job Details Card:**
- Container: `rounded bg-white border border-surface-200 w-full overflow-hidden`
- 4 rows, each row is a key-value pair:
  - Row padding: `px-3.5 py-2.5` (14px horizontal, 10px vertical)
  - Row border: bottom border `border-surface-100` (#F3F0EB) on all rows except the last
  - Label: DM Sans, 11px, font-weight 600, `text-surface-400` (#B5AFA4)
  - Value: DM Sans, 13px, font-weight 500, `text-surface-900` (#1C1915)
  - Gap between label and value: `gap-2` (8px)
  - Layout: horizontal flex, `items-center`

Rows:
| Label | Value source | Display |
|---|---|---|
| Title | `job.title` | Plain text |
| Company | `job.company` | Plain text |
| Location | `job.location` | Plain text |
| Skills | `job.skills` | Comma-separated, with "+N" for overflow (e.g. "React, TypeScript, Node.js +4") |

**Skills overflow logic:**
- Show first 3 skills comma-separated.
- If more than 3, append ` +{remaining count}`.
- Example: `["React", "TypeScript", "Node.js", "GraphQL", "AWS", "Docker", "Kubernetes"]` -> `"React, TypeScript, Node.js +4"`

```ts
function formatSkills(skills: string[]): string {
  const MAX_VISIBLE = 3;
  if (skills.length <= MAX_VISIBLE) return skills.join(', ');
  return `${skills.slice(0, MAX_VISIBLE).join(', ')} +${skills.length - MAX_VISIBLE}`;
}
```

**Card JSX:**
```tsx
<div className="w-full overflow-hidden rounded border border-surface-200 bg-white">
  <DetailRow label="Title" value={job.title} hasBorder />
  <DetailRow label="Company" value={job.company} hasBorder />
  <DetailRow label="Location" value={job.location} hasBorder />
  <DetailRow label="Skills" value={formatSkills(job.skills)} />
</div>
```

**`DetailRow` — inline sub-component** (not extracted to a separate file; only used here):
```tsx
function DetailRow({ label, value, hasBorder = false }: {
  label: string;
  value: string;
  hasBorder?: boolean;
}) {
  return (
    <div className={`flex items-center gap-2 px-3.5 py-2.5 ${hasBorder ? 'border-b border-surface-100' : ''}`}>
      <span className="font-body text-[11px] font-semibold text-surface-400">{label}</span>
      <span className="font-body text-sm font-medium text-surface-900">{value}</span>
    </div>
  );
}
```

**Action Buttons:**

Vertical stack, `gap-2` (8px), full width.

1. **"Fit My CV" button (primary):**
   - 44px height, full width, `rounded` (10px), `bg-accent-400` (#F5A623)
   - Text: white, DM Sans, 15px, font-weight 600
   - Icon: lucide `Sparkles`, 18px, white
   - Gap between icon and text: `gap-2` (8px)
   - Shadow: `shadow-button` + amber glow `shadow-[0_0_12px_rgba(245,166,35,0.12)]`
   - Hover: `hover:bg-accent-500`, Active: `active:bg-accent-600`

```tsx
<button
  type="button"
  onClick={onFitCv}
  className="flex h-11 w-full items-center justify-center gap-2 rounded bg-accent-400 font-body text-[15px] font-semibold text-white shadow-button shadow-[0_0_12px_rgba(245,166,35,0.12)] transition-colors hover:bg-accent-500 active:bg-accent-600"
>
  <Sparkles size={18} strokeWidth={1.5} />
  Fit My CV
</button>
```

2. **"Extract Again" button (secondary):**
   - 40px height, full width, `rounded` (10px), `bg-surface-100` (#F3F0EB), `border border-surface-200`
   - Text: DM Sans, 13px, font-weight 600, `text-surface-600` (#6B655B)
   - Icon: lucide `RefreshCw`, 14px, `text-surface-600`
   - Gap: `gap-1.5` (6px)
   - Hover: `hover:bg-surface-200`

```tsx
<button
  type="button"
  onClick={onExtractAgain}
  className="flex h-10 w-full items-center justify-center gap-1.5 rounded bg-surface-100 border border-surface-200 font-body text-sm font-semibold text-surface-600 transition-colors hover:bg-surface-200"
>
  <RefreshCw size={14} strokeWidth={1.5} />
  Extract Again
</button>
```

---

## 8. File Structure — New & Modified Files

```
extension/
├── types/
│   ├── extract.ts                              # NEW — ExtractedJobDetails interface
│   ├── pipeline.ts                             # MODIFIED — add extractedJob? to PipelineSession
│   └── messages.ts                             # MODIFIED — add extract message types
│
├── entrypoints/
│   └── main-popup.content/
│       ├── App.tsx                              # MODIFIED — add extracting/extract-done views
│       ├── App.test.ts                          # NEW (~40 lines) — derivePopupStatus tests
│       ├── components/
│       │   ├── ExtractLoadingPanel.tsx          # NEW (~80 lines)
│       │   ├── ExtractLoadingPanel.test.tsx     # NEW (~60 lines)
│       │   ├── ExtractFinishedPanel.tsx         # NEW (~130 lines)
│       │   ├── ExtractFinishedPanel.test.tsx    # NEW (~80 lines)
│       │   ├── PopupFooter.tsx                 # MODIFIED — add 'extracting' + 'ready' statuses
│       │   ├── PopupFooter.test.tsx            # NEW (~50 lines) — new status tests
│       │   └── MainPopup.tsx                   # MODIFIED — update PopupStatus type
│       └── hooks/
│           ├── useExtractJob.ts                # NEW (~60 lines)
│           ├── useExtractJob.test.tsx          # NEW (~80 lines) — .tsx needed for renderHook
│           ├── useJobPageDetection.ts          # NEW (~30 lines)
│           └── useJobPageDetection.test.tsx    # NEW (~40 lines)
```

**Total new files: 10** (2 components, 6 test files, 2 hooks, 1 type file)
**Modified files: 6** (App.tsx, InitialPanel.tsx, PopupFooter.tsx, MainPopup.tsx, pipeline.ts, messages.ts)

---

## 9. Lucide Icons Required

| Icon | Used in | Size | Color |
|---|---|---|---|
| `ScanSearch` | ExtractLoadingPanel — pulsing icon | 20px | white |
| `X` | ExtractLoadingPanel — cancel button | 14px | surface-600 |
| `Check` | ExtractFinishedPanel — success icon | 22px | white |
| `Sparkles` | ExtractFinishedPanel — Fit My CV button | 18px | white |
| `RefreshCw` | ExtractFinishedPanel — Extract Again button | 14px | surface-600 |

All icons already available from `lucide-react` (already installed). `ScanSearch`, `X`, and `Sparkles` are already imported in `InitialPanel.tsx`. `Check` is imported in `ProfilePanel.tsx`. Only `RefreshCw` is new.

---

## 10. Animation Details

### Pulsing Icon (Extract Loading)

Uses existing Tailwind animation `animate-pulse-soft`:
```
@keyframes rf-pulse-soft {
  0%, 100% { opacity: 1 }
  50% { opacity: 0.6 }
}
animation: rf-pulse-soft 2s ease-in-out infinite
```

Applied to the outermost ring of the concentric circles. The opacity change creates a breathing/scanning effect on all three layers.

### Progress Bar (Extract Loading)

Uses existing Tailwind animation `animate-progress`:
```
@keyframes rf-progress {
  0% { transform: translateX(-100%) }
  100% { transform: translateX(250%) }
}
animation: rf-progress 1.5s ease-in-out infinite
```

The fill div (40% width of track) slides continuously left-to-right inside the `overflow-hidden` track. This is an indeterminate progress indicator — extraction time is not predictable.

### Entry Animation

Both panels inherit the `animate-slide-up` from the MainPopup shell. No additional entry animation needed for the panels themselves.

---

## 11. Task List

| # | Task | Files | Depends on | Acceptance Criteria |
|---|---|---|---|---|
| **1** | Create `ExtractedJobDetails` type | `extension/types/extract.ts` | -- | Type exported, has `title`, `company`, `location`, `skills: string[]`, `description` fields. **Security:** Also export a runtime type-guard `isExtractedJobDetails(data: unknown): data is ExtractedJobDetails` that validates all fields present with correct types (`string` / `string[]`) and enforces max lengths: `title` <= 200, `company` <= 200, `location` <= 200, each skill <= 100 chars, `skills.length` <= 50, `description` <= 50_000. This guard must be used wherever extraction results arrive from outside the content script. |
| **2** | Add extraction message types | `extension/types/messages.ts` | Task 1 | `ExtractJobMessage` added and exported. `ExtensionMessage` union updated. Result/error message types deferred (no-premature-abstraction). |
| **3** | Extend `PopupStatus` type | `extension/entrypoints/main-popup.content/components/MainPopup.tsx` | -- | `PopupStatus` includes `'extracting'` and `'ready'` |
| **4** | Add new statuses to PopupFooter | `extension/entrypoints/main-popup.content/components/PopupFooter.tsx` | Task 3 | Footer renders amber dot + "Extracting..." for `extracting` status; green dot + "Ready to fit" for `ready` status. **Also update the inline `PopupFooterProps` status union** (currently duplicates the `PopupStatus` type) to import and use the canonical `PopupStatus` from `MainPopup.tsx`. |
| **5** | Build `ExtractLoadingPanel` component | `extension/entrypoints/main-popup.content/components/ExtractLoadingPanel.tsx` | -- | 3-ring pulsing icon, title/subtitle text, indeterminate progress bar, cancel button. Cancel click calls `onCancel`. All animations use existing Tailwind keyframes. |
| **6** | Write `ExtractLoadingPanel` tests | `extension/entrypoints/main-popup.content/components/ExtractLoadingPanel.test.tsx` | Task 5 | Tests: renders title "Extracting job details", renders subtitle, progress bar is present, cancel button calls `onCancel` on click, pulsing animation class is present |
| **7** | Build `ExtractFinishedPanel` component | `extension/entrypoints/main-popup.content/components/ExtractFinishedPanel.tsx` | Task 1 | Success icon, title/subtitle, job details card with 4 rows, skills overflow formatting, Fit My CV + Extract Again buttons. Button clicks call respective callbacks. **Security:** All extracted values must be rendered via React JSX text interpolation (`{value}`) only -- never via `dangerouslySetInnerHTML`, `innerHTML`, or string concatenation into markup. This is critical because extracted data originates from untrusted web page content. The current `DetailRow` design using `<span>{value}</span>` is correct and must be preserved. |
| **8** | Write `ExtractFinishedPanel` tests | `extension/entrypoints/main-popup.content/components/ExtractFinishedPanel.test.tsx` | Task 7 | Tests: renders success title, renders all 4 detail rows with correct labels, skills overflow shows "+N", Fit My CV button calls `onFitCv`, Extract Again button calls `onExtractAgain`, handles empty skills gracefully |
| **9** | Create `useExtractJob` hook | `extension/entrypoints/main-popup.content/hooks/useExtractJob.ts` | Task 1 | Hook returns `extractedJob`, `isExtracting`, `error`, `startExtraction`, `cancelExtraction`, `resetExtraction`. Sends message to background on start. **Security:** (a) `cancelExtraction` must clear the timeout ref / set a `cancelled` flag so that a late-arriving result from a cancelled extraction cannot update state (race condition guard). (b) When the stub is replaced with real background messaging, the hook must validate the received result using `isExtractedJobDetails()` (from Task 1) before storing it in state. Reject and set error if validation fails. The mock stub is safe because it uses hardcoded data, but add a `// TODO: validate with isExtractedJobDetails() when real messaging is wired` comment at the point where results are received. |
| **10** | Wire up `App.tsx` with new views | `extension/entrypoints/main-popup.content/App.tsx` | Tasks 3-9 | `AppView` includes `'extracting'` and `'extract-done'`. Clicking "Extract Job" on InitialPanel transitions to extracting view. Extraction completion transitions to extract-done. Extraction error transitions back to initial (with TODO for error UI). "Fit My CV" sends `run-pipeline` message. "Extract Again" restarts extraction. "Cancel" returns to initial. `derivePopupStatus` is **exported** as a named export and returns correct status for new views. |
| **11** | Write `useExtractJob` hook tests | `extension/entrypoints/main-popup.content/hooks/useExtractJob.test.tsx` | Task 9 | **Component:** `useExtractJob` hook. **Scenarios:** (1) initial state has `extractedJob: null`, `isExtracting: false`, `error: null`; (2) `startExtraction` sets `isExtracting: true`; (3) after mock delay resolves, `isExtracting` becomes `false` and `extractedJob` is populated with `ExtractedJobDetails`; (4) `cancelExtraction` resets `isExtracting` to `false` and leaves `extractedJob` as `null`; (5) `resetExtraction` clears `extractedJob` back to `null`; (6) calling `startExtraction` while already extracting is a no-op (does not double-fire); (7) error state is set when extraction fails; **(8) Security/race-condition: after `cancelExtraction`, a late-arriving mock result does not update state (stale closure guard).** **Assertions:** Use `renderHook` + `act` from `@testing-library/react`, `vi.useFakeTimers` to control the mock delay, verify each return value after state transitions. |
| **12** | Write `PopupFooter` status tests for new statuses | `extension/entrypoints/main-popup.content/components/PopupFooter.test.tsx` | Task 4 | **Component:** `PopupFooter`. **Scenarios:** (1) renders "Extracting..." label and amber dot (`bg-accent-400`) when status is `'extracting'`; (2) renders "Ready to fit" label and green dot (`bg-success-500`) when status is `'ready'`; (3) existing statuses (`'connected'`, `'incomplete'`, `'complete'`, `'error'`) still render correctly (regression). **Assertions:** Use `render` + `screen.getByText` for labels, query dot element class for color. Follow the same pattern as `InitialPanel.test.tsx` — `defaultProps`, `beforeEach` with `vi.clearAllMocks()`. |
| **13** | Write `derivePopupStatus` unit tests | `extension/entrypoints/main-popup.content/App.test.ts` | Task 10 | **Function:** `derivePopupStatus` (export it from `App.tsx` or extract to a utility). **Scenarios:** (1) returns `'connected'` when `isLoading` is `true`; (2) returns `'extracting'` when `view` is `'extracting'`; (3) returns `'ready'` when `view` is `'extract-done'`; (4) returns `'complete'` when `view` is `'profile'` and `hasProfile` is `true`; (5) returns `'incomplete'` when `view` is `'profile'` and `hasProfile` is `false`; (6) returns `'connected'` when `view` is `'initial'` and `hasProfile` is `true`; (7) returns `'incomplete'` when `view` is `'initial'` and `hasProfile` is `false`. **Assertions:** Direct function call assertions with `expect(...).toBe(...)`. No rendering needed — pure function test. |
| **14** | E2E: Extract loading state | `e2e/tests/03-extract-loading-finished.md` Steps 1-7 | Tasks 5, 10 | **Run via `/debug-extension` skill.** Execute Steps 1-7 of `e2e/tests/03-extract-loading-finished.md`. Verify: popup opens with profile-complete state, clicking "Extract Job" transitions to loading panel, loading panel shows pulsing icon + title + subtitle + progress bar + cancel button, footer shows "Extracting...", cancel returns to initial panel. |
| **15** | E2E: Extract finished state | `e2e/tests/03-extract-loading-finished.md` Steps 8-11 | Tasks 7, 10 | **Run via `/debug-extension` skill.** Execute Steps 8-11 of `e2e/tests/03-extract-loading-finished.md`. Verify: extraction completes and transitions to finished panel, success icon displayed, job details card shows all 4 rows with correct labels/values, skills overflow shows "+N" format, footer shows "Ready to fit". |
| **16** | E2E: Extract Again and Fit My CV actions | `e2e/tests/03-extract-loading-finished.md` Steps 12-14 | Task 15 | **Run via `/debug-extension` skill.** Execute Steps 12-14 of `e2e/tests/03-extract-loading-finished.md`. Verify: "Extract Again" restarts extraction and shows loading panel, second extraction completes successfully, "Fit My CV" sends `run-pipeline` message to background service worker. |
| **17** | E2E: Visual design review | `e2e/tests/03-extract-loading-finished.md` Steps 15-16 | Tasks 14, 15 | **Run via `/debug-extension` skill.** Execute Steps 15-16 of `e2e/tests/03-extract-loading-finished.md`. Take screenshots of both loading and finished states. Validate visual design against specs: pulsing icon, progress bar, success icon, job card layout, button styles, typography, color tokens, spacing. |
| **18** | Create `useJobPageDetection` hook | `extension/entrypoints/main-popup.content/hooks/useJobPageDetection.ts` | -- | Hook queries `browser.tabs.query` for current tab URL on mount. Matches URL against known job board patterns (LinkedIn, Indeed, Glassdoor, Greenhouse, Lever, Workday, generic `/jobs/` fallback). Returns `{ isJobPage: boolean, isDetecting: boolean }`. Returns `false` for non-matching URLs like `dev.to`, `google.com`, etc. |
| **19** | Update `InitialPanel` to accept `isJobPage` prop | `extension/entrypoints/main-popup.content/components/InitialPanel.tsx` | Task 18 | Add `isJobPage: boolean` prop. When `isJobPage` is `false`: disable the "Extract Job" button (`disabled` attribute + `opacity-50 cursor-not-allowed` styles) and show a hint text below the button: "Navigate to a job posting to extract" in `text-xs text-surface-400 text-center`. When `isJobPage` is `true`: button is enabled as before, hint is hidden. |
| **20** | Wire `useJobPageDetection` into `App.tsx` | `extension/entrypoints/main-popup.content/App.tsx` | Tasks 18, 19 | Import `useJobPageDetection`, pass `isJobPage` to `InitialPanel`. Extract button handler should also guard: `if (!isJobPage) return;` before calling `startExtraction`. |
| **21** | Write `useJobPageDetection` tests | `extension/entrypoints/main-popup.content/hooks/useJobPageDetection.test.tsx` | Task 18 | **Scenarios:** (1) returns `isJobPage: true` for LinkedIn job URL; (2) returns `isJobPage: true` for Indeed job URL; (3) returns `isJobPage: false` for `https://dev.to`; (4) returns `isJobPage: false` for `https://google.com`; (5) returns `isDetecting: true` initially, then `false` after resolution; (6) handles `tabs.query` returning empty array gracefully. Mock `browser.tabs.query` via `vi.fn()`. |
| **22** | E2E: Non-job page extraction guard | `e2e/tests/03-extract-loading-finished.md` Steps 17-19 | Tasks 19, 20 | **Run via `/debug-extension` skill.** Navigate to `https://dev.to`. Open popup. Verify "Extract Job" button is disabled. Verify a hint message is displayed explaining the user needs to navigate to a job posting. |

---

## 12. Reusable Elements from Existing Codebase

| Existing Asset | Reused In | How |
|---|---|---|
| `MainPopup` shell (header + footer + children) | Both panels | Panels render as `children` inside shell |
| `PopupHeader` / `PopupFooter` | Both panels (via MainPopup) | No changes to header; footer gets new statuses |
| `animate-pulse-soft` keyframe | ExtractLoadingPanel | Applied to pulsing icon outer ring |
| `animate-progress` keyframe | ExtractLoadingPanel | Applied to progress bar fill |
| Design tokens (accent-50/100/400, surface-*, success-*) | Both panels | All colors from existing CSS vars |
| `shadow-glow` Tailwind utility | ExtractLoadingPanel | For pulsing icon outer glow |
| `shadow-button` Tailwind utility | ExtractFinishedPanel | For Fit My CV button |
| `useUserProfile` hook | App.tsx (already used) | No changes needed |
| `lucide-react` icons | Both panels | Already installed; only `RefreshCw` is new import |
| Button styling patterns from `InitialPanel` / `ProfilePanel` | Both panels | Same inline Tailwind classes, no shared Button component (per no-premature-abstraction rule) |

---

## 13. Background Script Changes (Minimal)

The background script (`extension/entrypoints/background.ts`) needs a listener for the `extract-job` message type. However, the actual extraction logic (DOM scraping, LLM-based parsing) is out of scope for this plan. The hook will use a **stub implementation** that simulates a 2-second extraction delay and returns mock data, to be replaced when the scraper is implemented.

```ts
// Stub in useExtractJob.ts — to be replaced with real messaging
const MOCK_DELAY = 2000;
const MOCK_JOB: ExtractedJobDetails = {
  title: 'Senior Frontend Engineer',
  company: 'Acme Corp',
  location: 'Tel Aviv, Israel',
  skills: ['React', 'TypeScript', 'Node.js', 'GraphQL', 'AWS', 'Docker', 'Kubernetes'],
  description: 'We are looking for a Senior Frontend Engineer...',
};
```

---

## 14. Accessibility

| Element | Implementation |
|---|---|
| Cancel button | `<button type="button">` — native focusable |
| Fit My CV button | `<button type="button">` — native focusable |
| Extract Again button | `<button type="button">` — native focusable |
| Progress bar | `role="progressbar"` + `aria-label="Extraction in progress"` on the track |
| Success icon | `aria-hidden="true"` on decorative icon container |
| Pulsing icon | `aria-hidden="true"` on decorative animation container |
| Loading state | `aria-live="polite"` on the title text so screen readers announce the extracting state |
| Job details card | Semantic structure with label/value pairs; labels use `aria-hidden` if visual-only, or structured as definition list |
| Tab order | Natural DOM order: cancel button (loading), or Fit My CV -> Extract Again (finished) |

---

## 15. Rules Compliance Checklist

| Rule (wxt-react-rules.md) | Compliance |
|---|---|
| Max 300 lines per file | ExtractLoadingPanel ~80 lines, ExtractFinishedPanel ~130 lines, useExtractJob ~60 lines |
| Single responsibility | Each panel is one screen state; hook handles extraction logic only |
| Entrypoints kept thin | No changes to `index.tsx`; App.tsx adds view routing only |
| Shared UI in `components/` | No new shared components needed — panels are entrypoint-specific |
| Use `browser.*` not `chrome.*` | All messaging via `browser.runtime.sendMessage` |
| TypeScript strict mode | All interfaces explicitly typed, no `any` |
| No `eval` or `innerHTML` | All rendering via React JSX |
| No premature abstraction | `DetailRow` is inline in `ExtractFinishedPanel` (single consumer). No shared Button component. `formatSkills` is inline. |
| Small focused hooks | `useExtractJob` does one thing — extraction state management |
| Flat over nested | Component tree stays 2 levels deep (Shell > Panel) |
| Prefer built-ins | No new dependencies; `RefreshCw` from already-installed `lucide-react` |
| State persistence | Extraction state is local React state (intentional — short-lived UI state). Pipeline data persisted only when user commits via "Fit My CV". |
| Content script isolation | No DOM manipulation; all rendering in Shadow DOM via React |
| Test co-location | Test files next to source files |
| Input validation | `isExtractedJobDetails` type-guard validates untrusted extraction data (Task 1) |
| No premature abstraction (messages) | Result/error message types deferred until background handler exists (Section 4) |

---

## 16. Validation

**Reviewed: 2026-03-15 by WXT-React Expert Agent**

**Status: PASS** -- plan is compliant with `wxt-react-rules.md` and WXT/React best practices.

---

## 17. Security Review

**Reviewed: 2026-03-15 by Security Engineer**

**Status: PASS** -- plan is approved with inline security requirements noted in Tasks 1, 7, 9, and 11.

| Area | Assessment |
|---|---|
| Content script isolation / CSP | PASS. All rendering via React JSX inside Shadow DOM (`createShadowRootUi`). No `eval`, `innerHTML`, or dynamic script injection. CSP-compliant. |
| Extension permissions | PASS. Manifest requests only `storage` and `tabs` -- minimal necessary. No new permissions required. |
| XSS from untrusted content | PASS (with requirement in Task 7). Extracted job data originates from untrusted web pages. React JSX auto-escapes text in `{value}` expressions. `DetailRow` uses `<span>{value}</span>` -- no `dangerouslySetInnerHTML`. Task 7 requires preserving this pattern. |
| Input validation | PASS (with requirement in Task 1). Runtime type-guard `isExtractedJobDetails` with field-type checks and max-length constraints. Task 9 requires using this guard when real messaging replaces the stub. Background script already validates `sender.id` and enforces `jobDescription` length in `isRunPipelineMessage`. |
| Race conditions | PASS (with requirement in Tasks 9, 11). Cancellation guard prevents stale extraction results from updating state. Test scenario added. |
| Messaging security | PASS. Uses `browser.runtime.sendMessage` (extension-internal only). Background validates `sender.id === browser.runtime.id`. No `externally_connectable` or cross-origin messaging. |
| Data storage | PASS. Extraction state is transient React state (not persisted). Only committed to `browser.storage.session` when user clicks "Fit My CV", routed through the validated `run-pipeline` path. |
| Dependencies / supply chain | PASS. No new npm packages. No supply-chain risk increase. |

**Fixes applied during review:**

1. **Section 4 (messages.ts):** Removed premature `ExtractJobResultMessage` and `ExtractJobErrorMessage` types. The hook uses a local mock stub; result/error message types should be added when the real background handler is built (no-premature-abstraction rule).
2. **Section 5b (App.tsx):** Added note to export `derivePopupStatus` so Task 13 can unit-test it. Added error-case handling in the `useEffect` -- extraction errors now transition back to `initial` instead of leaving the UI stuck on the loading screen.
3. **Section 5d (PopupStatus):** Consolidated the redundant two-step evolution into a single final state. Added note that `PopupFooter.tsx` must import `PopupStatus` from `MainPopup.tsx` instead of maintaining a duplicate inline union type.
4. **Task 2:** Acceptance criteria updated to reflect deferred result/error types.
5. **Task 4:** Acceptance criteria updated to include fixing the duplicate `PopupFooterProps` type.
6. **Task 10:** Acceptance criteria updated to include error transition and `derivePopupStatus` export.
7. **Task 11 / file structure:** Fixed file extension from `.test.ts` to `.test.tsx` (required for `renderHook`).
