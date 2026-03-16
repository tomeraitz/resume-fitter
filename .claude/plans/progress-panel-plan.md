# Progress Panel & Pipeline Complete — Implementation Plan

> Branch: `pipline`
> UI Design source: `.claude/docs/resume-fitter-ui-design.pen`
> - Progress Panel: node `zJe5L`
> - Pipeline Complete: node `meNlQ`

---

## 1. Overview

Two new body panels that plug into the existing `MainPopup` shell, continuing the flow after the user clicks "Fit My CV" on `ExtractFinishedPanel`:

```
MainPopup (header + footer + children slot)   <- exists
  +-- children (swapped per AppView)
       |-- InitialPanel         <- exists
       |-- ProfilePanel         <- exists
       |-- ExtractLoadingPanel  <- exists
       |-- ExtractFinishedPanel <- exists
       |-- ProgressPanel        <- NEW (this plan)
       |-- PipelineCompletePanel <- NEW (this plan)
```

**Flow:** User clicks "Fit My CV" on ExtractFinishedPanel --> App transitions to `pipeline` view --> `ProgressPanel` shows 4-step progress with live updates from SSE stream --> all steps complete --> App transitions to `pipeline-done` view --> `PipelineCompletePanel` shows ATS score, Match %, flags count --> user clicks "Review CV" to view/download the tailored CV, or "Cancel" to discard.

---

## 2. Server Pipeline Route (Existing)

The server already implements the pipeline as an SSE (Server-Sent Events) endpoint at `POST /pipeline`.

### Request

```
POST /pipeline
Authorization: Bearer <JWT>
Content-Type: application/json

{
  "jobDescription": string,
  "cvTemplate": string (HTML),
  "history": string (optional)
}
```

### Response (SSE stream)

Three event types, sent in order:

1. **`step` events** (4 total, one per agent completion):
```
event: step
data: {"step": 1, "name": "hiring-manager", "output": {...}, "durationMs": 3200}
```

Agent outputs by step:
| Step | Name | Output fields |
|------|------|--------------|
| 1 | `hiring-manager` | `{ matchScore: number, cvLanguage: string, missingKeywords: string[], summary: string }` |
| 2 | `rewrite-resume` | `{ updatedCvHtml: string, keywordsNotAdded: { keyword: string, reason: string }[] }` |
| 3 | `ats-scanner` | `{ atsScore: number, problemAreas: string[], updatedCvHtml: string }` |
| 4 | `verifier` | `{ verifiedCv: string, flaggedClaims: string[] }` |

2. **`done` event** (final, after all 4 steps):
```
event: done
data: {"finalCv": "<html>...</html>"}
```

3. **`error` event** (on failure):
```
event: error
data: {"error": "Pipeline failed"}
```

### Auth

Bearer JWT signed with `SESSION_SECRET` (HS256). Validated by `requireAuth` middleware.

---

## 3. New & Modified Types

### 3a. Update `extension/types/pipeline.ts` — add `PipelineResults`

The existing types (`PipelineSession`, `AgentStep`, `StepStatus`, etc.) are already defined. We need a new type to hold the final aggregate results displayed on the Pipeline Complete screen.

```ts
// Add to extension/types/pipeline.ts

interface PipelineResults {
  atsScore: number;
  matchScore: number;
  flaggedClaims: string[];
  finalCv: string;
}

export type { /* existing exports */, PipelineResults };
```

**Why separate from `PipelineSession`?** `PipelineResults` is the derived display data for the Complete screen, assembled from individual agent step outputs. It keeps the session storage lean (the full agent outputs are large JSON blobs we don't want in `PipelineSession`).

### 3b. Update `AgentResultData` in `extension/types/pipeline.ts`

The existing `AgentResultData` discriminated union needs to match the actual server agent output shapes:

```ts
type AgentResultData =
  | { step: 'hiring-manager'; matchScore: number; missingKeywords: string[]; summary: string; cvLanguage: string }
  | { step: 'rewrite-resume'; updatedCvHtml: string; keywordsNotAdded: { keyword: string; reason: string }[] }
  | { step: 'ats-scanner'; atsScore: number; problemAreas: string[]; updatedCvHtml: string }
  | { step: 'verifier'; verifiedCv: string; flaggedClaims: string[] };
```

### 3c. Update `AppView` in `App.tsx`

```ts
type AppView = 'initial' | 'profile' | 'extracting' | 'extract-done' | 'pipeline' | 'pipeline-done';
```

### 3d. Update `PopupStatus` in `MainPopup.tsx`

Add `'pipeline'` status:

```ts
export type PopupStatus = 'connected' | 'incomplete' | 'complete' | 'error' | 'extracting' | 'ready' | 'pipeline';
```

---

## 4. New Hook: `usePipeline` — `extension/entrypoints/main-popup.content/hooks/usePipeline.ts` (~120 lines)

This hook drives the pipeline by:
1. Sending a `run-pipeline` message to the background SW
2. Watching `pipelineSession` in `browser.storage.session` for step updates
3. Deriving `PipelineResults` when all steps complete

### Interface

```ts
interface UsePipelineReturn {
  /** Current step statuses (4 entries) */
  steps: StepsRecord;
  /** Pipeline-level status: idle | running | completed | error */
  status: PipelineStatus;
  /** Number of the currently active step (1-4), or 0 if idle, 5 if done */
  currentStepNumber: number;
  /** Derived results, populated when status === 'completed' */
  results: PipelineResults | null;
  /** Error message if status === 'error' */
  error: string | null;
  /** Start the pipeline — sends message to background */
  start: (jobDescription: string, jobTitle?: string, jobCompany?: string) => void;
  /** Cancel — clears session storage */
  cancel: () => void;
}
```

### Implementation approach

- Reuses the existing `usePipelineSession` hook internally for watching `pipelineSession` storage changes.
- `start` calls `browser.runtime.sendMessage({ type: 'run-pipeline', ... })` which the background SW already handles.
- `currentStepNumber` is derived: count completed steps + 1 (capped at 4), or 0 if idle.
- `results` is derived from the completed step data: `matchScore` from step 1's output, `atsScore` from step 3's output, `flaggedClaims` from step 4's output, `finalCv` from `session.generatedCv`.
- `cancel` calls `clearPipelineSession()` (existing action).

### Why a wrapper over `usePipelineSession`?

`usePipelineSession` is a thin storage watcher. `usePipeline` adds the pipeline-specific business logic: deriving `currentStepNumber`, assembling `results`, and providing `start`/`cancel` actions with the right message format. This keeps `usePipelineSession` reusable for other consumers (e.g., a future options page or popup) while `usePipeline` is specific to the content script's progress UI.

---

## 5. Background Script Update — `extension/entrypoints/background.ts`

The existing `handleRunPipeline` function has a `TODO` for calling the backend. This needs to be implemented to:

1. Read the user profile from storage (already done)
2. `POST /pipeline` to the backend server with SSE streaming
3. Parse SSE events and update `pipelineSession` storage via `updateStepResult`, `setGeneratedCv`, `setPipelineStatus`

### Implementation (~60 lines added to existing `handleRunPipeline`)

```ts
async function handleRunPipeline(
  jobDescription: string,
  jobTitle?: string,
  jobCompany?: string,
) {
  try {
    const profile = await userProfile.getValue();
    if (!profile.cvTemplate || !profile.professionalHistory) {
      console.warn('Pipeline started without complete profile.');
      return;
    }

    await pipelineSession.setValue({
      ...EMPTY_SESSION,
      status: 'running',
      jobDescription,
      jobTitle,
      jobCompany,
    });

    const response = await fetch(`${import.meta.env.WXT_SERVER_URL}/pipeline`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${await signJwt()}`,
      },
      body: JSON.stringify({
        jobDescription,
        cvTemplate: profile.cvTemplate,
        history: profile.professionalHistory,
      }),
    });

    if (!response.ok || !response.body) {
      await setPipelineStatus('error');
      return;
    }

    // Parse SSE stream
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() ?? '';

      let eventType = '';
      for (const line of lines) {
        if (line.startsWith('event: ')) {
          eventType = line.slice(7).trim();
        } else if (line.startsWith('data: ') && eventType) {
          // Security: wrap individual JSON.parse in try/catch so one
          // malformed SSE event does not abort the entire stream.
          try {
            const data = JSON.parse(line.slice(6));
            await handleSSEEvent(eventType, data);
          } catch (parseErr) {
            console.warn('Skipping malformed SSE data:', parseErr);
          }
          eventType = '';
        }
      }
    }
  } catch (err) {
    console.error('Pipeline failed:', err);
    await setPipelineStatus('error');
  }
}
```

### SSE event handler

```ts
const STEP_NAMES: Record<number, AgentStep> = {
  1: 'hiring-manager',
  2: 'rewrite-resume',
  3: 'ats-scanner',
  4: 'verifier',
};

