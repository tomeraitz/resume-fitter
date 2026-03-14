# Profile Component — Implementation Plan

> Branch: `profile-compoent`
> Implements two screens from `.claude/docs/resume-fitter-ui-design.pen`:
> - **Profile State** (`dMSEm`) — empty profile setup form
> - **Profile Edit Filled State** (`kbdY3`) — edit form with existing data

---

## 1. Overview

A `ProfilePanel` component that serves as the profile setup/edit form within the existing `MainPopup` shell. It replaces `InitialPanel` as the `children` when the user clicks "Edit Profile" or needs to set up their profile for the first time.

**Two visual modes (same component, conditional rendering):**

| Mode | Title | CV Section | Work History | Footer Status |
|---|---|---|---|---|
| **Setup** (empty profile) | "Profile setup" | Drag & drop upload zone | Empty textarea with placeholder | "Profile incomplete" (amber dot) |
| **Edit** (filled profile) | "Edit profile" | File info row (name, size, "Change" link) | Pre-filled textarea | "Profile complete" (green dot) |

---

## 2. What Exists vs. What's New

### Reusable (already implemented)

| Component/Utility | File | Reuse |
|---|---|---|
| `MainPopup` | `entrypoints/main-popup.content/components/MainPopup.tsx` | Shell (header + footer + frame) — wraps ProfilePanel |
| `PopupHeader` | `entrypoints/main-popup.content/components/PopupHeader.tsx` | Logo + close button — unchanged |
| `PopupFooter` | `entrypoints/main-popup.content/components/PopupFooter.tsx` | Status dot + version — already supports `incomplete`/`connected` |
| `LogoIcon` | `components/icons/LogoIcon.tsx` | Used by PopupHeader |
| `ErrorBoundary` | `components/ErrorBoundary.tsx` | Wraps App |
| `useUserProfile` hook | `entrypoints/main-popup.content/hooks/useUserProfile.ts` | Reads profile from storage (read-only) |
| `userProfile` storage item | `services/storage/profile.storage.ts` | WXT `storage.defineItem` for `local:userProfile` |
| `UserProfile` type | `types/storage.ts` | `{ cvTemplate, professionalHistory, displayName? }` |
| Design tokens CSS | `assets/design-tokens.css` | All color/spacing/shadow tokens |
| Tailwind config | `tailwind.config.ts` | Color, font, spacing, shadow mappings |
| Content script entrypoint | `entrypoints/main-popup.content/index.tsx` | Shadow DOM mount, font injection |
| `lucide-react` | `package.json` dependency | Icons |

### New (to build)

| # | Item | File |
|---|---|---|
| 1 | `ProfilePanel` component | `entrypoints/main-popup.content/components/ProfilePanel.tsx` |
| 2 | `FileDropzone` component | `entrypoints/main-popup.content/components/FileDropzone.tsx` |
| 3 | `FileUploaded` component | `entrypoints/main-popup.content/components/FileUploaded.tsx` |
| 4 | `useProfileForm` hook | `entrypoints/main-popup.content/hooks/useProfileForm.ts` |
| 5 | Update `App.tsx` | Add view routing (initial vs profile) |
| 6 | Update `PopupFooter` | Add `'complete'` status variant |
| 7 | Update `UserProfile` type | Add `cvFileName` and `cvFileSize` fields |
| 8 | Update `userProfile` storage fallback | Include new fields |

**Total new files: 4** (1 panel, 2 sub-components, 1 hook)

---

## 3. File Structure

```
extension/
├── types/
│   └── storage.ts                          # UPDATE: add cvFileName, cvFileSize
│
├── services/
│   └── storage/
│       └── profile.storage.ts              # UPDATE: fallback includes new fields
│
├── entrypoints/
│   └── main-popup.content/
│       ├── App.tsx                          # UPDATE: add view state + profile panel routing
│       ├── components/
│       │   ├── MainPopup.tsx               # unchanged
│       │   ├── PopupHeader.tsx             # unchanged
│       │   ├── PopupFooter.tsx             # UPDATE: add 'complete' status
│       │   ├── InitialPanel.tsx            # unchanged
│       │   ├── ProfilePanel.tsx            # NEW: profile form body
│       │   ├── FileDropzone.tsx            # NEW: drag & drop upload area
│       │   └── FileUploaded.tsx            # NEW: uploaded file info row
│       └── hooks/
│           ├── useUserProfile.ts           # unchanged
│           ├── usePipelineSession.ts       # unchanged
│           └── useProfileForm.ts           # NEW: form state + validation + save
```

---

## 4. Component Hierarchy

```
App.tsx
├── MainPopup (status, onClose)
│   ├── [view === 'initial']
│   │   └── InitialPanel (hasProfile, isLoading, onExtractJob, onEditProfile)
│   │
│   └── [view === 'profile']
│       └── ProfilePanel (profile, onSave, onCancel)
│           ├── FileDropzone (onFileSelect)          — when no file uploaded
│           ├── FileUploaded (fileName, fileSize, onChangeFile) — when file exists
│           └── <textarea> for work history
```

