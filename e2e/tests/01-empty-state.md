# Test 01: Empty State

Verify the popup opens correctly in its empty/incomplete-profile state, closes on tab switch, and renders with the expected design.

## Prerequisites

- Extension dev server running (Step 1-3 from debug-extension skill)
- E2E mock server running on `localhost:3006`

## Steps

### 1. Navigate to the mock job page

```
mcp__playwright__browser_navigate({ url: "http://localhost:3006/test-comp/jobs/4488055101" })
```

### 2. Trigger the popup

Use CDP to send `toggle-popup` message via the service worker (Step 6 from debug-extension skill).

### 3. Verify popup is visible

Take a screenshot and confirm the popup overlay is rendered on the page.

```
mcp__playwright__browser_take_screenshot()
```

### 4. Verify empty state content

Use `browser_evaluate` to check the shadow DOM contains the expected empty-state elements:

- **Header**: Logo icon + "Resume Fitter" title + close (X) button
- **Body** (incomplete profile state):
  - Warning icon (orange circle with user icon)
  - Heading: **"Set up your profile"**
  - Subtext: **"Add your CV template and work history to get started"**
  - Primary button: **"Edit Profile"** (enabled, accent color)
  - Disabled button: **"Extract Job"** (grayed out, `opacity-60`, `cursor-not-allowed`)
- **Footer**: Warning dot (orange) + **"Profile incomplete"** label + version number

```js
() => {
  const shadow = document.querySelector('resume-fitter-popup')?.shadowRoot;
  if (!shadow) return 'no shadow root';
  const heading = shadow.querySelector('h2')?.textContent?.trim();
  const buttons = Array.from(shadow.querySelectorAll('button'))
    .map(b => ({ text: b.textContent?.trim(), disabled: b.disabled }));
  const footer = shadow.querySelector('footer')?.textContent?.trim();
  return JSON.stringify({ heading, buttons, footer });
}
```

**Expected result:**
```json
{
  "heading": "Set up your profile",
  "buttons": [
    { "text": "Close popup", "disabled": false },
    { "text": "Edit Profile", "disabled": false },
    { "text": "Extract Job", "disabled": true }
  ],
  "footer": "Profile incomplete v<version>"
}
```

### 5. Verify popup closes on tab switch

Open a new tab (or navigate away), then come back and verify the popup is gone:

```js
() => {
  const shadow = document.querySelector('resume-fitter-popup')?.shadowRoot;
  if (!shadow) return 'popup removed (shadow host gone)';
  const dialog = shadow.querySelector('[role="dialog"]');
  return dialog ? 'popup still visible' : 'popup removed';
}
```

**Expected:** popup is removed (the `visibilitychange` listener and `tabs.onActivated` handler close it).

### 6. Re-open popup on the job page

Trigger `toggle-popup` again via CDP. Take a screenshot to confirm it re-opens correctly on the job page.

### 7. Visual design review

Take a screenshot and validate with `frontend-design` that the empty state matches expected design:

- Popup is a floating card, right-aligned (`right-4`), with rounded corners and shadow
- Clean white background (`bg-surface-50`)
- Warning/orange theme for incomplete state (icon, footer dot)
- "Extract Job" button is visually disabled (grayed out)
- "Edit Profile" button has accent color (blue/purple)
- Typography uses `font-display` for headings, `font-body` for text
- Slide-up animation (`animate-slide-up`)

## Pass Criteria

- Popup opens and shows the incomplete-profile empty state
- All text content matches expected values
- "Extract Job" button is disabled; "Edit Profile" is enabled
- Footer shows "Profile incomplete" with warning indicator
- Popup closes when switching tabs
- Popup re-opens correctly when triggered again
- Visual design matches the component specifications
