# Auto-Convert PDF via Server on Upload — Frontend Plan

## Status: READY
## Created: 2025-03-25

---

## Overview

When a user uploads a PDF in the profile form, reuse the existing `useDownloadHtml` hook's server conversion flow (background script → `POST /pdf-to-html`) but instead of downloading, save the returned HTML as `cvTemplate` in storage. Remove `extension/utils/fileToHtml.ts` entirely (both `pdfToHtml` and `docxToHtml`), along with `pdfjs-init.ts` and the `pdfjs-dist` + `mammoth` dependencies. Show a loading indicator during conversion; show an error if server is unreachable (no fallback). No backend changes needed.

---

## What to Reuse (Already Exists)

| Asset | Location | Usage |
|---|---|---|
| `useDownloadHtml` hook | `extension/entrypoints/main-popup.content/hooks/useDownloadHtml.ts` | Already sends PDF to background → server and gets HTML back. Modify to also support "save" instead of "download" |
| `ConvertPdfResponse` type | `extension/types/messages.ts` | Response shape (success/error union) |
| `handleConvertPdf()` | `extension/entrypoints/background.ts` | Background handler — sends PDF to server, returns HTML |
| `fileToBase64()` | `extension/entrypoints/main-popup.content/hooks/useDownloadHtml.ts` | Convert File to base64 string |
| `Loader2` icon | Already imported in `ProfilePanel.tsx` | For the converting spinner |

---

## Task List

### Task 1: Modify `useProfileForm` to use `useDownloadHtml`'s server conversion on PDF upload

**Files to modify:**
- `extension/entrypoints/main-popup.content/hooks/useProfileForm.ts`

**Changes:**
1. Remove import of `pdfToHtml` and `docxToHtml` from `../../../utils/fileToHtml`.
2. Import `ConvertPdfResponse` from `../../../types/messages`.
3. Extract `fileToBase64` from `useDownloadHtml.ts` into a shared util (e.g. `extension/entrypoints/main-popup.content/utils/fileToBase64.ts`) and import it in both `useProfileForm.ts` and `useDownloadHtml.ts`.
4. Add new state: `const [isConverting, setIsConverting] = useState(false);`
5. In `handleFileSelect`, replace the conversion logic:

**Before:**
```typescript
const html = ext === '.pdf'
  ? await pdfToHtml(buffer)
  : await docxToHtml(buffer);
```

**After:**
```typescript
setIsConverting(true);
try {
  const pdfBase64 = await fileToBase64(file);
  const raw: unknown = await browser.runtime.sendMessage({
    type: 'convert-pdf',
    pdfBase64,
    fileName: file.name,
  });
  if (typeof raw !== 'object' || raw === null || !('success' in raw)) {
    setError('Unexpected response from background script.');
    return;
  }
  const response = raw as ConvertPdfResponse;
  if (!response.success) {
    setError(response.error);
    return;
  }
  const html = response.html;
  if (!html.trim()) {
    setError('Could not extract content from file.');
    return;
  }
  setCvContent(html);
  setFileName(file.name);
  setFileSize(file.size);
  setRawFile(file);
  setError(null);
} catch {
  setError('Cannot reach server.');
} finally {
  setIsConverting(false);
}
```

6. Remove the DOCX-specific branch — all file types now go through the server (only PDF is accepted by the server; update `ACCEPTED_TYPES` to only allow `.pdf`).
7. Add `isConverting` to the `UseProfileFormReturn` interface and the return object.
8. Remove the `readFileAs` call for `arraybuffer` since we no longer need client-side conversion. Keep `validateFileContent` for magic-byte checking (still reads a small slice).

---

### Task 2: Show loading indicator in `ProfilePanel` during server conversion

**Files to modify:**
- `extension/entrypoints/main-popup.content/components/ProfilePanel.tsx`

**Changes:**
1. Destructure `isConverting` from `useProfileForm(profile)`.
2. When `isConverting` is true, show a spinner with "Converting PDF..." text:

```tsx
{isConverting && (
  <div className="flex items-center gap-2 font-body text-xs text-surface-500">
    <Loader2 size={14} className="animate-spin" />
    Converting PDF...
  </div>
)}
```