---

## 5. Type Changes

### `types/storage.ts`

```ts
interface UserProfile {
  cvTemplate: string;
  professionalHistory: string;
  displayName?: string;
  cvFileName?: string;      // NEW — original file name for display
  cvFileSize?: number;       // NEW — file size in bytes for display
}
```

**Why store file metadata separately?** The `cvTemplate` field stores the extracted text content (used by the pipeline). `cvFileName` and `cvFileSize` are display-only metadata so the edit screen can show "tomer_raitz_cv.pdf — 245 KB" without re-parsing the template content.

---

## 6. Component Specifications

### 6a. `ProfilePanel.tsx` (~120 lines)

The form body. Manages local form state via `useProfileForm` hook, renders the CV upload section and work history textarea.

```ts
interface ProfilePanelProps {
  profile: UserProfile;
  onSave: () => void;
  onCancel: () => void;
}
```

**Layout (from design node `6ZbQU` / `YMGkB`):**
- Container: `flex flex-col gap-4 p-5` (padding 20px, gap 16px)
- Title: `font-display text-lg text-surface-900` — "Profile setup" or "Edit profile" (conditional on whether profile has data)
- CV Template section (gap-2 vertical stack):
  - Label: `text-sm font-semibold text-surface-700` — "CV Template"
  - Either `<FileDropzone>` or `<FileUploaded>` based on whether a file is selected
- Work History section (gap-2 vertical stack):
  - Label: `text-sm font-semibold text-surface-700` — "Work History"
  - Textarea: `rounded-md border border-surface-200 bg-white p-3 text-xs text-surface-900 placeholder:text-surface-400 leading-relaxed resize-none h-[120px] w-full focus:outline-none focus:border-accent-400 focus:ring-1 focus:ring-accent-400/20`
  - Helper text (setup mode only): `text-[11px] text-surface-400` — "This helps the AI tailor your CV more accurately"
- Actions section (gap-2 vertical stack):
  - Save button: accent-400 bg, white text, full width, h-10, rounded-md, shadow-button — with check icon + "Save Profile"
  - Cancel button: surface-100 bg, surface-600 text, full width, h-10, rounded-md, border surface-200 — with X icon + "Cancel"

**Save button click handler:** `ProfilePanel` must await `handleSave()` from the hook and only call `onSave` if the save succeeded (no error). This prevents navigating back to the initial view when storage write fails:
```ts
const handleSaveClick = async () => {
  await handleSave();
  // handleSave sets error state internally on failure — check it
  // If no error after save, navigate back
  if (!error) onSave();
};
```
Note: Because `error` is React state and won't reflect the new value within the same render cycle, `handleSave` should return a boolean indicating success instead:
```ts
// In useProfileForm: handleSave returns true on success, false on failure
const succeeded = await handleSave();
if (succeeded) onSave();
```

**Conditional rendering logic:**
```ts
const isEditMode = profile.cvTemplate.trim() !== '' || profile.professionalHistory.trim() !== '';
const title = isEditMode ? 'Edit profile' : 'Profile setup';
```

### 6b. `FileDropzone.tsx` (~60 lines)

Drag & drop upload area for when no CV file is selected yet.

```ts
interface FileDropzoneProps {
  onFileSelect: (file: File) => void;
}
// isDragOver is internal state managed within the component, not a prop.
```

**Layout (from design node `2iIox`):**
- Container: `flex flex-col items-center justify-center gap-2 h-[100px] w-full rounded-md border border-dashed border-surface-200 bg-surface-50 cursor-pointer transition-colors`
- Drag-over state: `border-accent-400 bg-accent-50`
- Upload icon: lucide `Upload`, 24px, `text-surface-400`
- Text: `text-xs text-surface-500` — "Drop your CV here or click to browse"
- Hint: `text-[11px] text-surface-400` — "PDF, DOCX up to 2MB"
- Hidden `<input type="file" accept=".pdf,.docx" />` triggered by click

**Drag & drop handling:**
- `onDragOver` / `onDragEnter`: set `isDragOver` local state, `e.preventDefault()`
- `onDragLeave`: clear drag state
- `onDrop`: extract `e.dataTransfer.files[0]`, validate, call `onFileSelect`
- Click: trigger hidden file input's `click()`

**Note on Shadow DOM:** The file input and drag events work normally inside Shadow DOM. No special handling needed.

### 6c. `FileUploaded.tsx` (~50 lines)

Shows uploaded file info with a "Change" button. Displayed when a CV file exists.

```ts
interface FileUploadedProps {
  fileName: string;
  fileSize: number;
  onChangeFile: () => void;
}
```

