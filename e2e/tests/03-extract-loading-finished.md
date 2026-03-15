# Test 03: Extract Loading & Extract Finished

Verify the full extraction flow — triggering extraction from the initial panel, seeing the loading state with animations, transitioning to the finished state with extracted job details, and using the "Fit My CV" and "Extract Again" actions.

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

### 3. Click "Extract Job" to start extraction

```js
() => {
  const shadow = document.querySelector('resume-fitter-popup')?.shadowRoot;
  const btn = Array.from(shadow?.querySelectorAll('button') || [])
    .find(b => b.textContent?.trim() === 'Extract Job');
  btn?.click();
  return btn ? 'clicked' : 'not found';
}
```

### 4. Verify Extract Loading panel is displayed

Take a screenshot and evaluate the shadow DOM to confirm the loading state renders:

```js
() => {
  const shadow = document.querySelector('resume-fitter-popup')?.shadowRoot;
  if (!shadow) return 'no shadow root';
  const title = shadow.querySelector('[class*="font-display"]')?.textContent?.trim();
  const subtitle = shadow.querySelector('[class*="text-surface-500"]')?.textContent?.trim();
  const progressBar = shadow.querySelector('[role="progressbar"]');
  const cancelBtn = Array.from(shadow.querySelectorAll('button'))
    .find(b => b.textContent?.trim() === 'Cancel');
  const footer = shadow.querySelector('footer')?.textContent?.trim();
  return JSON.stringify({
    title,
    subtitle,
    hasProgressBar: !!progressBar,
    hasCancelBtn: !!cancelBtn,
    footer
  });
}
```

**Expected:**
```json
{
  "title": "Extracting job details",
  "subtitle": "Scanning the current page for job information...",
  "hasProgressBar": true,
  "hasCancelBtn": true,
  "footer": "Extracting... v<version>"
}
```

### 5. Verify pulsing icon animation

Check that the concentric circle icon assembly has the pulsing animation class:

```js
() => {
  const shadow = document.querySelector('resume-fitter-popup')?.shadowRoot;
  const pulsingEl = shadow?.querySelector('[class*="animate-pulse-soft"]');
  return pulsingEl ? 'pulsing animation present' : 'no pulsing animation';
}
```

**Expected:** `pulsing animation present`

### 6. Verify indeterminate progress bar animation

```js
() => {
  const shadow = document.querySelector('resume-fitter-popup')?.shadowRoot;
  const progressFill = shadow?.querySelector('[class*="animate-progress"]');
  return progressFill ? 'progress animation present' : 'no progress animation';
}
```

**Expected:** `progress animation present`

### 7. Verify cancel returns to initial panel

Click "Cancel" and verify the view returns to the initial panel:

```js
() => {
  const shadow = document.querySelector('resume-fitter-popup')?.shadowRoot;
  const btn = Array.from(shadow?.querySelectorAll('button') || [])
    .find(b => b.textContent?.trim() === 'Cancel');
  btn?.click();
  return btn ? 'clicked' : 'not found';
}
```

Wait briefly, then verify:

```js
() => {
  const shadow = document.querySelector('resume-fitter-popup')?.shadowRoot;
  const heading = shadow?.querySelector('h2')?.textContent?.trim();
  const extractBtn = Array.from(shadow?.querySelectorAll('button') || [])
    .find(b => b.textContent?.trim() === 'Extract Job');
  return JSON.stringify({ heading, extractEnabled: extractBtn ? !extractBtn.disabled : null });
}
```

**Expected:** Back to initial panel with "Ready to tailor" heading and enabled Extract Job button.

### 8. Re-trigger extraction and wait for completion

Click "Extract Job" again and wait for extraction to complete (mock returns after ~2 seconds):

```js
() => {
  const shadow = document.querySelector('resume-fitter-popup')?.shadowRoot;
  const btn = Array.from(shadow?.querySelectorAll('button') || [])
    .find(b => b.textContent?.trim() === 'Extract Job');
  btn?.click();
  return btn ? 'clicked' : 'not found';
}
```

Wait 3 seconds for the mock extraction to complete, then take a screenshot.

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

**Expected:** 4 rows with labels "Title", "Company", "Location", "Skills" and corresponding mock values. Skills should show overflow format (e.g., "React, TypeScript, Node.js +4").

### 12. Verify "Extract Again" restarts extraction

Click "Extract Again" and verify the loading panel reappears:

```js
() => {
  const shadow = document.querySelector('resume-fitter-popup')?.shadowRoot;
  const btn = Array.from(shadow?.querySelectorAll('button') || [])
    .find(b => b.textContent?.trim() === 'Extract Again');
  btn?.click();
  return btn ? 'clicked' : 'not found';
}
```

Wait briefly, then verify:

```js
() => {
  const shadow = document.querySelector('resume-fitter-popup')?.shadowRoot;
  const title = shadow?.querySelector('[class*="font-display"]')?.textContent?.trim();
  const progressBar = shadow?.querySelector('[role="progressbar"]');
  return JSON.stringify({ title, hasProgressBar: !!progressBar });
}
```

**Expected:** Loading panel shows again with "Extracting job details" title and progress bar.

### 13. Wait for second extraction to complete

Wait 3 seconds for mock extraction to complete. Verify the finished panel returns with job details.

### 14. Verify "Fit My CV" triggers pipeline

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

### 15. Visual design review — Extract Loading

Take a screenshot during the loading state and validate with `frontend-design`:

- 3-ring concentric pulsing icon (outer amber-50, middle amber-100, inner amber-400 with ScanSearch icon)
- Title "Extracting job details" in Instrument Serif
- Subtitle in DM Sans, surface-500 color
- Indeterminate progress bar (amber fill sliding across surface-200 track)
- Full-width Cancel button with X icon, surface-100 background
- Footer: amber dot + "Extracting..."

### 16. Visual design review — Extract Finished

Take a screenshot during the finished state and validate with `frontend-design`:

- 2-ring success icon (outer success-50, inner success-500 with Check icon)
- Title "Job details extracted" in Instrument Serif
- Subtitle in DM Sans, surface-500 color
- Job details card with 4 rows (Title, Company, Location, Skills), bordered, white background
- Skills row shows overflow format with "+N"
- Primary "Fit My CV" button (amber, with Sparkles icon, button shadow + glow)
- Secondary "Extract Again" button (surface-100, with RefreshCw icon)
- Footer: green dot + "Ready to fit"

### 17. Navigate to a non-job page (dev.to)

```
mcp__playwright__browser_navigate({ url: "https://dev.to" })
```

### 18. Verify extraction is blocked on a non-job page

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

### 19. Verify non-job page shows a hint or tooltip

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
- Loading panel shows pulsing icon, title, subtitle, progress bar, and cancel button
- Pulsing icon and progress bar animations are active
- Footer shows "Extracting..." with amber indicator during loading
- Cancel returns to initial panel without error
- Extraction completes and transitions to extract finished panel
- Finished panel shows success icon, title, subtitle, and job details card
- Job details card displays all 4 rows with correct labels and values
- Skills overflow shows "+N" format for more than 3 skills
- Footer shows "Ready to fit" with green indicator on finished panel
- "Extract Again" restarts extraction and shows loading panel
- "Fit My CV" sends pipeline message to background service worker
- Visual design matches the component specifications for both states
- On a non-job page (e.g., dev.to), "Extract Job" button is disabled
- A hint message explains the user needs to navigate to a job posting