const VALID_SSE_EVENTS = new Set(['step', 'done', 'error']);

async function handleSSEEvent(
  eventType: string,
  data: Record<string, unknown>,
): Promise<void> {
  // Security: only process known event types
  if (!VALID_SSE_EVENTS.has(eventType)) return;

  if (eventType === 'step') {
    const stepNum = data.step;
    // Security: validate step number is an integer in [1,4]
    if (typeof stepNum !== 'number' || !Number.isInteger(stepNum) || stepNum < 1 || stepNum > 4) return;
    const stepName = STEP_NAMES[stepNum];
    if (!stepName) return;

    // Mark current step as completed with its output data
    await updateStepResult(stepName, 'completed', {
      step: stepName,
      ...data.output,
    } as AgentResultData);

    // Mark next step as running (if any)
    const nextStep = STEP_NAMES[stepNum + 1];
    if (nextStep) {
      await updateStepResult(nextStep, 'running');
    }
  } else if (eventType === 'done') {
    await setGeneratedCv(data.finalCv as string);
  } else if (eventType === 'error') {
    await setPipelineStatus('error');
  }
}
```

### Authentication

The server requires a JWT. Reuse the existing `signJwt()` helper from `extension/utils/handleExtractJob.ts` which signs a short-lived HS256 JWT using `WXT_SESSION_SECRET`. Import it in `background.ts`:

```ts
import { signJwt } from '../utils/handleExtractJob';
```

Note: `signJwt` is currently not exported — add it to the existing `export` statement in `handleExtractJob.ts`.

### Server URL

Reuse the existing `WXT_SERVER_URL` env variable (already used by `handleExtractJob.ts`):

```ts
const API_BASE_URL = import.meta.env.WXT_SERVER_URL;
```

### Mark first step as running on pipeline start

When initializing the pipeline session, mark step 1 as `running`:

```ts
await pipelineSession.setValue({
  ...EMPTY_SESSION,
  status: 'running',
  jobDescription,
  jobTitle,
  jobCompany,
  steps: {
    ...EMPTY_SESSION.steps,
    'hiring-manager': { step: 'hiring-manager', status: 'running' },
  },
});
```

---

## 6. Component: `ProgressPanel` — `extension/entrypoints/main-popup.content/components/ProgressPanel.tsx` (~180 lines)

### Props

```ts
interface ProgressPanelProps {
  steps: StepsRecord;
  currentStepNumber: number;
  onCancel: () => void;
}
```

### Design Specifications (from pencil node `zJe5L`)

**Layout:** Vertical flex, `gap-5`, `p-5`, full width

**Progress Header:**
- Title: "Tailoring your CV" -- `font-display text-xl text-surface-900` (Instrument Serif, 20px)
- Subtitle: "Analyzing job posting from LinkedIn" -- `font-body text-sm text-surface-500` (DM Sans, 13px)
- Gap: `gap-1` (4px)

Note: The subtitle text is contextual. We will use a generic "Processing your CV through the pipeline..." or derive from the job source. For now, use static text since the source is not tracked.

**Steps Section:**
A vertical timeline with 4 steps. Each step has:
- A **track** column (left): 24px wide, containing a dot and a connecting line
- A **content** column (right): step label and description

The track and content are in a horizontal flex with `gap-3` (12px).

#### Step states (3 visual variants):

**Completed step:**
- Dot: 24x24px, `rounded-full`, `bg-success-500` (#22C55E), contains lucide `Check` icon 12px white
- Line (below dot): 2px wide, `bg-success-500`
- Label: DM Sans, 14px, font-weight 600, `text-surface-900` (#1C1915)
- Description: DM Sans, 12px, `text-success-700` (#15803D) -- shows result summary (e.g. "Match score: 72 - 5 missing keywords found")
- Content padding: `pt-0.5 pb-3` (2px top, 12px bottom)

**Active (in-progress) step:**
- Dot: 24x24px, `rounded-full`, `bg-accent-400` (#F5A623), contains step number in white 12px bold, `shadow-[0_0_12px_rgba(245,166,35,0.25)]` (amber glow)
- Line (below dot): 2px wide, `bg-surface-200` (#E8E4DD)
- Label: DM Sans, 14px, font-weight 600, `text-accent-700` (#C47408 -- deep gold)
- Description: DM Sans, 12px, `text-surface-500` (#8E877C) -- shows action description (e.g. "Incorporating keywords naturally...")
- Content padding: `pt-0.5 pb-3`

**Pending step:**
- Dot: 24x24px, `rounded-full`, `bg-surface-200` (#E8E4DD), contains step number in `text-surface-500` 12px medium
- Line (below dot): 2px wide, `bg-surface-200` -- only shown if NOT the last step
- Label: DM Sans, 14px, font-weight 500, `text-surface-400` (#B5AFA4)
- Description: DM Sans, 12px, `text-surface-300` (#D4CFC6) -- "Waiting..."
- Content padding: `pt-0.5 pb-3` (no bottom padding on last step)

#### Step configuration constant

```ts
const STEP_CONFIG = [
  {
    key: 'hiring-manager' as AgentStep,
    label: 'Hiring Manager Review',
    activeDesc: 'Analyzing job requirements...',
    completedDesc: (data: AgentResultData) => {
      if (data.step !== 'hiring-manager') return '';
      return `Match score: ${data.matchScore} \u00B7 ${data.missingKeywords.length} missing keywords found`;
    },
  },
  {
    key: 'rewrite-resume' as AgentStep,
    label: 'Rewriting Resume',
    activeDesc: 'Incorporating keywords naturally...',
    completedDesc: () => 'Resume rewritten successfully',
  },
  {
    key: 'ats-scanner' as AgentStep,
    label: 'ATS Compatibility Scan',
    activeDesc: 'Scanning for ATS compatibility...',
    completedDesc: (data: AgentResultData) => {
      if (data.step !== 'ats-scanner') return '';
      return `ATS score: ${data.atsScore} \u00B7 ${data.problemAreas.length} issues found`;
    },
  },
  {
    key: 'verifier' as AgentStep,
    label: 'Accuracy Verification',
    activeDesc: 'Cross-checking claims...',
    completedDesc: (data: AgentResultData) => {
      if (data.step !== 'verifier') return '';
      return data.flaggedClaims.length === 0
        ? 'All claims verified'
        : `${data.flaggedClaims.length} claims flagged`;
    },
  },
] as const;
```

#### Inline sub-component: `StepIndicator`

Not extracted to a shared file -- only used in `ProgressPanel`:

```tsx
function StepIndicator({
  stepNumber,
  status,
  isLast,
}: {
  stepNumber: number;
  status: StepStatus;
  isLast: boolean;
}) {
  const dot = (() => {
    if (status === 'completed') {
      return (
        <div className="flex h-6 w-6 items-center justify-center rounded-full bg-success-500">
          <Check size={12} strokeWidth={2.5} className="text-white" />
        </div>
      );
    }
    if (status === 'running') {
      return (
        <div className="flex h-6 w-6 items-center justify-center rounded-full bg-accent-400 shadow-[0_0_12px_rgba(245,166,35,0.25)]">
          <span className="font-body text-xs font-bold text-white">{stepNumber}</span>
        </div>
      );
    }
    return (
      <div className="flex h-6 w-6 items-center justify-center rounded-full bg-surface-200">
        <span className="font-body text-xs font-medium text-surface-500">{stepNumber}</span>
      </div>
    );
  })();

  return (
    <div className="flex flex-col items-center w-6">
      {dot}
      {!isLast && (
        <div
          className={`w-0.5 flex-1 ${status === 'completed' ? 'bg-success-500' : 'bg-surface-200'}`}
        />
      )}
    </div>
  );
}
```

**Cancel Button:**
- Same style as ExtractLoadingPanel cancel button
- Full width, 36px height, `rounded` (10px), `bg-surface-100` (#F3F0EB), `border border-surface-200`
- Icon: lucide `X`, 14px, `text-surface-600`
- Text: "Cancel" -- DM Sans, 13px, font-weight 600, `text-surface-600`
- Gap: `gap-1.5`
- Hover: `hover:bg-surface-200`

---

## 7. Component: `PipelineCompletePanel` — `extension/entrypoints/main-popup.content/components/PipelineCompletePanel.tsx` (~120 lines)

### Props

```ts
interface PipelineCompletePanelProps {
  results: PipelineResults;
  onReviewCv: () => void;
  onCancel: () => void;
}
```

### Design Specifications (from pencil node `meNlQ`)

**Layout:** Vertical flex, centered items, `gap-5`, `p-5`

**Success Icon (2-ring):**
- Same as ExtractFinishedPanel success icon
- Outer: 56x56px, `rounded-full`, `bg-success-50`, `shadow-[0_0_20px_rgba(34,197,94,0.09)]`
- Inner: 40x40px, `rounded-full`, `bg-success-500`, contains lucide `Check` 22px white
- Absolute positioning with `inset-2`

```tsx
<div className="relative h-14 w-14" aria-hidden="true">
  <div className="absolute inset-0 rounded-full bg-success-50 shadow-[0_0_20px_rgba(34,197,94,0.09)]" />
  <div className="absolute inset-2 flex items-center justify-center rounded-full bg-success-500">
    <Check size={22} strokeWidth={2} className="text-white" />
  </div>
