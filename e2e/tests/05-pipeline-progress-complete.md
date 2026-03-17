# Test 05: Pipeline Progress & Pipeline Complete

Verify the full pipeline flow — clicking "Fit My CV" on the extract-finished panel, seeing the progress panel with live step updates, pipeline completing with score badges, and the "Review CV" / "Cancel" actions.

> **Note:** The pipeline uses the real backend SSE endpoint at `localhost:3001/pipeline`.
> The background service worker sends `POST /pipeline` and parses SSE events to update
> `pipelineSession` in `browser.storage.session`. The content script watches that storage
> via `usePipelineSession` and re-renders the progress UI.
>
> Steps complete one at a time. Each SSE `step` event marks the current step as `completed`
> and the next step as `running`. The `done` event sets the final CV and marks the pipeline
> as `completed`.

## Prerequisites

- Extension dev server running (Step 1-3 from debug-extension skill)
- E2E mock server running on `localhost:3006`
- Backend server running on `localhost:3001`
- Profile is already saved (CV + work history populated via `browser.storage.local`)
- Extraction has been completed (extract-finished state reached)

## Steps

### 1. Navigate to the mock job page and reach extract-finished state

```
mcp__playwright__browser_navigate({ url: "http://localhost:3006/test-comp/jobs/4488055101" })
```

Open popup via CDP `toggle-popup`. Click "Extract Job" and wait for extraction to complete:

```js
() => {
  const shadow = document.querySelector('resume-fitter-popup')?.shadowRoot;
  const btn = Array.from(shadow?.querySelectorAll('button') || [])
    .find(b => b.textContent?.trim() === 'Extract Job');
  btn?.click();
  return btn ? 'clicked' : 'not found';
}
```

Wait 1 second, then verify the extract-finished panel is displayed with "Fit My CV" button enabled.

### 2. Click "Fit My CV" and verify pipeline progress panel appears

```js
() => {
  const shadow = document.querySelector('resume-fitter-popup')?.shadowRoot;
  if (!shadow) return 'no shadow root';

  const fitBtn = Array.from(shadow.querySelectorAll('button'))
    .find(b => b.textContent?.trim().includes('Fit My CV'));
  if (!fitBtn || fitBtn.disabled) return JSON.stringify({ error: 'button not found or disabled' });
  fitBtn.click();

  return new Promise(resolve => {
    setTimeout(() => {
      const heading = shadow.querySelector('[class*="font-display"]')?.textContent?.trim();
      const stepLabels = Array.from(shadow.querySelectorAll('[class*="font-semibold"]'))
        .map(el => el.textContent?.trim())
        .filter(t => t && !t.includes('Cancel'));
      const cancelBtn = Array.from(shadow.querySelectorAll('button'))
        .find(b => b.textContent?.trim() === 'Cancel');
      const footer = shadow.querySelector('footer')?.textContent?.trim();
      resolve(JSON.stringify({ heading, stepLabels, hasCancelBtn: !!cancelBtn, footer }));
    }, 500);
  });
}
```

**Expected:**
```json
{
  "heading": "Tailoring your CV",
  "stepLabels": ["Hiring Manager Review", "Rewriting Resume", "ATS Compatibility Scan", "Accuracy Verification"],
  "hasCancelBtn": true,
  "footer": "Step 1 of 4 v<version>"
}
```

### 3. Verify step 1 (Hiring Manager Review) is in active/running state

```js
() => {
  const shadow = document.querySelector('resume-fitter-popup')?.shadowRoot;
  if (!shadow) return 'no shadow root';

  // Active step has amber glow dot
  const amberDot = shadow.querySelector('[class*="bg-accent-400"]');
  // Pending steps have gray dots
  const grayDots = shadow.querySelectorAll('[class*="bg-surface-200"]');

  return JSON.stringify({
    hasAmberDot: !!amberDot,
    grayDotCount: grayDots.length
  });
}
```

**Expected:** `{ "hasAmberDot": true, "grayDotCount": 3 }` — step 1 is active (amber), steps 2-4 are pending (gray).

### 4. Wait for step 1 to complete and verify step transition

Wait for the first SSE `step` event (hiring-manager agent). Poll every 2 seconds, up to 60 seconds:

