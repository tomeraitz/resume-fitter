# Test 03: Extract Loading & Extract Finished

Verify the full extraction flow — triggering extraction from the initial panel, seeing the loading state with animations, transitioning to the finished state with extracted job details, and using the "Fit My CV" and "Extract Again" actions.

> **Note:** Extraction uses real DOM scraping (no mock data). The expected values come from the
> Greenhouse mock page at `localhost:3006/test-comp/jobs/4488055101` which contains:
> - Title: "AI Engineer"
> - Company: "Test-Comp"
> - Location: "Tel Aviv-Yafo, Tel Aviv District, Israel"
> - Skills: extracted via keyword matching from description (e.g. Python, LangChain, etc.)
>
> DOM scraping is near-instant. The loading state flashes briefly (one event-loop tick)
> so loading-state checks must be done in the same evaluate call that clicks "Extract Job".

## Prerequisites

- Extension dev server running (Step 1-3 from debug-extension skill)
- E2E mock server running on `localhost:3006`
- Profile is already saved (CV + work history populated via `browser.storage.local`)

## Steps

### 1. Navigate to the mock job page

```
mcp__playwright__browser_navigate({ url: "http://localhost:3006/test-comp/jobs/4488055101" })
```

### 2. Open popup and verify profile-complete initial state

Trigger `toggle-popup` via CDP. Verify the initial panel shows "Ready to tailor" and "Extract Job" is enabled:

```js
() => {
  const shadow = document.querySelector('resume-fitter-popup')?.shadowRoot;
  if (!shadow) return 'no shadow root';
  const heading = shadow.querySelector('h2')?.textContent?.trim();
  const extractBtn = Array.from(shadow.querySelectorAll('button'))
    .find(b => b.textContent?.trim() === 'Extract Job');
  return JSON.stringify({
    heading,
    extractEnabled: extractBtn ? !extractBtn.disabled : null
  });
}
```

**Expected:**
```json
{
  "heading": "Ready to tailor",
  "extractEnabled": true
}
```

### 3. Click "Extract Job" and verify loading state appears

Click the button and immediately check for the loading panel in the same evaluate call.
DOM scraping is near-instant, so the loading state only lasts one event-loop tick.
We verify it by checking right after the click before the async scrape resolves:

```js
() => {
  const shadow = document.querySelector('resume-fitter-popup')?.shadowRoot;
  if (!shadow) return 'no shadow root';

  // Click Extract Job
  const extractBtn = Array.from(shadow.querySelectorAll('button'))
    .find(b => b.textContent?.trim() === 'Extract Job');
  if (!extractBtn || extractBtn.disabled) return JSON.stringify({ error: 'button not found or disabled' });
  extractBtn.click();

  // Check loading state after React re-renders (one microtask)
  return new Promise(resolve => {
    setTimeout(() => {
      const progressBar = shadow.querySelector('[role="progressbar"]');
      const cancelBtn = Array.from(shadow.querySelectorAll('button'))
        .find(b => b.textContent?.trim() === 'Cancel');
      const pulsingEl = shadow.querySelector('[class*="animate-pulse-soft"]');
      const allHeadings = Array.from(shadow.querySelectorAll('h2, [class*="text-xl"]'))
        .map(el => el.textContent?.trim());
      const footer = shadow.querySelector('footer')?.textContent?.trim();
      resolve(JSON.stringify({
        allHeadings,
        hasProgressBar: !!progressBar,
        hasCancelBtn: !!cancelBtn,
        hasPulsing: !!pulsingEl,
        footer
      }));
    }, 50);
  });
}
```

**Expected:**
```json
{
  "allHeadings": ["Extracting job details"],
  "hasProgressBar": true,
  "hasCancelBtn": true,
  "hasPulsing": true,
  "footer": "Extracting...v<version>"
}
```

### 4. Verify pulsing icon animation

(Covered in Step 3 — `hasPulsing: true`)

### 5. Verify indeterminate progress bar animation

(Covered in Step 3 — `hasProgressBar: true`)

### 6. Wait for extraction to complete

DOM scraping completes after one event-loop tick. Wait 500ms then verify the finished panel:

```js
() => {
  return new Promise(resolve => {
    setTimeout(() => {
      const shadow = document.querySelector('resume-fitter-popup')?.shadowRoot;
      if (!shadow) { resolve('no shadow root'); return; }
      const allHeadings = Array.from(shadow.querySelectorAll('h2, [class*="text-xl"]'))
        .map(el => el.textContent?.trim());
      const footer = shadow.querySelector('footer')?.textContent?.trim();
      resolve(JSON.stringify({ allHeadings, footer }));
    }, 500);
  });
}
```

**Expected:** Heading includes "Job details extracted", footer shows "Ready to fit".

### 7. Test cancel flow (fresh start)

Navigate to the mock page again to reset state. Open popup, click Extract Job, then immediately cancel before the async tick completes:

```js
() => {
  const shadow = document.querySelector('resume-fitter-popup')?.shadowRoot;
  if (!shadow) return 'no shadow root';

  // Click Extract Job
  const extractBtn = Array.from(shadow.querySelectorAll('button'))
    .find(b => b.textContent?.trim() === 'Extract Job');
  if (!extractBtn || extractBtn.disabled) return JSON.stringify({ error: 'button not found' });
  extractBtn.click();

  // Wait for React render, then click Cancel
  return new Promise(resolve => {
    setTimeout(() => {
      const cancelBtn = Array.from(shadow.querySelectorAll('button'))
        .find(b => b.textContent?.trim() === 'Cancel');
      if (cancelBtn) cancelBtn.click();

      // Check state after cancel
      setTimeout(() => {
        const heading = shadow.querySelector('h2')?.textContent?.trim();
        const extractBtnAfter = Array.from(shadow.querySelectorAll('button'))
          .find(b => b.textContent?.trim() === 'Extract Job');
        resolve(JSON.stringify({
          heading,
          extractEnabled: extractBtnAfter ? !extractBtnAfter.disabled : null,
          cancelClicked: !!cancelBtn
        }));
      }, 100);
    }, 50);
  });
}
```

**Expected:** Back to initial panel with "Ready to tailor" heading and enabled Extract Job button.

### 8. Re-trigger extraction and wait for completion

Click "Extract Job" again. DOM scraping completes near-instantly:

```js
() => {
  const shadow = document.querySelector('resume-fitter-popup')?.shadowRoot;
  const btn = Array.from(shadow?.querySelectorAll('button') || [])
    .find(b => b.textContent?.trim() === 'Extract Job');
  btn?.click();
  return btn ? 'clicked' : 'not found';
}
```

Wait 1 second for extraction to complete, then take a screenshot.

### 9. Verify Extract Finished panel is displayed

```js
() => {
  const shadow = document.querySelector('resume-fitter-popup')?.shadowRoot;
  if (!shadow) return 'no shadow root';
  const title = shadow.querySelector('[class*="font-display"]')?.textContent?.trim();
  const subtitle = shadow.querySelector('[class*="text-surface-500"]')?.textContent?.trim();
  const buttons = Array.from(shadow.querySelectorAll('button'))
    .map(b => ({ text: b.textContent?.trim(), disabled: b.disabled }));
  const footer = shadow.querySelector('footer')?.textContent?.trim();
  return JSON.stringify({ title, subtitle, buttons, footer });
}
```

**Expected:**
```json
{
  "title": "Job details extracted",
  "subtitle": "Found the following from this page",
  "buttons": [
    { "text": "Close popup", "disabled": false },
    { "text": "Fit My CV", "disabled": false },
    { "text": "Extract Again", "disabled": false }
  ],
  "footer": "Ready to fit v<version>"
}
```

### 10. Verify success icon is displayed

```js
() => {
  const shadow = document.querySelector('resume-fitter-popup')?.shadowRoot;
  const successCircle = shadow?.querySelector('[class*="bg-success-500"]');
  return successCircle ? 'success icon present' : 'no success icon';
}
```

**Expected:** `success icon present`

### 11. Verify job details card with 4 rows

```js
() => {
  const shadow = document.querySelector('resume-fitter-popup')?.shadowRoot;
  if (!shadow) return 'no shadow root';
  const card = shadow.querySelector('[class*="border-surface-200"][class*="rounded"]');
  if (!card) return 'no card found';
  const rows = card.querySelectorAll('[class*="px-3"]');
  const details = Array.from(rows).map(row => {
    const label = row.querySelector('[class*="text-surface-400"]')?.textContent?.trim();
    const value = row.querySelector('[class*="text-surface-900"]')?.textContent?.trim();
    return { label, value };
  });
  return JSON.stringify(details);
}
```

**Expected:** 4 rows extracted from the Greenhouse mock page:
- Title: "AI Engineer"
- Company: "Test-Comp"
- Location: "Tel Aviv-Yafo, Tel Aviv District, Israel" (or similar)
- Skills: comma-separated tech skills extracted from the job description (e.g. "Python, LangChain, ..." with "+N" overflow if more than 3)

### 12. Verify "Extract Again" restarts extraction

Click "Extract Again" and verify the finished panel returns (DOM scraping is near-instant):

```js
() => {
  const shadow = document.querySelector('resume-fitter-popup')?.shadowRoot;
  const btn = Array.from(shadow?.querySelectorAll('button') || [])
    .find(b => b.textContent?.trim() === 'Extract Again');
  btn?.click();
  return btn ? 'clicked' : 'not found';
}
```

Wait 1 second, then verify the finished panel is displayed again with the same extracted data:

```js
() => {
  return new Promise(resolve => {
    setTimeout(() => {
      const shadow = document.querySelector('resume-fitter-popup')?.shadowRoot;
      if (!shadow) { resolve('no shadow'); return; }
      const card = shadow.querySelector('[class*="border-surface-200"][class*="rounded"]');
      const titleRow = card?.querySelector('[class*="px-3"] [class*="text-surface-900"]');
      const footer = shadow.querySelector('footer')?.textContent?.trim();
      resolve(JSON.stringify({
        hasCard: !!card,
        firstValue: titleRow?.textContent?.trim(),
        footer
      }));
    }, 1000);
  });
}
```

**Expected:** Card is present with "AI Engineer" as the first value, footer shows "Ready to fit".

### 13. Verify "Fit My CV" triggers pipeline

Click "Fit My CV" and verify the pipeline message is sent:

```js
() => {
  const shadow = document.querySelector('resume-fitter-popup')?.shadowRoot;
  const btn = Array.from(shadow?.querySelectorAll('button') || [])
    .find(b => b.textContent?.trim().includes('Fit My CV'));
  btn?.click();
  return btn ? 'clicked' : 'not found';
}
```

Verify via the background service worker that a `run-pipeline` message was received (check via CDP or observe state transition).

### 14. Visual design review — Extract Loading

Take a screenshot during the loading state (use the combined click+check pattern from Step 3) and validate with `frontend-design`:

- 3-ring concentric pulsing icon (outer amber-50, middle amber-100, inner amber-400 with ScanSearch icon)
- Title "Extracting job details" in Instrument Serif
- Subtitle in DM Sans, surface-500 color
- Indeterminate progress bar (amber fill sliding across surface-200 track)
- Full-width Cancel button with X icon, surface-100 background
- Footer: amber dot + "Extracting..."

### 15. Visual design review — Extract Finished

Take a screenshot during the finished state and validate with `frontend-design`:

- 2-ring success icon (outer success-50, inner success-500 with Check icon)
- Title "Job details extracted" in Instrument Serif
- Subtitle in DM Sans, surface-500 color
- Job details card with 4 rows (Title, Company, Location, Skills), bordered, white background
- Title row: "AI Engineer", Company row: "Test-Comp"
- Skills row shows overflow format with "+N" (if more than 3 skills extracted)
- Primary "Fit My CV" button (amber, with Sparkles icon, button shadow + glow)
- Secondary "Extract Again" button (surface-100, with RefreshCw icon)
- Footer: green dot + "Ready to fit"

### 16. Navigate to a non-job page (dev.to)

```
mcp__playwright__browser_navigate({ url: "https://dev.to" })
```

### 17. Verify extraction is blocked on a non-job page

Open the popup and attempt to click "Extract Job". The button should be disabled or show a message indicating this is not a job page:

```js
() => {
  const shadow = document.querySelector('resume-fitter-popup')?.shadowRoot;
  if (!shadow) return 'no shadow root';
  const extractBtn = Array.from(shadow.querySelectorAll('button'))
    .find(b => b.textContent?.trim() === 'Extract Job');
  return JSON.stringify({
    extractEnabled: extractBtn ? !extractBtn.disabled : null,
    extractText: extractBtn?.textContent?.trim()
  });
}
```

**Expected:**
```json
{
  "extractEnabled": false,
  "extractText": "Extract Job"
}
```

### 18. Verify non-job page shows a hint or tooltip

Check that there is a visible message explaining why extraction is disabled (e.g., "Navigate to a job posting to extract"):

```js
() => {
  const shadow = document.querySelector('resume-fitter-popup')?.shadowRoot;
  if (!shadow) return 'no shadow root';
  const hint = shadow.querySelector('[class*="text-surface-400"]');
  const subtitle = shadow.querySelector('[class*="text-surface-500"]');
  return JSON.stringify({
    hintText: hint?.textContent?.trim(),
    subtitleText: subtitle?.textContent?.trim()
  });
}
```

**Expected:** A hint or subtitle indicating the user needs to navigate to a job page first.

## Pass Criteria

- Clicking "Extract Job" on initial panel transitions to extract loading state
- Loading panel shows pulsing icon, title, subtitle, progress bar, and cancel button (verified in same tick)
- Pulsing icon and progress bar animations are active
- Footer shows "Extracting..." with amber indicator during loading
- Cancel returns to initial panel without error
- Extraction completes and transitions to extract finished panel
- Finished panel shows success icon, title, subtitle, and job details card
- Job details card displays all 4 rows with real extracted values from the Greenhouse mock page
- Title row: "AI Engineer", Company row: "Test-Comp", Location row: contains "Tel Aviv"
- Skills row shows tech keywords extracted from the job description
- Footer shows "Ready to fit" with green indicator on finished panel
- "Extract Again" restarts extraction and returns to finished panel with same data
- "Fit My CV" sends pipeline message to background service worker
- Visual design matches the component specifications for both states
- On a non-job page (e.g., dev.to), "Extract Job" button is disabled
- A hint message explains the user needs to navigate to a job posting
