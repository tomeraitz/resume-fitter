# Test 02: Profile Setup & Edit

Verify the full profile setup and edit flow — opening the form, uploading a CV, entering work history, saving, editing, cancelling, and validation errors.

## Prerequisites

- Extension dev server running (Step 1-3 from debug-extension skill)
- E2E mock server running on `localhost:3006`
- Profile storage is empty (clear via `browser.storage.local.remove('userProfile')` in background SW)

## Steps

### 1. Navigate to the mock job page

```
mcp__playwright__browser_navigate({ url: "http://localhost:3006/test-comp/jobs/4488055101" })
```

### 2. Open popup and click "Edit Profile"

Trigger `toggle-popup` via CDP. Then click the "Edit Profile" button inside the shadow DOM:

```js
() => {
  const shadow = document.querySelector('resume-fitter-popup')?.shadowRoot;
  const btn = Array.from(shadow?.querySelectorAll('button') || [])
    .find(b => b.textContent?.trim() === 'Edit Profile');
  btn?.click();
  return btn ? 'clicked' : 'not found';
}
```

### 3. Verify profile setup form (empty state)

Take a screenshot and evaluate the shadow DOM to confirm the setup form renders:

```js
() => {
  const shadow = document.querySelector('resume-fitter-popup')?.shadowRoot;
  if (!shadow) return 'no shadow root';
  const title = shadow.querySelector('[class*="font-display"]')?.textContent?.trim();
  const labels = Array.from(shadow.querySelectorAll('label')).map(l => l.textContent?.trim());
  const textarea = shadow.querySelector('textarea');
  const buttons = Array.from(shadow.querySelectorAll('button'))
    .map(b => ({ text: b.textContent?.trim(), disabled: b.disabled }));
  const dropzone = shadow.querySelector('[role="button"][aria-label="Upload CV file"]');
  const footer = shadow.querySelector('footer')?.textContent?.trim();
  return JSON.stringify({ title, labels, hasTextarea: !!textarea, hasDropzone: !!dropzone, buttons, footer });
}
```

**Expected result:**
```json
{
  "title": "Profile setup",
  "labels": ["CV Template", "Work History"],
  "hasTextarea": true,
  "hasDropzone": true,
  "buttons": [
    { "text": "Close popup", "disabled": false },
    { "text": "Save Profile", "disabled": true },
    { "text": "Cancel", "disabled": false }
  ],
  "footer": "Profile incomplete v<version>"
}
```

### 4. Verify Save button is disabled without input

Confirm the Save button has `disabled` attribute and `opacity-50` styling when both fields are empty.

### 5. Upload a valid CV file

Use Playwright file upload to select a PDF file via the hidden file input:

```
mcp__playwright__browser_file_upload({
  selector: "resume-fitter-popup >>> input[type='file']",
  files: ["e2e/fixtures/mock-cv.pdf"]
})
```

After upload, verify the dropzone is replaced with the file info row:

```js
() => {
  const shadow = document.querySelector('resume-fitter-popup')?.shadowRoot;
  const fileName = shadow?.querySelector('[class*="truncate"]')?.textContent?.trim();
  const fileSize = shadow?.querySelector('[class*="text-2xs"]')?.textContent?.trim();
  const changeBtn = Array.from(shadow?.querySelectorAll('button') || [])
    .find(b => b.textContent?.trim() === 'Change');
  return JSON.stringify({ fileName, fileSize, hasChangeBtn: !!changeBtn });
}
```

**Expected:** File name and size are displayed, "Change" button is visible.

### 6. Verify Save button is still disabled (no work history)

Save button should remain disabled because the textarea is empty.

### 7. Enter work history text

Fill the textarea with work history content:

```js
() => {
  const shadow = document.querySelector('resume-fitter-popup')?.shadowRoot;
  const textarea = shadow?.querySelector('textarea');
  if (!textarea) return 'no textarea';
  const nativeInputValueSetter = Object.getOwnPropertyDescriptor(
    window.HTMLTextAreaElement.prototype, 'value'
  )?.set;
  nativeInputValueSetter?.call(textarea, '5 years of software engineering at Acme Corp.');
  textarea.dispatchEvent(new Event('input', { bubbles: true }));
  textarea.dispatchEvent(new Event('change', { bubbles: true }));
  return 'filled';
}
```

### 8. Verify Save button is now enabled

Both fields have content, so Save should be enabled (no `disabled` attribute, no `opacity-50`).

### 9. Save the profile

Click the "Save Profile" button:

```js
() => {
  const shadow = document.querySelector('resume-fitter-popup')?.shadowRoot;
  const btn = Array.from(shadow?.querySelectorAll('button') || [])
    .find(b => b.textContent?.trim().includes('Save Profile'));
  btn?.click();
  return btn ? 'clicked' : 'not found';
}
```

### 10. Verify return to initial panel with profile complete

After saving, the view should switch back to the initial panel. Verify:

```js
() => {
  const shadow = document.querySelector('resume-fitter-popup')?.shadowRoot;
  if (!shadow) return 'no shadow root';
  const heading = shadow.querySelector('h2')?.textContent?.trim();
  const extractBtn = Array.from(shadow.querySelectorAll('button'))
    .find(b => b.textContent?.trim() === 'Extract Job');
  const footer = shadow.querySelector('footer')?.textContent?.trim();
  return JSON.stringify({
    heading,
    extractEnabled: extractBtn ? !extractBtn.disabled : null,
    footer
  });
}
```

**Expected:**
- Heading changes to "Ready to tailor" (or the filled-profile heading)
- "Extract Job" button is now enabled
- Footer shows "Connected" with green dot

### 11. Re-open profile in edit mode

Click "Edit Profile" again. Verify the form shows in edit mode:

```js
() => {
  const shadow = document.querySelector('resume-fitter-popup')?.shadowRoot;
  const title = shadow?.querySelector('[class*="font-display"]')?.textContent?.trim();
  const textarea = shadow?.querySelector('textarea');
  const fileName = shadow?.querySelector('[class*="truncate"]')?.textContent?.trim();
  return JSON.stringify({
    title,
    workHistoryPrefilled: textarea?.value?.length > 0,
    fileDisplayed: !!fileName
  });
}
```

**Expected:**
```json
{
  "title": "Edit profile",
  "workHistoryPrefilled": true,
  "fileDisplayed": true
}
```

### 12. Verify footer shows "Profile complete" in edit mode

```js
() => {
  const shadow = document.querySelector('resume-fitter-popup')?.shadowRoot;
  return shadow?.querySelector('footer')?.textContent?.trim();
}
```

**Expected:** Contains "Profile complete" with green/success indicator.

### 13. Cancel editing

Click "Cancel" and verify return to initial panel without changes:

```js
() => {
  const shadow = document.querySelector('resume-fitter-popup')?.shadowRoot;
  const btn = Array.from(shadow?.querySelectorAll('button') || [])
    .find(b => b.textContent?.trim() === 'Cancel');
  btn?.click();
  return btn ? 'clicked' : 'not found';
}
```

Verify: initial panel is shown, profile data is unchanged (still has the saved profile).

### 14. Test invalid file type rejection

Open profile form again. Try uploading a `.txt` file:

```
mcp__playwright__browser_file_upload({
  selector: "resume-fitter-popup >>> input[type='file']",
  files: ["e2e/fixtures/invalid-file.txt"]
})
```

Verify an error message appears:

```js
() => {
  const shadow = document.querySelector('resume-fitter-popup')?.shadowRoot;
  const error = shadow?.querySelector('[role="alert"]')?.textContent?.trim();
  return error;
}
```

**Expected:** "Please upload a PDF or DOCX file."

### 15. Test file size limit rejection

Upload a file larger than 2MB. Generate one at test time:

```js
// Generate a >2MB PDF in the browser for the size test
() => {
  const padding = 'x'.repeat(2 * 1024 * 1024 + 1);
  const blob = new Blob(['%PDF-1.4\n' + padding], { type: 'application/pdf' });
  const file = new File([blob], 'large-file.pdf', { type: 'application/pdf' });
  const shadow = document.querySelector('resume-fitter-popup')?.shadowRoot;
  const input = shadow?.querySelector("input[type='file']");
  const dt = new DataTransfer();
  dt.items.add(file);
  input.files = dt.files;
  input.dispatchEvent(new Event('change', { bubbles: true }));
  return 'uploaded ' + file.size + ' bytes';
}
```

**Expected error:** "File size must be under 2MB."

### 16. Test "Change" file button

Open profile form in edit mode (with existing file). Click "Change":

```js
() => {
  const shadow = document.querySelector('resume-fitter-popup')?.shadowRoot;
  const btn = Array.from(shadow?.querySelectorAll('button') || [])
    .find(b => b.textContent?.trim() === 'Change');
  btn?.click();
  return btn ? 'clicked' : 'not found';
}
```

Upload a new valid file and verify the file name/size update.

### 17. Visual design review

Take a screenshot of both states and validate with `frontend-design`:

**Setup state (empty profile):**
- Title: "Profile setup" in Instrument Serif
- Dashed-border dropzone with upload icon
- Empty textarea with placeholder text
- Disabled Save button (faded accent color)
- Active Cancel button (surface color)
- Footer: amber dot + "Profile incomplete"

**Edit state (filled profile):**
- Title: "Edit profile" in Instrument Serif
- Green file info row with file icon, name, size, and "Change" button
- Pre-filled textarea
- Enabled Save button (accent color with shadow)
- Active Cancel button
- Footer: green dot + "Profile complete"

## Pass Criteria

- Profile setup form opens from empty state with correct layout
- File dropzone accepts drag & drop and click-to-browse
- Valid PDF/DOCX files are accepted and displayed with name/size
- Invalid file types show "Please upload a PDF or DOCX file." error
- Oversized files show "File size must be under 2MB." error
- Save button is disabled until both CV and work history are provided
- Saving writes to storage and returns to initial panel
- Profile data persists and pre-fills when re-opening in edit mode
- Cancel discards unsaved changes and returns to initial panel
- "Change" button allows replacing the uploaded file
- Footer status indicator updates correctly (incomplete/complete)
- Visual design matches the component specifications