```js
() => {
  return new Promise(resolve => {
    let attempts = 0;
    const check = () => {
      attempts++;
      const shadow = document.querySelector('resume-fitter-popup')?.shadowRoot;
      if (!shadow) { resolve('no shadow root'); return; }

      // Completed step has green dot with check icon
      const greenDots = shadow.querySelectorAll('[class*="bg-success-500"]');
      const amberDot = shadow.querySelector('[class*="bg-accent-400"]');

      if (greenDots.length >= 1 && amberDot) {
        // Step 1 completed, step 2 now active
        const footer = shadow.querySelector('footer')?.textContent?.trim();
        resolve(JSON.stringify({
          completedSteps: greenDots.length,
          hasActiveStep: !!amberDot,
          footer
        }));
      } else if (attempts > 30) {
        resolve(JSON.stringify({ timeout: true, greenDots: greenDots.length }));
      } else {
        setTimeout(check, 2000);
      }
    };
    check();
  });
}
```

**Expected:**
```json
{
  "completedSteps": 1,
  "hasActiveStep": true,
  "footer": "Step 2 of 4 v<version>"
}
```

### 5. Verify completed step shows result summary

After step 1 completes, check that the completed step description shows the match score summary:

```js
() => {
  const shadow = document.querySelector('resume-fitter-popup')?.shadowRoot;
  if (!shadow) return 'no shadow root';

  // Look for success-colored description text (completed step summary)
  const successText = shadow.querySelector('[class*="text-success-700"]');
  return JSON.stringify({
    completedDesc: successText?.textContent?.trim() || 'not found'
  });
}
```

**Expected:** Description contains "Match score:" and "missing keywords found" text.

### 6. Wait for all 4 steps to complete

Poll every 2 seconds, up to 120 seconds, waiting for all steps to show completed state:

```js
() => {
  return new Promise(resolve => {
    let attempts = 0;
    const check = () => {
      attempts++;
      const shadow = document.querySelector('resume-fitter-popup')?.shadowRoot;
      if (!shadow) { resolve('no shadow root'); return; }

      const greenDots = shadow.querySelectorAll('[class*="bg-success-500"]');
      const grayDots = shadow.querySelectorAll('[class*="bg-surface-200"]');
      const amberDot = shadow.querySelector('[class*="bg-accent-400"]');
      const footer = shadow.querySelector('footer')?.textContent?.trim();

      if (greenDots.length >= 4) {
        resolve(JSON.stringify({
          allComplete: true,
          completedSteps: greenDots.length,
          pendingSteps: grayDots.length,
          hasActiveStep: !!amberDot,
          footer
        }));
      } else if (attempts > 60) {
        resolve(JSON.stringify({
          timeout: true,
          completedSteps: greenDots.length,
          pendingSteps: grayDots.length,
          footer
        }));
      } else {
        setTimeout(check, 2000);
      }
    };
    check();
  });
}
```

**Expected:**
```json
{
  "allComplete": true,
  "completedSteps": 4,
  "pendingSteps": 0,
  "hasActiveStep": false
}
```

### 7. Verify transition to Pipeline Complete panel

After all steps complete and the `done` SSE event is received, the UI should transition to the pipeline-complete panel. Wait up to 10 seconds after step 6:

```js
() => {
  return new Promise(resolve => {
    let attempts = 0;
    const check = () => {
      attempts++;
      const shadow = document.querySelector('resume-fitter-popup')?.shadowRoot;
      if (!shadow) { resolve('no shadow root'); return; }

      const title = shadow.querySelector('[class*="font-display"]')?.textContent?.trim();
      const subtitle = Array.from(shadow.querySelectorAll('[class*="text-surface-500"]'))
        .map(el => el.textContent?.trim())
        .find(t => t?.includes('pipeline'));

      if (title === 'CV tailored successfully') {
        const buttons = Array.from(shadow.querySelectorAll('button'))
          .map(b => ({ text: b.textContent?.trim(), disabled: b.disabled }));
        const footer = shadow.querySelector('footer')?.textContent?.trim();
        resolve(JSON.stringify({ title, subtitle, buttons, footer }));
      } else if (attempts > 10) {
        resolve(JSON.stringify({ timeout: true, currentTitle: title }));
      } else {
        setTimeout(check, 1000);
      }
    };
    check();
  });
}
```