3. Disable the file input and Save button while `isConverting` is true.

---

### Task 3: Delete `extension/utils/fileToHtml.ts`

**Files to delete:**
- `extension/utils/fileToHtml.ts`

**Changes:**
1. Delete the file entirely.
2. Remove all imports of `pdfToHtml` or `docxToHtml` across the codebase (should only be in `useProfileForm.ts` after Task 1).

---

### Task 4: Delete `extension/utils/pdfjs-init.ts`

**Files to delete:**
- `extension/utils/pdfjs-init.ts`

**Changes:**
1. Delete the file entirely.
2. Verify no other file imports from `./pdfjs-init` or `../utils/pdfjs-init`.

---

### Task 5: Remove `pdfjs-dist` and `mammoth` dependencies

**Files to modify:**
- `extension/package.json`

**Changes:**
1. Remove `pdfjs-dist` from `dependencies`.
2. Remove `mammoth` from `dependencies`.
3. Run the package manager to update the lockfile.

---

### Task 6: Clean up remaining imports and update accepted file types

**Files to check:**
- Search entire `extension/` for: `pdfToHtml`, `docxToHtml`, `pdfjs-dist`, `pdfjs-init`, `pdfjsLib`, `mammoth`, `fileToHtml`

**Changes:**
- Remove any stray imports found.
- In `useProfileForm.ts`: update `ACCEPTED_TYPES` to only accept `.pdf` (remove `.docx` since `docxToHtml` is gone).
- In `ProfilePanel.tsx` / `FileDropzone.tsx`: update accept attribute from `.pdf,.docx` to `.pdf`.
- Update validation error messages from "PDF or DOCX" to "PDF".

---

### Task 7: Auto-open converted HTML in Chrome for visual verification

**Files to modify:**
- `extension/entrypoints/main-popup.content/hooks/useProfileForm.ts`

**Context:**
After the PDF is converted to HTML via the server, automatically open the HTML in a new Chrome tab so the user can visually verify the conversion looks correct.

**Changes:**
After receiving a successful `ConvertPdfResponse` with `html`, open it in a new tab:

```typescript
// After: html = response.html;
const blob = new Blob([html], { type: 'text/html' });
const blobUrl = URL.createObjectURL(blob);
window.open(blobUrl, '_blank');
// Clean up after a short delay
setTimeout(() => URL.revokeObjectURL(blobUrl), 1000);
```

Alternatively, download the file to disk (same pattern as `useDownloadHtml`):
```typescript
const blob = new Blob([html], { type: 'text/html' });
const blobUrl = URL.createObjectURL(blob);
const anchor = document.createElement('a');
anchor.href = blobUrl;
anchor.download = `${file.name.replace(/\.[^.]+$/, '')}.html`;
anchor.click();
setTimeout(() => URL.revokeObjectURL(blobUrl), 100);
```

**Decision:** Pick one approach — open in tab for quick visual check, or download to disk for saving. Both can coexist.

**Acceptance criteria:**
- After PDF upload + server conversion, the resulting HTML is automatically opened/downloaded.
- User can visually verify the MuPDF conversion output looks correct.

---

### Task 8: Run full validation

**Actions:**
1. `cd extension && npx tsc --noEmit` — no type errors.
2. `cd extension && npx vitest run` — all tests pass.
3. `cd extension && npx wxt build` — builds successfully.

---

## Files Summary

| File | Action |
|---|---|
| `extension/entrypoints/main-popup.content/hooks/useProfileForm.ts` | MODIFY — use server conversion via background message |
| `extension/entrypoints/main-popup.content/components/ProfilePanel.tsx` | MODIFY — add converting indicator, disable during conversion |
| `extension/entrypoints/main-popup.content/components/FileDropzone.tsx` | MODIFY — accept only `.pdf` |
| `extension/utils/fileToHtml.ts` | DELETE |
| `extension/utils/pdfjs-init.ts` | DELETE |
| `extension/package.json` | MODIFY — remove pdfjs-dist and mammoth |