</div>
```

**Text Group:**
- Title: "CV tailored successfully" -- `font-display text-xl text-surface-900 text-center`
- Subtitle: "All 4 pipeline steps completed" -- `font-body text-sm text-surface-500 text-center`
- Gap: `gap-1` (implicitly via the parent `gap-5` with separate elements, but the title/subtitle should be close together)

Actually from the design, title and subtitle appear to be separate children of the body with the same `gap-5` as other elements. Let me check: the design has `gap: 20` between all body children (icon, title, subtitle, scoreRow, actions). Title and subtitle are separate text nodes. This matches the screenshot where there is consistent spacing.

**Score Badges Row:**
A horizontal flex row with `gap-2` (8px), `justify-center`, full width. Contains 3 pill badges:

1. **ATS Badge:**
   - `rounded-full`, `bg-success-50` (#ECFDF3), `px-3 py-1.5` (12px horizontal, 6px vertical)
   - Icon: lucide `ShieldCheck`, 14px, `text-success-700` (#15803D)
   - Text: "ATS: {score}" -- DM Sans, 12px, font-weight 600, `text-success-700`
   - Gap: `gap-1` (4px)

2. **Match Badge:**
   - `rounded-full`, `bg-accent-50` (#FFF8ED), `px-3 py-1.5`
   - Icon: lucide `Target`, 14px, `text-accent-700` (#96560A)
   - Text: "Match: {score}%" -- DM Sans, 12px, font-weight 600, `text-accent-700`
   - Gap: `gap-1`

3. **Flags Badge:**
   - `rounded-full`, `bg-surface-100` (#F3F0EB), `px-3 py-1.5`
   - Icon: lucide `Flag`, 14px, `text-surface-600` (#6B655B)
   - Text: "{count} flags" -- DM Sans, 12px, font-weight 600, `text-surface-600`
   - Gap: `gap-1`

```tsx
<div className="flex w-full items-center justify-center gap-2">
  <div className="flex items-center gap-1 rounded-full bg-success-50 px-3 py-1.5">
    <ShieldCheck size={14} className="text-success-700" />
    <span className="font-body text-xs font-semibold text-success-700">
      ATS: {results.atsScore}
    </span>
  </div>
  <div className="flex items-center gap-1 rounded-full bg-accent-50 px-3 py-1.5">
    <Target size={14} className="text-accent-700" />
    <span className="font-body text-xs font-semibold text-accent-700">
      Match: {results.matchScore}%
    </span>
  </div>
  <div className="flex items-center gap-1 rounded-full bg-surface-100 px-3 py-1.5">
    <Flag size={14} className="text-surface-600" />
    <span className="font-body text-xs font-semibold text-surface-600">
      {results.flaggedClaims.length} flags
    </span>
  </div>