**Layout (from design node `DpXeA`):**
- Container: `flex items-center gap-2.5 h-12 w-full rounded-md border border-success-500/20 bg-success-50 px-3`
- File icon wrapper: `flex h-7 w-7 items-center justify-center rounded-sm bg-white`
  - Icon: lucide `FileText`, 16px, `text-success-500`
- File info (vertical stack, gap-0.5, flex-1):
  - Name: `text-xs font-medium text-surface-900 truncate` — e.g. "tomer_raitz_cv.pdf"
  - Size: `text-2xs text-surface-400` — e.g. "245 KB"
- Change button: `rounded-sm bg-surface-100 px-2 py-1 text-[11px] font-medium text-surface-600 hover:bg-surface-200 transition-colors`

**File size formatting:**
```ts
function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
```

Inline this helper in `FileUploaded.tsx` — single consumer, no premature abstraction.

---

## 7. Hook: `useProfileForm.ts` (~90 lines)

Manages local form state, file reading, validation, and saving to storage.

```ts
interface UseProfileFormReturn {
  // Form state
  workHistory: string;
  setWorkHistory: (value: string) => void;
  fileName: string | null;
  fileSize: number | null;

  // Actions
  handleFileSelect: (file: File) => void;
  handleSave: () => Promise<boolean>; // returns true on success, false on failure

  // Status
  isSaving: boolean;
  error: string | null;
  isValid: boolean;
}

function useProfileForm(profile: UserProfile): UseProfileFormReturn
```

**Initialization:** Pre-populate from `profile` prop:
```ts
const [workHistory, setWorkHistory] = useState(profile.professionalHistory);
const [cvContent, setCvContent] = useState(profile.cvTemplate);
const [fileName, setFileName] = useState<string | null>(profile.cvFileName ?? null);
const [fileSize, setFileSize] = useState<number | null>(profile.cvFileSize ?? null);
```

**File handling (`handleFileSelect`):**
1. Validate file type: only `.pdf` and `.docx` (check `file.type` and extension via `validateFile`)
2. Validate file size: max 2MB (`2 * 1024 * 1024` bytes)
3. If invalid, set `error` state with descriptive message, return early
4. Read file as `ArrayBuffer` (via `FileReader.readAsArrayBuffer()`) to validate magic bytes via `validateFileContent`
5. If magic bytes invalid, set `error` state, return early
6. Read file as data URL (via `FileReader.readAsDataURL()`) for storage
7. Store: `setCvContent(dataUrl)`, `setFileName(file.name)`, `setFileSize(file.size)`, clear `error`

**File content extraction strategy:**
- For PDF: `FileReader.readAsText()` won't produce usable text from PDFs. For the initial implementation, store the raw file content as a data URL via `FileReader.readAsDataURL()`. The pipeline's backend will handle text extraction. Store the data URL in `cvTemplate`.
- For DOCX: Same approach — store as data URL. Backend handles extraction.
- **Why not client-side parsing?** Avoids adding heavy dependencies (`pdf.js`, `mammoth.js`) to the extension bundle. The backend already processes the CV content — let it handle format conversion.
- **Storage quota safety:** Data URLs are ~33% larger than the raw file due to base64 encoding. A 5MB file becomes ~6.7MB, which risks exceeding `chrome.storage.local` per-item limits. Reduce `MAX_FILE_SIZE` to **2MB** (`2 * 1024 * 1024`) to keep the base64-encoded data URL safely under the 5MB per-item storage quota. Update the dropzone hint text to match ("PDF, DOCX up to 2MB").

**Validation (`isValid`):**
```ts
const MAX_WORK_HISTORY_LENGTH = 5000;
const isValid = cvContent.trim() !== '' && workHistory.trim() !== '' && workHistory.length <= MAX_WORK_HISTORY_LENGTH;
```

Both fields must be non-empty to save. Work history is capped at 5,000 characters to prevent storage quota exhaustion. Apply `maxLength={5000}` on the textarea element in `ProfilePanel.tsx` and show a character counter when the user exceeds 80% of the limit (e.g., "4100 / 5000"). No further validation (the backend validates content quality).

**Save (`handleSave`):**
```ts
async function handleSave(): Promise<boolean> {
  if (!isValid) return false;
  setIsSaving(true);
  try {
    await userProfile.setValue({
      ...profile,              // preserve existing fields (e.g. displayName)
      cvTemplate: cvContent,
      professionalHistory: workHistory,
      cvFileName: fileName ?? undefined,
      cvFileSize: fileSize ?? undefined,
    });
    return true;
  } catch {
    setError('Failed to save profile. Please try again.');
    return false;
  } finally {
    setIsSaving(false);
  }
}
```

Uses the existing `userProfile` storage item from `services/storage/profile.storage.ts`. The `useUserProfile` hook's watcher will automatically pick up the change and update the parent component's state.

---

## 8. View Routing in `App.tsx`

