# Test 04: Server-Side Extraction (POST /extract)

Verify the refactored extraction flow — content script sends HTML to the background SW, which POSTs to the server's `/extract` endpoint. Covers success, blocked pages, server 422 (not-a-job), and error handling.

> **Note:** This test requires the real backend server running on `localhost:8007` with the
> `POST /extract` endpoint available. Extraction now involves a network round-trip + LLM inference
> (2-8 seconds), unlike the old near-instant DOM scraping.

## Prerequisites

- Extension dev server running (Step 1-3 from debug-extension skill)
- E2E mock server running on `localhost:3006`
- Backend server running on `localhost:8007` (`cd server && pnpm dev`)
- Profile is already saved (CV + work history populated via `browser.storage.local`)

## Steps

### 1. Navigate to a real job posting page

Use the mock Greenhouse page which the server can parse:

```
mcp__playwright__browser_navigate({ url: "http://localhost:3006/test-comp/jobs/4488055101" })
```

### 2. Open popup and verify initial state

Trigger `toggle-popup` via CDP. Verify "Extract Job" is enabled (page is not blocklisted):

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

### 3. Click "Extract Job" and verify loading state

Click the button. Since server extraction takes 2-8 seconds, the loading panel should be visible for a meaningful duration:

```js
() => {
  const shadow = document.querySelector('resume-fitter-popup')?.shadowRoot;
  if (!shadow) return 'no shadow root';

  const extractBtn = Array.from(shadow.querySelectorAll('button'))
    .find(b => b.textContent?.trim() === 'Extract Job');
  if (!extractBtn || extractBtn.disabled) return JSON.stringify({ error: 'button not found or disabled' });
  extractBtn.click();

  return new Promise(resolve => {
    setTimeout(() => {
      const progressBar = shadow.querySelector('[role="progressbar"]');
      const cancelBtn = Array.from(shadow.querySelectorAll('button'))
        .find(b => b.textContent?.trim() === 'Cancel');
      const allHeadings = Array.from(shadow.querySelectorAll('h2, [class*="text-xl"]'))
        .map(el => el.textContent?.trim());
      const footer = shadow.querySelector('footer')?.textContent?.trim();
      resolve(JSON.stringify({
        allHeadings,
        hasProgressBar: !!progressBar,
        hasCancelBtn: !!cancelBtn,
        footer
      }));
    }, 200);
  });
}
```

**Expected:**
```json
{
  "allHeadings": ["Extracting job details"],
  "hasProgressBar": true,
  "hasCancelBtn": true,
  "footer": "Extracting...v<version>"
}
```

### 4. Wait for server extraction to complete

Server-side extraction takes 2-8 seconds. Poll every 2 seconds for up to 15 seconds:

```js
() => {
  return new Promise(resolve => {
    let attempts = 0;
    const check = () => {
      attempts++;
      const shadow = document.querySelector('resume-fitter-popup')?.shadowRoot;
      if (!shadow) { resolve('no shadow root'); return; }
      const heading = shadow.querySelector('h2')?.textContent?.trim();
      if (heading === 'Job details extracted' || attempts >= 8) {
        const footer = shadow.querySelector('footer')?.textContent?.trim();
        resolve(JSON.stringify({ heading, footer, attempts }));
      } else {
        setTimeout(check, 2000);
      }
    };
    check();
  });
}
```

**Expected:** Heading is "Job details extracted", footer contains "Ready to fit".

### 5. Verify extracted job details from server response

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

**Expected:** 4 rows with Title, Company, Location, Skills extracted by the LLM from the mock page. Values should match the page content (e.g. "AI Engineer", "Test-Comp").

### 6. Verify cancel during server extraction

Navigate to the mock page again to reset state. Click Extract, then cancel while the server call is in-flight:

```js
() => {
  const shadow = document.querySelector('resume-fitter-popup')?.shadowRoot;
  if (!shadow) return 'no shadow root';

  const extractBtn = Array.from(shadow.querySelectorAll('button'))
    .find(b => b.textContent?.trim() === 'Extract Job');
  if (!extractBtn || extractBtn.disabled) return JSON.stringify({ error: 'button not found' });
  extractBtn.click();

  return new Promise(resolve => {
    // Wait 1 second (server call is still in-flight), then cancel
    setTimeout(() => {
      const cancelBtn = Array.from(shadow.querySelectorAll('button'))
        .find(b => b.textContent?.trim() === 'Cancel');
      if (cancelBtn) cancelBtn.click();

      setTimeout(() => {
        const heading = shadow.querySelector('h2')?.textContent?.trim();
        const extractBtnAfter = Array.from(shadow.querySelectorAll('button'))
          .find(b => b.textContent?.trim() === 'Extract Job');
        resolve(JSON.stringify({
          heading,
          extractEnabled: extractBtnAfter ? !extractBtnAfter.disabled : null,
          cancelClicked: !!cancelBtn
        }));
      }, 200);
    }, 1000);
  });
}
```

**Expected:** Back to initial panel with "Ready to tailor" heading and enabled Extract Job button.