**Expected:**
```json
{
  "title": "CV tailored successfully",
  "subtitle": "All 4 pipeline steps completed",
  "buttons": [
    { "text": "Close popup", "disabled": false },
    { "text": "Review CV", "disabled": false },
    { "text": "Cancel", "disabled": false }
  ],
  "footer": "Complete v<version>"
}
```

### 8. Verify score badges are displayed with values

```js
() => {
  const shadow = document.querySelector('resume-fitter-popup')?.shadowRoot;
  if (!shadow) return 'no shadow root';

  const badges = Array.from(shadow.querySelectorAll('[class*="rounded-full"][class*="px-3"]'))
    .map(badge => badge.textContent?.trim());

  return JSON.stringify({ badges });
}
```

**Expected:** Three badges with text like:
```json
{
  "badges": [
    "ATS: <number>",
    "Match: <number>%",
    "<number> flags"
  ]
}
```

Each badge should contain a numeric value (the exact values depend on the pipeline output).

### 9. Verify "Review CV" button opens generated CV

Click "Review CV" and verify a new tab opens with the generated CV HTML:

```js
() => {
  const shadow = document.querySelector('resume-fitter-popup')?.shadowRoot;
  const btn = Array.from(shadow?.querySelectorAll('button') || [])
    .find(b => b.textContent?.trim().includes('Review CV'));
  btn?.click();
  return btn ? 'clicked' : 'not found';
}
```

Check browser tabs to verify a new tab was opened with a blob URL:

```
mcp__playwright__browser_tabs()
```

**Expected:** A new tab is opened containing the generated CV HTML (blob: URL or similar).

### 10. Verify "Cancel" on pipeline-complete returns to initial state

Navigate back to the job page tab. Close and re-open the popup to reach pipeline-complete again (or use browser back). Then click "Cancel":

```js
() => {
  const shadow = document.querySelector('resume-fitter-popup')?.shadowRoot;
  if (!shadow) return 'no shadow root';

  const cancelBtn = Array.from(shadow.querySelectorAll('button'))
    .find(b => b.textContent?.trim() === 'Cancel');
  if (!cancelBtn) return 'cancel button not found';
  cancelBtn.click();

  return new Promise(resolve => {
    setTimeout(() => {
      const heading = shadow.querySelector('h2')?.textContent?.trim();
      const footer = shadow.querySelector('footer')?.textContent?.trim();
      resolve(JSON.stringify({ heading, footer }));
    }, 500);
  });
}
```

**Expected:** Returns to the initial panel ("Ready to tailor" or "Set up your profile").

### 11. Test cancel during active pipeline

Start a new pipeline run (extract job again, click "Fit My CV"), then cancel while steps are still in progress:

```js
() => {
  const shadow = document.querySelector('resume-fitter-popup')?.shadowRoot;
  if (!shadow) return 'no shadow root';

  const cancelBtn = Array.from(shadow.querySelectorAll('button'))
    .find(b => b.textContent?.trim() === 'Cancel');
  if (!cancelBtn) return 'cancel button not found';
  cancelBtn.click();

  return new Promise(resolve => {
    setTimeout(() => {
      const heading = shadow.querySelector('h2')?.textContent?.trim();
      const amberDot = shadow.querySelector('[class*="bg-accent-400"]');
      resolve(JSON.stringify({
        heading,
        pipelineCleared: !amberDot
      }));
    }, 500);
  });
}
```

**Expected:** Returns to initial panel. Pipeline progress dots are gone. Pipeline session is cleared from storage.

### 12. Test pipeline state persistence across popup close/reopen

Start a pipeline, close the popup, then reopen it and verify the progress panel resumes showing the current state:

```js
// Close popup
() => {
  const shadow = document.querySelector('resume-fitter-popup')?.shadowRoot;
  const closeBtn = Array.from(shadow?.querySelectorAll('button') || [])
    .find(b => b.textContent?.trim() === 'Close popup');
  closeBtn?.click();
  return closeBtn ? 'closed' : 'not found';
}
```