Add a `view` state to switch between InitialPanel and ProfilePanel.

```ts
type AppView = 'initial' | 'profile';

export function App() {
  const { profile, isLoading } = useUserProfile();
  const [view, setView] = useState<AppView>('initial');

  const hasProfile = /* existing logic */;

  const popupStatus = derivePopupStatus(hasProfile, isLoading, view);

  const handleEditProfile = () => setView('profile');
  const handleCancelProfile = () => setView('initial');
  const handleSaveProfile = () => setView('initial');
  const handleClose = () => {
    browser.runtime.sendMessage({ type: 'close-popup' });
  };

  return (
    <MainPopup status={popupStatus} onClose={handleClose}>
      {view === 'initial' ? (
        <InitialPanel
          hasProfile={hasProfile}
          isLoading={isLoading}
          onExtractJob={handleExtractJob}
          onEditProfile={handleEditProfile}
        />
      ) : (
        <ProfilePanel
          profile={profile ?? { cvTemplate: '', professionalHistory: '' }}
          onSave={handleSaveProfile}
          onCancel={handleCancelProfile}
        />
      )}
    </MainPopup>
  );
}
```

**Status derivation update:**
```ts
function derivePopupStatus(
  hasProfile: boolean,
  isLoading: boolean,
  view: AppView,
): PopupStatus {
  if (isLoading) return 'connected';
  if (view === 'profile') return hasProfile ? 'complete' : 'incomplete';
  return hasProfile ? 'connected' : 'incomplete';
}
```

---

## 9. PopupFooter Update

Add `'complete'` as a new status variant:

```ts
// PopupFooter.tsx
type PopupStatus = 'connected' | 'incomplete' | 'complete' | 'error';

const STATUS_CONFIG = {
  connected: { color: 'bg-success-500', label: 'Connected' },
  incomplete: { color: 'bg-warning-500', label: 'Profile incomplete' },
  complete: { color: 'bg-success-500', label: 'Profile complete' },
  error: { color: 'bg-error-500', label: 'Error' },
} as const;
```

The design shows:
- **Profile State** footer: amber/warning dot + "Profile incomplete"
- **Profile Edit Filled State** footer: green/success dot + "Profile complete"

This maps to the existing `incomplete` and the new `complete` status values.

Also update the `PopupStatus` type export in `MainPopup.tsx` to include `'complete'`.

---

## 10. Styling Details (from Design)

### Dimensions
- Popup width: 380px (set on MainPopup — already exists)
- Profile body padding: 20px (`p-5`)
- Section gap: 16px (`gap-4`)
- Inner section gap: 8px (`gap-2`)
- Dropzone height: 100px
- Textarea height: 120px
- Button height: 40px (`h-10`)

### Typography
- Title ("Profile setup" / "Edit profile"): `font-display text-lg text-surface-900` — Instrument Serif 18px
- Section label ("CV Template", "Work History"): `font-body text-sm font-semibold text-surface-700` — DM Sans 13px 600
- Dropzone main text: `font-body text-xs text-surface-500` — DM Sans 12px
- Dropzone hint: `font-body text-[11px] text-surface-400` — DM Sans 11px
- Helper text: `font-body text-[11px] text-surface-400` — DM Sans 11px
- Textarea content: `font-body text-xs text-surface-900 leading-relaxed` — DM Sans 12px
- Textarea placeholder: `placeholder:text-surface-400`
- Save button text: `font-body text-base font-semibold text-white` — DM Sans 14px 600
- Cancel button text: `font-body text-sm font-medium text-surface-600` — DM Sans 13px 500
- File name: `font-body text-xs font-medium text-surface-900` — DM Sans 12px 500
- File size: `font-body text-2xs text-surface-400` — DM Sans 10px
- Change link: `font-body text-[11px] font-medium text-surface-600` — DM Sans 11px 500

### Colors
- Save button: `bg-accent-400 hover:bg-accent-500 active:bg-accent-600 text-white`
- Save button shadow: `shadow-button` + subtle amber glow (`shadow-[0_0_12px_rgba(245,166,35,0.12)]`)
- Cancel button: `bg-surface-100 border border-surface-200 text-surface-600 hover:bg-surface-200`
- Dropzone border: `border-dashed border-surface-200` (design shows solid `border-surface-200` with dashed style)
- Dropzone bg: `bg-surface-50`
- File uploaded bg: `bg-success-50`
- File uploaded border: `border border-success-500/20`
- Textarea border: `border border-surface-200`
- Textarea bg: `bg-white`

### Icons (lucide-react)
- Upload dropzone: `Upload` (24px, surface-400)
- Save button: `Check` (16px, white)
- Cancel button: `X` (14px, surface-600)
- File icon: `FileText` (16px, success-500)

---

## 11. File Upload Handling