### 7. Navigate to a blocked page (YouTube)

```
mcp__playwright__browser_navigate({ url: "https://www.youtube.com" })
```

### 8. Verify extraction is blocked on YouTube

Open popup. "Extract Job" should be disabled because YouTube is in the blocklist:

```js
() => {
  const shadow = document.querySelector('resume-fitter-popup')?.shadowRoot;
  if (!shadow) return 'no shadow root';
  const extractBtn = Array.from(shadow.querySelectorAll('button'))
    .find(b => b.textContent?.trim() === 'Extract Job');
  const hint = shadow.querySelector('[class*="text-surface-400"]');
  return JSON.stringify({
    extractEnabled: extractBtn ? !extractBtn.disabled : null,
    hintText: hint?.textContent?.trim()
  });
}
```

**Expected:**
```json
{
  "extractEnabled": false,
  "hintText": "This page can't be scanned"
}
```

### 9. Navigate to LinkedIn (not blocked — allowlisted domain)

```
mcp__playwright__browser_navigate({ url: "https://www.linkedin.com/jobs/view/1234567890" })
```

### 10. Verify extraction is allowed on LinkedIn

Open popup. LinkedIn is NOT in the blocklist, so "Extract Job" should be enabled:

```js
() => {
  const shadow = document.querySelector('resume-fitter-popup')?.shadowRoot;
  if (!shadow) return 'no shadow root';
  const extractBtn = Array.from(shadow.querySelectorAll('button'))
    .find(b => b.textContent?.trim() === 'Extract Job');
  return JSON.stringify({
    extractEnabled: extractBtn ? !extractBtn.disabled : null
  });
}
```

**Expected:**
```json
{
  "extractEnabled": true
}
```

### 11. Navigate to a non-job page and attempt extraction (server 422)

Navigate to a page that passes the blocklist but is not a job posting. The server should return 422:

```
mcp__playwright__browser_navigate({ url: "http://localhost:3006" })
```

Open popup, click "Extract Job" (if the mock server root page is not blocklisted), and wait for the server 422 response:

```js
() => {
  const shadow = document.querySelector('resume-fitter-popup')?.shadowRoot;
  if (!shadow) return 'no shadow root';

  const extractBtn = Array.from(shadow.querySelectorAll('button'))
    .find(b => b.textContent?.trim() === 'Extract Job');
  if (!extractBtn || extractBtn.disabled) return JSON.stringify({ error: 'button disabled on this page' });
  extractBtn.click();

  return new Promise(resolve => {
    let attempts = 0;
    const check = () => {
      attempts++;
      const heading = shadow.querySelector('h2')?.textContent?.trim();
      // After 422, view should return to 'initial' with an error
      if (heading === 'Ready to tailor' || heading === 'Set up your profile' || attempts >= 8) {
        const errorEl = shadow.querySelector('[class*="text-red"], [class*="text-error"], [class*="text-warning"]');
        const allText = shadow.querySelector('[class*="text-surface-500"]')?.textContent?.trim();
        resolve(JSON.stringify({ heading, errorText: errorEl?.textContent?.trim(), subtitle: allText, attempts }));
      } else {
        setTimeout(check, 2000);
      }
    };
    setTimeout(check, 2000);
  });
}
```

**Expected:** Returns to initial panel with an error message like "This page doesn't appear to be a job posting."

### 12. Verify "Extract Again" works after server extraction

Navigate back to the mock job page. Complete a full extraction, then click "Extract Again":

```js
() => {
  const shadow = document.querySelector('resume-fitter-popup')?.shadowRoot;
  const btn = Array.from(shadow?.querySelectorAll('button') || [])
    .find(b => b.textContent?.trim() === 'Extract Again');
  btn?.click();
  return btn ? 'clicked' : 'not found';
}
```

Wait for extraction to complete (poll up to 15 seconds), then verify the finished panel shows again with the same data.

### 13. Verify "Fit My CV" triggers pipeline after server extraction

Click "Fit My CV" and verify the pipeline message is sent to the background SW:

```js
() => {
  const shadow = document.querySelector('resume-fitter-popup')?.shadowRoot;
  const btn = Array.from(shadow?.querySelectorAll('button') || [])
    .find(b => b.textContent?.trim().includes('Fit My CV'));
  btn?.click();
  return btn ? 'clicked' : 'not found';
}
```

Verify via CDP that a `run-pipeline` message was received by the background service worker.

## Pass Criteria

- Clicking "Extract Job" on a job page sends HTML to background SW, which POSTs to server
- Loading panel displays for the full duration of server extraction (2-8 seconds)
- Server returns structured job details (title, company, location, skills, description)
- Extract finished panel displays the server-extracted data correctly
- Cancel during server extraction returns to initial panel cleanly
- YouTube and other blocklisted pages show disabled "Extract Job" button
- LinkedIn and non-blocklisted pages allow extraction attempts
- Server 422 on non-job pages returns user to initial panel with appropriate error message
- "Extract Again" re-triggers server extraction successfully
- "Fit My CV" sends pipeline message with server-extracted job data