</div>
```

**Action Buttons:**

Vertical stack, `gap-2`, full width.

1. **"Review CV" button (primary):**
   - 44px height, full width, `rounded` (10px), `bg-accent-400` (#F5A623)
   - Text: white, DM Sans, 14px, font-weight 600
   - Icon: lucide `Eye`, 16px, white
   - Gap: `gap-2` (8px)
   - Shadow: `shadow-button` + amber glow `shadow-[0_0_12px_rgba(245,166,35,0.12)]`
   - Hover: `hover:bg-accent-500`, Active: `active:bg-accent-600`

```tsx
<button
  type="button"
  onClick={onReviewCv}
  className="flex h-11 w-full items-center justify-center gap-2 rounded bg-accent-400 font-body text-base font-semibold text-white shadow-button shadow-[0_0_12px_rgba(245,166,35,0.12)] transition-colors hover:bg-accent-500 active:bg-accent-600"
>
  <Eye size={16} strokeWidth={1.5} />
  Review CV
</button>
```

2. **"Cancel" button (secondary):**
   - 40px height, full width, `rounded` (10px), `bg-surface-100` (#F3F0EB), `border border-surface-200`
   - Same style as other secondary cancel buttons in the codebase
   - Icon: lucide `X`, 14px, `text-surface-600`
   - Text: "Cancel" -- DM Sans, 13px, font-weight 600, `text-surface-600`

```tsx
<button
  type="button"
  onClick={onCancel}
  className="flex h-10 w-full items-center justify-center gap-1.5 rounded border border-surface-200 bg-surface-100 font-body text-sm font-semibold text-surface-600 transition-colors hover:bg-surface-200"
>
  <X size={14} strokeWidth={1.5} />
  Cancel
</button>
```

---

## 8. Update `PopupFooter` — New Statuses

### Footer during pipeline progress

The design shows: amber dot + "Step X of 4" (e.g. "Step 2 of 4").

This requires a dynamic label, not just a static status string. Two options:

**Option A:** Add a `'pipeline'` status and pass the step number as an additional prop.
**Option B:** Allow `PopupFooter` to accept an optional `label` override.

**Decision: Option A** -- Add `'pipeline'` to `PopupStatus` and add an optional `pipelineStep` prop to `PopupFooter`. This keeps the component simple and avoids a generic override that could be misused.

```ts
// PopupFooter.tsx
interface PopupFooterProps {
  status: PopupStatus;
  pipelineStep?: number; // 1-4, only used when status === 'pipeline'
}