### Accepted formats
- `.pdf` — `application/pdf`
- `.docx` — `application/vnd.openxmlformats-officedocument.wordprocessingml.document`

### Size limit
- 2MB maximum (`2 * 1024 * 1024` bytes) — keeps base64-encoded data URL safely under `chrome.storage.local` per-item quota

### Validation logic (in `useProfileForm`)
```ts
const ACCEPTED_TYPES = new Map([
  ['.pdf', 'application/pdf'],
  ['.docx', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'],
]);
const MAX_FILE_SIZE = 2 * 1024 * 1024; // 2MB

// Magic bytes for file content validation
const FILE_SIGNATURES: Record<string, number[]> = {
  '.pdf': [0x25, 0x50, 0x44, 0x46],       // %PDF
  '.docx': [0x50, 0x4B, 0x03, 0x04],       // PK.. (ZIP archive)
};

function getFileExtension(fileName: string): string | null {
  const lastDot = fileName.lastIndexOf('.');
  if (lastDot < 1) return null; // no extension or dot-file
  return fileName.slice(lastDot).toLowerCase();
}

function validateFile(file: File): string | null {
  const ext = getFileExtension(file.name);
  // Require valid extension AND matching MIME type to prevent spoofing
  if (!ext || !ACCEPTED_TYPES.has(ext) || file.type !== ACCEPTED_TYPES.get(ext)) {
    return 'Please upload a PDF or DOCX file.';
  }
  if (file.size > MAX_FILE_SIZE) {
    return 'File size must be under 2MB.';
  }
  if (file.size === 0) {
    return 'File is empty.';
  }
  return null; // valid
}

// Call after reading the file ArrayBuffer to verify magic bytes
function validateFileContent(buffer: ArrayBuffer, ext: string): boolean {
  const signature = FILE_SIGNATURES[ext];
  if (!signature) return false;
  const header = new Uint8Array(buffer.slice(0, signature.length));
  return signature.every((byte, i) => header[i] === byte);
}
```

**File handling flow update:** Read the file twice — first as `ArrayBuffer` (via `FileReader.readAsArrayBuffer()`) to validate magic bytes, then as data URL (via `FileReader.readAsDataURL()`) for storage. If magic bytes don't match, set `error` to `'File appears to be corrupted or is not a valid PDF/DOCX.'` and reject the file.

### Error display
Validation errors appear below the dropzone/file area as `text-xs text-error-500`. Clears when a valid file is selected.

### "Change" file flow
When clicking "Change" on the `FileUploaded` component:
1. Trigger hidden file input click
2. On file selection, validate and replace current file
3. `FileUploaded` switches back to `FileDropzone` momentarily if user cancels the file dialog (keep current file)

---

## 12. Form Validation

### Save button disabled state
The "Save Profile" button is disabled when:
- `cvContent` is empty (no file uploaded)
- `workHistory` is trimmed empty
- `isSaving` is true

Disabled style: `opacity-50 cursor-not-allowed` (no bg change — keeps accent color but faded)

### No explicit "required" indicators
The design doesn't show asterisks or "required" labels. Both fields are implicitly required (save is disabled without them).

---

## 13. State Flow Diagram

```
User clicks "Edit Profile" (InitialPanel)
        ↓
App.tsx sets view = 'profile'
        ↓
ProfilePanel mounts, useProfileForm initializes from current profile
        ↓
User uploads file → handleFileSelect → validates → reads content → local state updates
User types work history → setWorkHistory → local state updates
        ↓
User clicks "Save Profile"
        ↓
handleSave → userProfile.setValue(newProfile)
        ↓
useUserProfile watcher fires → parent re-derives hasProfile
        ↓
onSave callback → App.tsx sets view = 'initial'
        ↓
InitialPanel shows "Ready to tailor" (hasProfile = true)
```

**Cancel flow:** `onCancel` → App.tsx sets `view = 'initial'`. No storage writes. Local form state is discarded (component unmounts).

---

## 14. Implementation Order

| Step | Files | Depends on | Est. lines |
|---|---|---|---|
| **1** | Update `types/storage.ts` — add `cvFileName`, `cvFileSize` | — | ~8 |
| **2** | Update `services/storage/profile.storage.ts` — update fallback | Step 1 | ~2 |
| **3** | `FileDropzone.tsx` — drag & drop upload component | — | ~60 |
| **4** | `FileUploaded.tsx` — uploaded file info row | — | ~50 |
| **5** | `useProfileForm.ts` — form state, file handling, validation, save | Steps 1, 2 | ~90 |
| **6** | `ProfilePanel.tsx` — form body component | Steps 3, 4, 5 | ~120 |
| **7** | Update `PopupFooter.tsx` — add `'complete'` status | — | ~3 |
| **8** | Update `MainPopup.tsx` — update `PopupStatus` type | Step 7 | ~1 |
| **9** | Update `App.tsx` — add view routing, wire ProfilePanel | Steps 6, 7, 8 | ~30 |