Wait 2 seconds, then reopen popup via CDP `toggle-popup`. Verify the progress panel is still showing with the correct step state:

```js
() => {
  return new Promise(resolve => {
    setTimeout(() => {
      const shadow = document.querySelector('resume-fitter-popup')?.shadowRoot;
      if (!shadow) { resolve('no shadow root'); return; }

      const heading = shadow.querySelector('[class*="font-display"]')?.textContent?.trim();
      const greenDots = shadow.querySelectorAll('[class*="bg-success-500"]');
      resolve(JSON.stringify({
        heading,
        completedSteps: greenDots.length,
        resumedPipeline: heading === 'Tailoring your CV'
      }));
    }, 500);
  });
}
```

**Expected:** The progress panel reopens with the same step states as before the popup was closed. Completed steps remain green. The active step is still active.

### 13. Test pipeline error handling

This scenario requires the backend to return an error. If the backend is unavailable or returns an SSE `error` event, verify the UI handles it:

```js
// Verify that after an error, the popup returns to initial state
() => {
  return new Promise(resolve => {
    let attempts = 0;
    const check = () => {
      attempts++;
      const shadow = document.querySelector('resume-fitter-popup')?.shadowRoot;
      if (!shadow) { resolve('no shadow root'); return; }

      const heading = shadow.querySelector('h2')?.textContent?.trim();
      // On error, App.tsx transitions to 'initial' view
      if (heading === 'Ready to tailor' || heading === 'Set up your profile' || attempts > 15) {
        resolve(JSON.stringify({ heading, recoveredFromError: true }));
      } else {
        setTimeout(check, 2000);
      }
    };
    check();
  });
}
```

**Expected:** After a pipeline error, the popup transitions back to the initial state without crashing.

### 14. Visual design review — Progress Panel

Take a screenshot during the pipeline progress state and validate with `frontend-design`:

- Title "Tailoring your CV" in Instrument Serif (font-display)
- Subtitle in DM Sans, surface-500 color
- 4-step vertical timeline with track column (dots + connecting lines) and content column
- Completed step: green dot with white check icon, green connecting line, green result summary text
- Active step: amber dot with glow shadow, step number in white, amber label text
- Pending steps: gray dot with step number, gray connecting line, "Waiting..." text
- Full-width Cancel button (surface-100 background, border, X icon)
- Footer: amber dot + "Step X of 4"

### 15. Visual design review — Pipeline Complete

Take a screenshot during the pipeline-complete state and validate with `frontend-design`:

- 2-ring success icon (same pattern as ExtractFinishedPanel)
- Title "CV tailored successfully" in Instrument Serif
- Subtitle "All 4 pipeline steps completed" in DM Sans
- 3 score badge pills in a horizontal row:
  - ATS badge: green background, ShieldCheck icon, "ATS: {score}"
  - Match badge: amber background, Target icon, "Match: {score}%"
  - Flags badge: gray background, Flag icon, "{count} flags"
- Primary "Review CV" button (amber, Eye icon, button shadow + glow)
- Secondary "Cancel" button (surface-100, X icon)
- Footer: green dot + "Complete"

## Pass Criteria

- Clicking "Fit My CV" on extract-finished panel transitions to the progress panel
- Progress panel shows "Tailoring your CV" heading with 4 step labels
- Step 1 starts in active/running state (amber dot with glow)
- Steps 2-4 start in pending state (gray dots, "Waiting..." text)
- Footer shows "Step 1 of 4" with amber indicator
- As each step completes, its dot turns green with a check icon
- Completed steps show result summaries in green text
- The next step transitions to active state (amber dot)
- Footer updates to reflect current step number
- After all 4 steps complete, UI transitions to pipeline-complete panel
- Pipeline-complete panel shows success icon, title, subtitle, and 3 score badges
- Score badges display numeric values from the pipeline output
- Footer shows "Complete" with green indicator
- "Review CV" opens the generated CV in a new tab
- "Cancel" on progress panel clears pipeline and returns to initial state
- "Cancel" on pipeline-complete panel clears results and returns to initial state
- Pipeline state persists across popup close/reopen (storage-backed)
- Pipeline errors are handled gracefully (returns to initial state)
- Visual design matches the component specifications for both panels