const STATUS_CONFIG = {
  // ... existing entries ...
  pipeline: { color: 'bg-accent-400', label: 'Step {n} of 4' }, // template, resolved dynamically
} as const;
```

The label for `'pipeline'` status is derived dynamically: `Step ${pipelineStep} of 4`.

### Footer during pipeline complete

The design shows: green dot + "Complete". This matches the existing `'complete'` status (`'bg-success-500'`, `'Profile complete'`). However, the label text differs: "Complete" vs "Profile complete".

**Decision:** Add a dedicated `'pipeline-done'` status:

```ts
'pipeline-done': { color: 'bg-success-500', label: 'Complete' },
```

Updated `PopupStatus`:
```ts
export type PopupStatus = 'connected' | 'incomplete' | 'complete' | 'error' | 'extracting' | 'ready' | 'pipeline' | 'pipeline-done';
```

---

## 9. Update `App.tsx` — Wire Up Pipeline Views

### Updated `derivePopupStatus`

```ts
export function derivePopupStatus(
  hasProfile: boolean,
  isLoading: boolean,
  view: AppView,
): PopupStatus {
  if (isLoading) return 'connected';
  if (view === 'extracting') return 'extracting';
  if (view === 'extract-done') return 'ready';
  if (view === 'pipeline') return 'pipeline';
  if (view === 'pipeline-done') return 'pipeline-done';
  if (view === 'profile') return hasProfile ? 'complete' : 'incomplete';
  return hasProfile ? 'connected' : 'incomplete';
}
```

### Updated `App` component

```tsx
function App() {
  // ... existing hooks ...
  const {
    steps,
    status: pipelineStatus,
    currentStepNumber,
    results: pipelineResults,
    error: pipelineError,
    start: startPipeline,
    cancel: cancelPipeline,
  } = usePipeline();

  // ... existing state ...

  // Transition pipeline states
  useEffect(() => {
    if (view === 'pipeline' && pipelineStatus === 'completed' && pipelineResults) {
      setView('pipeline-done');
    }
    if (view === 'pipeline' && pipelineStatus === 'error') {
      // TODO: show pipeline error UI — for now, return to initial
      setView('initial');
    }
  }, [view, pipelineStatus, pipelineResults]);

  const handleFitCv = () => {
    if (!extractedJob) return;
    startPipeline(
      extractedJob.description,
      extractedJob.title,
      extractedJob.company,
    );
    setView('pipeline');
  };

  const handleCancelPipeline = () => {
    cancelPipeline();
    setView('initial');
  };

  const handleReviewCv = () => {
    if (!pipelineResults?.finalCv) return;
    // Security: trigger a file download instead of window.open to avoid
    // executing any scripts/event handlers in AI-generated HTML (XSS risk).
    // No need for DOMPurify dependency (wxt-react-rules: "Prefer built-ins").
    const blob = new Blob([pipelineResults.finalCv], { type: 'text/html' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'tailored-cv.html';
    a.click();
    // Clean up after a delay
    setTimeout(() => URL.revokeObjectURL(url), 5000);
  };

  return (
    <MainPopup status={popupStatus} onClose={handleClose}>
      {/* ... existing views ... */}
      {view === 'pipeline' && (
        <ProgressPanel
          steps={steps}
          currentStepNumber={currentStepNumber}
          onCancel={handleCancelPipeline}
        />
      )}
      {view === 'pipeline-done' && pipelineResults && (
        <PipelineCompletePanel
          results={pipelineResults}
          onReviewCv={handleReviewCv}
          onCancel={handleCancelPipeline}
        />
      )}
    </MainPopup>
  );
}
```

### Pass `pipelineStep` to `PopupFooter` via `MainPopup`

`MainPopup` needs to forward the pipeline step number to the footer. Two options:

**Option A:** Add `pipelineStep` prop to `MainPopup`.
**Option B:** Compute it inside `PopupFooter` from status + a new prop.

**Decision: Option A** -- keep it explicit.

```tsx
// MainPopup.tsx
interface MainPopupProps {
  status: PopupStatus;
  pipelineStep?: number;
  onClose: () => void;
  children: ReactNode;
}

export function MainPopup({ status, pipelineStep, onClose, children }: MainPopupProps) {
  return (
    <div ...>
      <PopupHeader onClose={onClose} />
      <div className="flex-1">{children}</div>
      <PopupFooter status={status} pipelineStep={pipelineStep} />
    </div>
  );
}
```

In `App.tsx`:
```tsx
<MainPopup
  status={popupStatus}
  pipelineStep={view === 'pipeline' ? currentStepNumber : undefined}
  onClose={handleClose}
>
```

---

## 10. File Structure — New & Modified Files

```
extension/
|-- types/
|   +-- pipeline.ts                              # MODIFIED -- update AgentResultData, add PipelineResults
|
|-- services/
|   +-- storage/
|       +-- pipeline.actions.ts                  # MODIFIED -- add markStepRunning action (optional)
|
|-- entrypoints/
|   +-- background.ts                            # MODIFIED -- implement handleRunPipeline SSE logic
|   +-- main-popup.content/
|       |-- App.tsx                              # MODIFIED -- add pipeline/pipeline-done views
|       |-- components/
|       |   |-- ProgressPanel.tsx               # NEW (~180 lines)
|       |   |-- ProgressPanel.test.tsx          # NEW (~100 lines)
|       |   |-- PipelineCompletePanel.tsx       # NEW (~120 lines)
|       |   |-- PipelineCompletePanel.test.tsx  # NEW (~80 lines)
|       |   |-- MainPopup.tsx                   # MODIFIED -- add pipeline status, pipelineStep prop
|       |   +-- PopupFooter.tsx                 # MODIFIED -- add pipeline/pipeline-done statuses
|       +-- hooks/
|           |-- usePipeline.ts                  # NEW (~120 lines)
|           +-- usePipeline.test.ts             # NEW (~100 lines)
```

**Total new files: 6** (2 components, 3 test files, 1 hook)
**Modified files: 6** (pipeline.ts, background.ts, App.tsx, MainPopup.tsx, PopupFooter.tsx, pipeline.actions.ts)

---

## 11. Lucide Icons Required

| Icon | Used in | Size | Color |
|------|---------|------|-------|
| `Check` | ProgressPanel (completed step dot), PipelineCompletePanel (success icon) | 12px / 22px | white |
| `X` | ProgressPanel (cancel), PipelineCompletePanel (cancel) | 14px | surface-600 |
| `Eye` | PipelineCompletePanel (Review CV button) | 16px | white |
| `ShieldCheck` | PipelineCompletePanel (ATS badge) | 14px | success-700 |
| `Target` | PipelineCompletePanel (Match badge) | 14px | accent-700 |
| `Flag` | PipelineCompletePanel (Flags badge) | 14px | surface-600 |

`Check` and `X` are already imported elsewhere. `Eye`, `ShieldCheck`, `Target`, and `Flag` are new imports from `lucide-react` (already installed).

---

## 12. Task List

| # | Task | Files | Depends on | Acceptance Criteria |
|---|------|-------|------------|---------------------|
| **1** | Update `AgentResultData` union to match server output shapes | `extension/types/pipeline.ts` | -- | Each variant includes all fields from the corresponding server agent Zod schema. `hiring-manager` variant has `matchScore`, `missingKeywords`, `summary`, `cvLanguage`. `rewrite-resume` has `updatedCvHtml`, `keywordsNotAdded`. `ats-scanner` has `atsScore`, `problemAreas`, `updatedCvHtml`. `verifier` has `verifiedCv`, `flaggedClaims`. |
| **2** | Add `PipelineResults` type | `extension/types/pipeline.ts` | Task 1 | `PipelineResults` exported with `atsScore: number`, `matchScore: number`, `flaggedClaims: string[]`, `finalCv: string`. |
| **3** | Update `PopupStatus` type | `extension/entrypoints/main-popup.content/components/MainPopup.tsx` | -- | `PopupStatus` includes `'pipeline'` and `'pipeline-done'`. `MainPopup` accepts optional `pipelineStep?: number` prop and forwards it to `PopupFooter`. |
| **4** | Update `PopupFooter` for pipeline statuses | `extension/entrypoints/main-popup.content/components/PopupFooter.tsx` | Task 3 | `PopupFooter` accepts optional `pipelineStep?: number` prop. Renders amber dot + "Step X of 4" for `'pipeline'` status (using `pipelineStep`). Renders green dot + "Complete" for `'pipeline-done'` status. |
| **5** | Implement SSE pipeline handler in background script | `extension/entrypoints/background.ts` | Task 1 | `handleRunPipeline` sends `POST /pipeline` with profile data. Parses SSE `step`, `done`, and `error` events. Updates `pipelineSession` storage via `updateStepResult`, `setGeneratedCv`, `setPipelineStatus`. Marks step 1 as `running` on init. Marks next step as `running` when current step completes. Handles HTTP errors and network failures gracefully by setting status to `'error'`. **Security:** (1) Wrap each `JSON.parse` of SSE data lines in its own try/catch so a single malformed event does not abort the entire stream -- log the error and `continue` to the next line. (2) Validate `eventType` against an allowlist (`'step'`, `'done'`, `'error'`) before processing; ignore unknown event types. (3) In `handleSSEEvent`, validate that `data.step` is a number in `[1,4]` before lookup in `STEP_NAMES`; validate that numeric score fields (`atsScore`, `matchScore`) are finite numbers and clamp to `[0,100]` before writing to storage. (4) Use `API_BASE_URL` from `import.meta.env.VITE_API_URL` -- the fallback `localhost:3001` is dev-only; production builds must set this to an HTTPS URL. (5) Use WXT `storage.defineItem` for `sessionToken` storage access (not raw `browser.storage.local.get`) to stay consistent with the project storage convention. (6) The `run-pipeline` message handler in the listener should NOT `return true` (which keeps the message channel open indefinitely) since `handleRunPipeline` is fire-and-forget and never calls `sendResponse`. Remove `return true` or call `sendResponse()` immediately before starting async work. |
| **6** | Create `usePipeline` hook | `extension/entrypoints/main-popup.content/hooks/usePipeline.ts` | Tasks 1, 2 | Hook returns `steps`, `status`, `currentStepNumber`, `results`, `error`, `start`, `cancel`. Uses `usePipelineSession` internally. `start` sends `run-pipeline` message. `cancel` clears session. `currentStepNumber` derived from step statuses. `results` assembled from completed step data + `generatedCv`. `results` is `null` until all steps complete. **Security:** `start` must guard against double-invocation -- if `status` is already `'running'`, return early without sending another `run-pipeline` message to prevent duplicate backend requests. |
| **7** | Build `ProgressPanel` component | `extension/entrypoints/main-popup.content/components/ProgressPanel.tsx` | Task 1 | Renders 4-step vertical timeline. Each step shows correct visual state (completed/active/pending) based on `steps` prop. Completed steps show green dot with check icon + result summary in green text. Active step shows amber dot with glow + step number + description in muted text. Pending steps show gray dot with step number + "Waiting..." in light text. Connecting lines between dots: green for completed, gray otherwise. No line after last step. Cancel button calls `onCancel`. |
| **8** | Write `ProgressPanel` tests | `extension/entrypoints/main-popup.content/components/ProgressPanel.test.tsx` | Task 7 | Tests: (1) renders all 4 step labels. (2) Completed step shows check icon and result description. (3) Active step shows step number and active description. (4) Pending step shows "Waiting..." text. (5) Cancel button calls `onCancel`. (6) Step labels match config: "Hiring Manager Review", "Rewriting Resume", "ATS Compatibility Scan", "Accuracy Verification". |
| **9** | Build `PipelineCompletePanel` component | `extension/entrypoints/main-popup.content/components/PipelineCompletePanel.tsx` | Task 2 | Renders success icon, title "CV tailored successfully", subtitle "All 4 pipeline steps completed", 3 score badges (ATS, Match, Flags), "Review CV" primary button, "Cancel" secondary button. Badges display `results.atsScore`, `results.matchScore`, `results.flaggedClaims.length`. "Review CV" calls `onReviewCv`. "Cancel" calls `onCancel`. |
| **10** | Write `PipelineCompletePanel` tests | `extension/entrypoints/main-popup.content/components/PipelineCompletePanel.test.tsx` | Task 9 | Tests: (1) renders success title. (2) Renders ATS score badge with correct value. (3) Renders Match score badge with correct value. (4) Renders flags count badge. (5) "Review CV" button calls `onReviewCv`. (6) "Cancel" button calls `onCancel`. (7) Handles 0 flags correctly (shows "0 flags"). |
| **11** | Wire pipeline views into `App.tsx` | `extension/entrypoints/main-popup.content/App.tsx` | Tasks 3-6, 7, 9 | `AppView` includes `'pipeline'` and `'pipeline-done'`. Clicking "Fit My CV" calls `startPipeline` and transitions to `pipeline` view. Pipeline completion transitions to `pipeline-done`. Pipeline error transitions to `initial` (with TODO for error UI). "Review CV" opens generated CV HTML in new tab. "Cancel" clears pipeline session and returns to `initial`. `derivePopupStatus` returns correct status for pipeline views. `pipelineStep` passed to `MainPopup` when in pipeline view. **Security:** `handleReviewCv` must NOT open raw `finalCv` HTML via `Blob` + `window.open` -- this executes any `<script>` tags or inline event handlers (`onerror`, `onload`, etc.) in a full browser context, creating an XSS vector from AI-generated content. Instead, use one of: (a) create the Blob with `{ type: 'text/html' }` and open it in a sandboxed iframe with `sandbox=""` (no scripts, no same-origin), or (b) sanitize the HTML with DOMPurify before creating the Blob (strip all `<script>`, event handler attributes, `javascript:` URIs), or (c) trigger a direct file download (`<a download="cv.html">`) instead of opening in-browser. Option (c) -- trigger a direct file download -- is recommended as it avoids both the XSS risk and adding a new dependency (per **wxt-react-rules: 'Prefer built-ins'** and **'Avoid over-engineering'**). Create a Blob, set `a.download = 'tailored-cv.html'`, and call `a.click()`. No sanitization library needed. |
| **12** | Write `PopupFooter` pipeline status tests | `extension/entrypoints/main-popup.content/components/PopupFooter.test.tsx` | Task 4 | Tests: (1) renders "Step 2 of 4" with amber dot for `pipeline` status + `pipelineStep=2`. (2) Renders "Complete" with green dot for `pipeline-done` status. (3) Existing statuses still render correctly (regression). |
| **13** | Update `derivePopupStatus` tests | `extension/entrypoints/main-popup.content/App.test.ts` | Task 11 | Add tests: (1) returns `'pipeline'` when `view` is `'pipeline'`. (2) Returns `'pipeline-done'` when `view` is `'pipeline-done'`. |
| **14** | Write `usePipeline` hook tests | `extension/entrypoints/main-popup.content/hooks/usePipeline.test.ts` | Task 6 | Tests: (1) `status` is `'idle'` and `results` is `null` initially. (2) `start` sends `run-pipeline` message via `browser.runtime.sendMessage`. (3) `currentStepNumber` returns 1 when step 1 is running, 2 when step 1 is completed and step 2 is running, etc. (4) `results` is assembled correctly when all steps are completed — `matchScore` from hiring-manager output, `atsScore` from ats-scanner output, `flaggedClaims` from verifier output, `finalCv` from `generatedCv`. (5) `results` remains `null` when only some steps are completed. (6) `cancel` calls `clearPipelineSession`. (7) `error` is populated when pipeline status is `'error'`. |
| **15** | E2E: Pipeline progress — start pipeline and verify step updates | `e2e/tests/05-pipeline-progress-complete.md` (Steps 1-6) | Tasks 5, 7, 11 | Run via `/debug-extension` skill. Start pipeline from extract-finished panel by clicking "Fit My CV". Verify progress panel appears with "Tailoring your CV" heading, 4 step labels, and Cancel button. Step 1 starts active (amber dot), steps 2-4 pending (gray dots). Footer shows "Step 1 of 4". As each step completes, dot turns green with check icon, result summary appears, next step becomes active, and footer updates step number. |
| **16** | E2E: Pipeline complete — scores and actions | `e2e/tests/05-pipeline-progress-complete.md` (Steps 7-10) | Task 15 | Run via `/debug-extension` skill. After all 4 steps complete, verify UI transitions to pipeline-complete panel. Panel shows "CV tailored successfully" title, "All 4 pipeline steps completed" subtitle, 3 score badges (ATS, Match, Flags) with numeric values, "Review CV" and "Cancel" buttons. Footer shows "Complete" with green dot. "Review CV" opens generated CV in a new tab. "Cancel" returns to initial state. |
| **17** | E2E: Cancel pipeline mid-run | `e2e/tests/05-pipeline-progress-complete.md` (Step 11) | Task 15 | Run via `/debug-extension` skill. Start a pipeline, then click "Cancel" while steps are still in progress. Verify the popup returns to the initial panel and pipeline progress dots are cleared. Pipeline session is cleared from `browser.storage.session`. |
| **18** | E2E: Pipeline state persistence across popup close/reopen | `e2e/tests/05-pipeline-progress-complete.md` (Step 12) | Task 15 | Run via `/debug-extension` skill. Start a pipeline, close the popup via the close button, wait 2 seconds, then reopen via CDP `toggle-popup`. Verify the progress panel resumes showing the correct step states — completed steps remain green, active step is still active. |
| **19** | E2E: Pipeline error handling | `e2e/tests/05-pipeline-progress-complete.md` (Step 13) | Task 15 | Run via `/debug-extension` skill. Trigger a pipeline error (e.g., stop the backend server or use an invalid token). Verify the popup transitions back to the initial state without crashing. |
| **20** | E2E: Visual design review — Progress Panel and Pipeline Complete | `e2e/tests/05-pipeline-progress-complete.md` (Steps 14-15) | Tasks 15, 16 | Run via `/debug-extension` skill. Take screenshots of both the progress panel and pipeline-complete panel. Validate with `frontend-design` that the visual design matches specifications: timeline dots/lines, typography, badge colors, button styles, footer indicators. |

---

## 13. Reusable Elements from Existing Codebase

| Existing Asset | Reused In | How |
|----------------|-----------|-----|
| `MainPopup` shell (header + footer + children) | Both panels | Panels render as `children` inside shell |
| `PopupHeader` / `PopupFooter` | Both panels (via MainPopup) | Footer gets new statuses; header unchanged |
| `usePipelineSession` hook | `usePipeline` hook | Wraps session watcher with pipeline-specific logic |
| `pipelineSession` storage item | Background script | Updated via `updateStepResult`, `setGeneratedCv`, `setPipelineStatus` |
| Pipeline storage actions (`updateStepResult`, `setPipelineStatus`, `setGeneratedCv`, `clearPipelineSession`) | Background script, `usePipeline` | All existing; no new storage actions needed |
| Design tokens (accent-*, surface-*, success-*) | Both panels | All colors from existing CSS vars |
| `shadow-button` Tailwind utility | PipelineCompletePanel | For Review CV button |
| `lucide-react` icons | Both panels | Already installed; `Eye`, `ShieldCheck`, `Target`, `Flag` are new imports |
| Button styling patterns from existing panels | Both panels | Same inline Tailwind classes, no shared Button component (per no-premature-abstraction rule) |
| Success icon pattern from `ExtractFinishedPanel` | PipelineCompletePanel | Same 2-ring concentric circle design |

---

## 14. State Management Flow

```
User clicks "Fit My CV"
    |
    v
App.tsx: startPipeline() --> browser.runtime.sendMessage({ type: 'run-pipeline', ... })
    |                        setView('pipeline')
    v
background.ts: handleRunPipeline()
    |-- pipelineSession.setValue({ status: 'running', steps: { hiring-manager: running, ... } })
    |-- fetch('POST /pipeline') with SSE
    |
    |-- SSE event: step 1 complete
    |   |-- updateStepResult('hiring-manager', 'completed', data)
    |   +-- updateStepResult('rewrite-resume', 'running')
    |
    |-- SSE event: step 2 complete
    |   |-- updateStepResult('rewrite-resume', 'completed', data)
    |   +-- updateStepResult('ats-scanner', 'running')
    |
    |-- SSE event: step 3 complete
    |   |-- updateStepResult('ats-scanner', 'completed', data)
    |   +-- updateStepResult('verifier', 'running')
    |
    |-- SSE event: step 4 complete
    |   +-- updateStepResult('verifier', 'completed', data)
    |
    +-- SSE event: done
        +-- setGeneratedCv(finalCv)  // also sets status = 'completed'

Content Script (watching pipelineSession via usePipelineSession):
    |-- usePipeline derives currentStepNumber, results from session changes
    |-- ProgressPanel re-renders with updated step statuses
    |-- When status === 'completed': App.tsx transitions to 'pipeline-done'
    +-- PipelineCompletePanel renders with assembled results
```

---

## 15. Accessibility

| Element | Implementation |
|---------|---------------|
| Step indicators | `aria-label` on each step row: e.g. "Step 1: Hiring Manager Review - Completed" |
| Step status | Status descriptions read by screen readers via `aria-live="polite"` on the active step description |
| Cancel button | `<button type="button">` -- native focusable |
| Review CV button | `<button type="button">` -- native focusable |
| Success icon | `aria-hidden="true"` on decorative icon container |
| Score badges | Each badge uses semantic text; no additional ARIA needed |
| Tab order | Natural DOM order: step descriptions (non-interactive), cancel button |

---

## 16. Rules Compliance Checklist

| Rule (wxt-react-rules.md) | Compliance |
|---------------------------|------------|
| Max 300 lines per file | ProgressPanel ~180 lines, PipelineCompletePanel ~120 lines, usePipeline ~120 lines, background.ts stays under 300 with SSE handler |
| Single responsibility | Each panel is one screen state; `usePipeline` handles pipeline orchestration; background handles SSE |
| Entrypoints kept thin | `index.tsx` unchanged; App.tsx adds view routing only |
| Shared UI in `components/` | No new shared components -- panels are entrypoint-specific |
| Use `browser.*` not `chrome.*` | All messaging via `browser.runtime.sendMessage`; storage via WXT `storage.defineItem` |
| TypeScript strict mode | All interfaces explicitly typed, no `any` |
| No `eval` or `innerHTML` | All rendering via React JSX. `finalCv` HTML sanitized with DOMPurify before opening in new tab. |
| No premature abstraction | `StepIndicator` is inline in `ProgressPanel`. Score badges are inline in `PipelineCompletePanel`. No shared Button component. |
| Small focused hooks | `usePipeline` does pipeline state management. `usePipelineSession` does storage watching. |
| Flat over nested | Component tree: Shell > Panel (2 levels) |
| Prefer built-ins | Uses `fetch` for SSE (native). One new dependency: `dompurify` for HTML sanitization of AI-generated CV output. |
| State persistence | Pipeline state in `browser.storage.session` via WXT `storage.defineItem`. Survives SW restarts. Not held in memory. |
| Content script isolation | All rendering in Shadow DOM via React. No direct DOM manipulation. |
| Test co-location | Test files next to source files |
| Input validation | SSE data parsed with `JSON.parse` inside per-line try/catch; event types validated against allowlist; step numbers validated as integers in `[1,4]`; background handler validates server responses before writing to storage. |
| Zod for structured output | Server-side already validates agent outputs with Zod. Extension trusts data from its own background SW (same extension context). |
| API key security | API key stays on server. Extension sends JWT only. `fetch` to backend only from background SW, not content script. |
| Minimal permissions | No new permissions needed. `storage` and `tabs` already declared. |

---

## 17. Open Questions / Future Work

1. **Authentication**: Reuses existing `signJwt()` from `handleExtractJob.ts` (short-lived HS256 JWT via `WXT_SESSION_SECRET`).
2. **Server URL configuration**: Hardcoded to `localhost:3001` for development. Should be configurable via `import.meta.env.VITE_API_URL` for production.
3. **Pipeline error UI**: Currently, pipeline errors transition back to `initial` view. A dedicated error panel showing the specific error message would be better UX.
4. **Cancel during pipeline**: Cancelling clears the local session but does not abort the server-side processing. A future improvement could send a cancel signal to the server.
5. **CV review experience**: The current plan opens the generated CV HTML in a new tab. A future improvement could render it inline in an expanded overlay or offer download as PDF.
6. **Retry on failure**: No retry mechanism for individual failed steps. The user must cancel and restart.

---

## 18. Security Review

**Reviewed by:** Security review pass
**Date:** 2026-03-16
**Verdict:** PASS with modifications (changes applied inline to tasks 5, 6, and 11)

### Changes Made

Three existing tasks were updated with security requirements:

1. **Task 5 -- SSE handler hardening:** Added requirements for per-line JSON.parse try/catch (resilience against malformed SSE data), event type allowlist validation, step number integer validation, and a note that production builds must use HTTPS for `API_BASE_URL`. The corresponding code snippets in Section 5 were updated to reflect these changes.

2. **Task 6 -- Double-invocation guard:** Added requirement that `usePipeline.start()` must short-circuit when the pipeline is already in `'running'` status to prevent duplicate backend requests.

3. **Task 11 -- XSS prevention in CV preview (Critical):** The original `handleReviewCv` opened raw AI-generated HTML via `Blob` + `window.open`, which would execute any `<script>` tags or inline event handlers in a full browser context. This was the only critical finding. Added requirement to sanitize `finalCv` with DOMPurify before creating the Blob. The code snippet in Section 9 was updated accordingly. This adds `dompurify` as a new dependency.

### Positive Findings (No Changes Needed)

- **Content script isolation:** The popup renders inside a Shadow DOM (`createShadowRootUi`), isolating extension CSS and DOM from the host page. CSP-compliant.
- **No sensitive data in content scripts:** API keys remain on the server. The JWT is stored in `browser.storage.local` and only read by the background service worker. The content script never touches the token.
- **Message origin validation:** The background script checks `sender.id !== browser.runtime.id` before processing messages, preventing cross-extension message spoofing.
- **Input validation at message boundary:** `isRunPipelineMessage` validates `jobDescription` is a non-empty string under 50k characters before forwarding to the handler.
- **Minimal permissions:** Only `storage` and `tabs` are declared -- no `<all_urls>` host permissions, no `webRequest`, no `scripting`. No new permissions needed for this plan.
- **Server-side defense in depth:** The pipeline route validates requests with Zod, enforces JWT auth via `requireAuth`, and applies rate limiting.
- **No `eval`, `innerHTML`, or `dangerouslySetInnerHTML`:** All UI rendering goes through React JSX text interpolation, which auto-escapes values. Score numbers are rendered as text content, not as HTML.
- **Session storage scoping:** Pipeline session uses `browser.storage.session` (cleared when browser closes), not persistent `local` storage. User CV data does not persist beyond the session.
---

## Validation Status

**Reviewed: 2026-03-16** -- Plan passes WXT-React rules validation with the following changes applied:

| # | Change | Rule Reference |
|---|--------|---------------|
| 1 | **Task 5 (body + task table):** Auth uses existing `signJwt()` from `handleExtractJob.ts` instead of a new storage-based token | Consistency with existing codebase pattern |
| 2 | **Task 5 (body):** SSE `JSON.parse` wrapped in try-catch per malformed-event resilience | wxt-react-rules: "Input validation" |
| 3 | **Task 5 (body):** Hardcoded `http://localhost:3001` replaced with `API_BASE_URL` constant | wxt-react-rules: "Avoid over-engineering" (configurable from start) |
| 4 | **Task 5 (task table):** Added notes on `sessionToken` WXT storage convention and `return true` message channel issue (fire-and-forget handler should not keep channel open) | wxt-react-rules: "Prefer built-ins"; Chrome MV3 messaging best practice |
| 5 | **Task 11 (body + task table):** `handleReviewCv` changed from `window.open` (XSS risk) to `<a download>` file download -- avoids both the security issue and adding DOMPurify dependency | wxt-react-rules: "Prefer built-ins", "No `eval` or `innerHTML`", "Avoid over-engineering" |

**No structural changes made.** All fixes are modifications to existing task descriptions and code snippets. No new tasks or sections added.

**Remaining items (pre-existing, acknowledged in "Open Questions"):**
- Session token management is a stub (auth flow out of scope)
- Pipeline error UI is TODO (transitions to `initial` for now)
- Cancel does not abort server-side processing