---

## 15. Edge Cases

| Case | Handling |
|---|---|
| User opens profile form, changes nothing, clicks Cancel | No storage write. Form unmounts. |
| User uploads file, then clicks Cancel | No storage write. File data discarded. |
| User drags non-PDF/DOCX file | Error message below dropzone. File not accepted. |
| User drags file > 2MB | Error message below dropzone. File not accepted. |
| Extension reloads while form is open | Content script re-initializes. Form state lost (acceptable — user hasn't saved). |
| `userProfile.setValue()` fails | Error state shown: "Failed to save profile. Please try again." |
| Profile has cvTemplate but no cvFileName (legacy data) | Show generic file indicator without name/size, or show "CV Template" with "Change" option |
| User has work history but no CV | Save button disabled. Must upload CV. |
| User has CV but no work history | Save button disabled. Must add work history. |
| File has valid extension/MIME but wrong magic bytes | Error: "File appears to be corrupted or is not a valid PDF/DOCX." File rejected. |
| File has 0 bytes | Error: "File is empty." File rejected. |
| Work history exceeds 5000 characters | `maxLength` on textarea prevents input. `isValid` returns `false` as defense-in-depth. |

---

## 16. Accessibility

- **File dropzone**: `role="button"` + `tabIndex={0}` + `aria-label="Upload CV file"` + keyboard activation (`Enter`/`Space`)
- **Hidden file input**: `aria-hidden="true"`, `tabIndex={-1}`
- **Textarea**: `<textarea id="work-history" aria-label="Work history">` with `<label htmlFor="work-history">`
- **Save button**: Native `<button>` with `disabled` attribute when invalid
- **Cancel button**: Native `<button>`
- **Error messages**: `role="alert"` for validation errors
- **Section labels**: Semantic `<label>` elements associated with inputs

---

## 17. Rules Compliance Checklist

| Rule | Compliance |
|---|---|
| Max 300 lines per file | Largest file is ProfilePanel at ~120 lines |
| Single responsibility | ProfilePanel = form layout, useProfileForm = form logic, FileDropzone = upload UI, FileUploaded = file display |
| Entrypoints kept thin | No changes to `index.tsx` |
| Shared UI in `components/` | No new shared components needed — all are single-consumer in main-popup |
| No premature abstraction | `formatFileSize` inlined in FileUploaded (single consumer). No shared Button component. File validation inlined in hook. |
| Use `browser.*` not `chrome.*` | All storage access via WXT `storage.defineItem` (uses `browser.*` internally) |
| TypeScript strict mode | All props interfaces explicitly typed, no `any` |
| No `eval` or `innerHTML` | All rendering via React JSX |
| Small focused hooks | `useProfileForm` does one thing: form state + save |
| Flat over nested | Component tree is 3 levels (Shell > Panel > Dropzone/FileUploaded) — minimal nesting |
| Prefer built-ins | File reading via native `FileReader`. No new dependencies. |
| State persisted in storage | Profile saved via WXT `storage.defineItem`. Form state is local React state (intentional — unsaved work should not persist). |
| Content script isolation | No DOM access outside Shadow DOM |
| Input validation | File extension + MIME type + magic bytes + size + empty-file check validated before acceptance. Work history capped at 5000 chars. |
| Security | No `innerHTML`, file content read as data URL (not executed), stored in `browser.storage.local`. File size capped at 2MB to stay within storage quota after base64 encoding. `onSave` only fires after confirmed successful storage write. |

---

## 18. Unit Tests

> **Test runner:** Vitest + `@testing-library/react` + `jsdom` (configured in `extension/vitest.config.ts`)
> **Convention:** Co-locate test files next to their source as `<name>.test.ts(x)`

### Task 10: Unit tests for `FileDropzone.tsx`

**File:** `extension/entrypoints/main-popup.content/components/FileDropzone.test.tsx`

**Test cases:**

| # | Case | Assertion |
|---|---|---|
| 1 | Renders upload icon and instructional text | "Drop your CV here or click to browse" and "PDF, DOCX up to 2MB" are in the document |
| 2 | Has correct accessibility attributes | Container has `role="button"`, `tabIndex={0}`, `aria-label="Upload CV file"` |
| 3 | Hidden file input has correct accept attribute | `accept=".pdf,.docx"` |
| 4 | Click triggers hidden file input | Simulate click on container, assert `input.click()` was called (spy on ref) |
| 5 | Keyboard activation (Enter/Space) triggers file input | `fireEvent.keyDown` with Enter and Space keys |
| 6 | File selection calls `onFileSelect` | Simulate `change` event on file input with a mock File, assert callback received the file |
| 7 | Drag over applies visual state | `fireEvent.dragOver` on container, assert `border-accent-400` and `bg-accent-50` classes appear |
| 8 | Drag leave removes visual state | After drag over, fire `dragLeave`, assert default border classes restored |
| 9 | Drop calls `onFileSelect` with dropped file | `fireEvent.drop` with `dataTransfer.files`, assert callback received the file |
| 10 | Drop calls `preventDefault` | Assert `e.preventDefault()` was called to prevent browser default file open |

### Task 11: Unit tests for `FileUploaded.tsx`

**File:** `extension/entrypoints/main-popup.content/components/FileUploaded.test.tsx`

**Test cases:**

| # | Case | Assertion |
|---|---|---|
| 1 | Renders file name | `"resume.pdf"` visible in the document |
| 2 | Renders formatted file size (bytes) | `fileSize={500}` renders "500 B" |
| 3 | Renders formatted file size (KB) | `fileSize={245000}` renders "239 KB" |
| 4 | Renders formatted file size (MB) | `fileSize={2500000}` renders "2.4 MB" |
| 5 | Renders "Change" button | Button with text "Change" is in the document |
| 6 | Clicking "Change" calls `onChangeFile` | Click "Change" button, assert callback fired once |
| 7 | File name truncates long names | Long file name has `truncate` CSS class |
| 8 | File icon is rendered | FileText icon (or equivalent) is present in the container |

### Task 12: Unit tests for `useProfileForm.ts`

**File:** `extension/entrypoints/main-popup.content/hooks/useProfileForm.test.ts`

> Uses `renderHook` from `@testing-library/react`. Requires mocking `userProfile.setValue` from `services/storage/profile.storage.ts`.

**Test cases:**

| # | Case | Assertion |
|---|---|---|
| 1 | Initializes `workHistory` from `profile.professionalHistory` | `result.current.workHistory` equals initial value |
| 2 | Initializes `fileName` from `profile.cvFileName` | `result.current.fileName` equals initial value |
| 3 | Initializes `fileSize` from `profile.cvFileSize` | `result.current.fileSize` equals initial value |
| 4 | `isValid` is `false` when both fields empty | Empty profile returns `isValid === false` |
| 5 | `isValid` is `false` when only CV is set | Has cvContent but empty workHistory returns `false` |
| 6 | `isValid` is `false` when only work history is set | Has workHistory but empty cvContent returns `false` |
| 7 | `isValid` is `true` when both fields have content | Both fields non-empty returns `true` |
| 8 | `setWorkHistory` updates work history state | Call setter, assert value changes |
| 9 | `handleFileSelect` with valid PDF sets file state | Pass a mock PDF File, assert `fileName`, `fileSize`, and cv content update |
| 10 | `handleFileSelect` with valid DOCX sets file state | Pass a mock DOCX File, assert state updates |
| 11 | `handleFileSelect` with invalid type sets error | Pass a `.txt` File, assert `error === 'Please upload a PDF or DOCX file.'` |
| 12 | `handleFileSelect` with oversized file sets error | Pass a 3MB File, assert `error === 'File size must be under 2MB.'` |
| 13 | `handleFileSelect` clears previous error on valid file | Set error with invalid file, then select valid file, assert `error === null` |
| 14 | `handleFileSelect` with spoofed extension rejects file | Pass a File with `.pdf` extension but `text/plain` MIME type, assert error |
| 15 | `handleFileSelect` with invalid magic bytes rejects file | Pass a File whose content lacks valid PDF/DOCX magic bytes, assert error |
| 16 | `handleFileSelect` rejects empty (0-byte) file | Pass a 0-byte File, assert `error === 'File is empty.'` |
| 17 | `handleSave` calls `userProfile.setValue` with correct shape | Assert mock was called with `{ cvTemplate, professionalHistory, cvFileName, cvFileSize }` and preserves existing fields like `displayName` via spread |
| 18 | `handleSave` sets `isSaving` during save | Assert `isSaving === true` while promise is pending |
| 19 | `handleSave` resets `isSaving` after completion | After await, assert `isSaving === false` |
| 20 | `handleSave` sets error on storage failure | Mock `setValue` to reject, assert `error === 'Failed to save profile. Please try again.'` |
| 21 | `handleSave` does nothing when `isValid` is false | Call with empty fields, assert `setValue` was not called |
| 22 | `isValid` is `false` when work history exceeds 5000 chars | Set workHistory to 5001 chars, assert `isValid === false` |
| 23 | `handleSave` returns `true` on success | Call `handleSave` with valid data, assert return value is `true` |
| 24 | `handleSave` returns `false` on failure | Mock `setValue` to reject, assert return value is `false` |

### Task 13: Unit tests for `ProfilePanel.tsx`

**File:** `extension/entrypoints/main-popup.content/components/ProfilePanel.test.tsx`

> Requires mocking `useProfileForm` hook to control form state. Tests focus on rendering logic and event wiring, not form logic (covered by hook tests).

**Test cases:**

| # | Case | Assertion |
|---|---|---|
| 1 | Renders "Profile setup" title for empty profile | `profile` with empty `cvTemplate` and `professionalHistory` shows "Profile setup" |
| 2 | Renders "Edit profile" title for filled profile | `profile` with non-empty fields shows "Edit profile" |
| 3 | Shows `FileDropzone` when no file is selected | Mock hook returns `fileName: null`, assert dropzone is rendered |
| 4 | Shows `FileUploaded` when file is selected | Mock hook returns `fileName: "cv.pdf"`, assert file info row is rendered |
| 5 | Renders "CV Template" and "Work History" labels | Both labels are in the document |
| 6 | Textarea reflects `workHistory` value from hook | Mock hook returns `workHistory: "my history"`, assert textarea value matches |
| 7 | Textarea `onChange` calls `setWorkHistory` | Type in textarea, assert mock `setWorkHistory` was called |
| 8 | Save button is disabled when `isValid` is false | Mock hook returns `isValid: false`, assert button has `disabled` attribute |
| 9 | Save button is enabled when `isValid` is true | Mock hook returns `isValid: true`, assert button does not have `disabled` |
| 10 | Save button is disabled when `isSaving` is true | Mock hook returns `isSaving: true`, assert button disabled |
| 11 | Clicking Save calls `handleSave`, then `onSave` only on success | Click save, assert `handleSave` called; `onSave` called only if `handleSave` resolved without error |
| 12 | Clicking Cancel calls `onCancel` | Click cancel button, assert `onCancel` callback fired |
| 13 | Displays error message from hook | Mock hook returns `error: "Something went wrong"`, assert `role="alert"` with error text |
| 14 | Helper text shown in setup mode only | Empty profile shows helper text; filled profile does not |
| 15 | Save button shows disabled styling | When disabled, button has `opacity-50 cursor-not-allowed` classes |

---

## 19. E2E Tests

> **Test scenario file:** `e2e/tests/02-profile-setup.md`
> **Runner:** `/debug-extension` skill (Playwright via MCP)
> **Prerequisites:** Extension dev server running, E2E mock server on `localhost:3006`

### Task 14: E2E — Profile setup form empty state

**Run via:** `/debug-extension` skill

**Scenario:** Open popup on job page, click "Edit Profile", verify the profile setup form renders with correct layout.

**Verify:**
- Title: "Profile setup"
- CV Template section shows drag & drop dropzone
- Work History section shows empty textarea with placeholder
- Save button is disabled
- Cancel button is enabled
- Footer shows "Profile incomplete" with amber dot

### Task 15: E2E — Upload valid CV file

**Run via:** `/debug-extension` skill

**Scenario:** In the profile setup form, upload a valid PDF file via the file input.

**Verify:**
- Dropzone is replaced with file info row (name + size + "Change" button)
- Save button remains disabled (no work history yet)
- No error messages shown

### Task 16: E2E — File validation errors

**Run via:** `/debug-extension` skill

**Scenario:** Attempt uploading invalid files in the profile form.

**Verify:**
- `.txt` file triggers error: "Please upload a PDF or DOCX file."
- File >2MB triggers error: "File size must be under 2MB."
- Error clears when a valid file is subsequently uploaded

### Task 17: E2E — Save profile (full flow)

**Run via:** `/debug-extension` skill

**Scenario:** Upload a valid CV, enter work history text, click Save.

**Verify:**
- Save button becomes enabled after both fields are filled
- Clicking Save returns to initial panel
- Initial panel shows filled-profile state ("Ready to tailor")
- "Extract Job" button is now enabled
- Footer shows "Connected" with green dot

### Task 18: E2E — Edit existing profile

**Run via:** `/debug-extension` skill

**Scenario:** After saving a profile, click "Edit Profile" again.

**Verify:**
- Title: "Edit profile"
- Textarea is pre-filled with saved work history
- File info row shows saved file name and size
- Footer shows "Profile complete" with green dot
- Save button is enabled (both fields have content)

### Task 19: E2E — Cancel discards changes

**Run via:** `/debug-extension` skill

**Scenario:** Open edit form, modify work history text, click Cancel.

**Verify:**
- Returns to initial panel
- Re-opening edit form shows original saved data (changes were discarded)

### Task 20: E2E — Change uploaded file

**Run via:** `/debug-extension` skill

**Scenario:** In edit mode, click "Change" on the file info row and upload a different file.

**Verify:**
- File info row updates with new file name and size
- Save button remains enabled

### Task 21: E2E — Visual design review

**Run via:** `/debug-extension` skill

**Scenario:** Take screenshots of both setup and edit states.

**Verify with `frontend-design`:**
- Setup state: dashed dropzone, disabled save button, amber footer
- Edit state: green file info row, enabled save button, green footer
- Typography, spacing, colors match the design specifications in `resume-fitter-ui-design.pen`
