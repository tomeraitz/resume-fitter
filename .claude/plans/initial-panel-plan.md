# InitialPanel — Implementation Plan

> Branch: `first-compoent`
> First visual component of the Resume Fitter main popup.
> UI Design source: `.claude/docs/resume-fitter-ui-design.pen` (frames: "Overlay Shell" `8d1FS`, "No Profile State" `xacCu`)

---

## 1. Component Name: `InitialPanel`

Describes both pre-pipeline states (no profile and ready-to-extract). "Panel" suffix is consistent with future panels (ProgressPanel, ResultPanel, ErrorPanel).

---

## 2. Architecture: Shell vs. Content

The main popup shell (header, footer, outer frame) will be reused by every future panel (Progress, Result, Error). The body content is state-specific.

**Decision:** Split the shell into a reusable `MainPopup` component, and the body into `InitialPanel`. The shell takes `children` for the body area plus props for footer status.

```
MainPopup          (header + footer + frame)
  └── children        (swapped per state)
       ├── InitialPanel      (this plan)
       ├── ProgressPanel     (future)
       ├── ResultPanel       (future)
       └── ErrorPanel        (future)
```

**Why not bundle shell + body into one file?** The shell is ~70 lines (header, footer, frame styles). The body is ~60 lines. Keeping them separate means ProgressPanel etc. never touch the shell code. This follows the "single responsibility" and "max 300 lines" rules.

---

## 3. File Structure

All new files live under `extension/entrypoints/content/main-popup/` following the existing pattern. Shared UI pieces go under `extension/components/`.

```
extension/
├── components/
│   └── icons/
│       └── LogoIcon.tsx                 # 3c — CV logo icon (amber square with "CV" text)
│
├── entrypoints/
│   └── content/
│       └── main-popup/
│           ├── App.tsx                  # 3d — root component, owns hooks + state
│           ├── index.tsx                # 3e — WXT content script entrypoint
│           ├── components/
│           │   ├── MainPopup.tsx     # 3f — reusable shell (header, footer, frame)
│           │   ├── PopupHeader.tsx    # 3g — header bar (logo, title, close)
│           │   ├── PopupFooter.tsx    # 3h — footer bar (status dot, version)
│           │   └── InitialPanel.tsx     # 3i — body content for both states
│           └── hooks/
│               ├── useUserProfile.ts        # (exists)
│               └── usePipelineSession.ts    # (exists)
│
├── types/
│   └── popup.ts                       # 3j — shared popup types
│
└── __tests__/
    └── main-popup/
        ├── InitialPanel.test.tsx        # 3k — 8 tests
        └── MainPopup.test.tsx        # 3l — 6 tests
```

**Total new files: 10** (4 components, 1 App root, 1 entrypoint, 1 icon, 1 types, 2 test files).

---

## 4. Font Strategy: Google Fonts `<link>` Injection

**Decision: Load fonts via Google Fonts CDN, injected into `document.head`.**

Key constraint: `@font-face` does NOT work inside Shadow DOM — fonts must be registered in `document.head` regardless of approach. Once registered globally, Shadow DOM elements can reference the `font-family` by name.

### Implementation

In `index.tsx`, before mounting the UI, inject a `<link>` into `document.head`:

```ts
const fontLink = document.createElement('link');
fontLink.rel = 'stylesheet';
fontLink.href = 'https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700&family=Instrument+Serif&display=swap';
document.head.appendChild(fontLink);
```

### Trade-offs accepted

- May not load on sites with strict CSP `font-src` directives blocking `fonts.gstatic.com` (rare, but possible on some corporate sites)
- Requires internet connectivity for first load (browser caches after)
- Sends request to Google on pages where extension is active

### Why this approach

- Zero extension size overhead (no bundled WOFF2 files)
- Simpler implementation — one `<link>` tag, no `@font-face` declarations, no `web_accessible_resources`
- Google Fonts are heavily cached by browsers — near-instant on repeat visits
- Can revisit and switch to bundled WOFF2 later if CSP issues arise in practice

---

## 5. Component Breakdown

### 5a. `LogoIcon.tsx` (~30 lines)

Renders the amber rounded-square with "CV" text. Pure SVG/div, no dependencies. Accepts `size` prop (default 24).

```ts
interface LogoIconProps {
  size?: number;
  className?: string;
}
```

**Why a separate file?** The logo is used in the header and will be used in the popup and options page. Putting it in `components/icons/` makes it project-wide reusable.

### 5b. `MainPopup.tsx` (~70 lines)

The outer frame: 380px wide, surface-50 bg, rounded-lg, overlay shadow, vertical flex. Renders header, children (body slot), and footer.

```ts
interface MainPopupProps {
  status: 'connected' | 'incomplete' | 'error';
  onClose: () => void;
  children: React.ReactNode;
}
```

Layout:
- `<div>` wrapper: `w-[380px] bg-surface-50 rounded-lg shadow-overlay flex flex-col border border-surface-300/45 animate-scale-in`
- `role="dialog"` + `aria-label="Resume Fitter"`
- Renders `<PopupHeader>`, then `{children}`, then `<PopupFooter>`.

### 5c. `PopupHeader.tsx` (~40 lines)

```ts
interface PopupHeaderProps {
  onClose: () => void;
}
```

Layout:
- Flex row, `justify-between`, `items-center`, `py-3 px-4`, `border-b border-surface-200`
- Left: `<LogoIcon size={24} />` + "Resume Fitter" in `font-display text-md text-surface-900`, gap-2
- Right: Close button only (lucide `X` icon, 16px)
- Close button: `<button>` with `aria-label="Close popup"`, `p-1.5 rounded-sm text-surface-500 hover:text-surface-600 hover:bg-surface-100 transition-colors`

### 5d. `PopupFooter.tsx` (~45 lines)

```ts
interface PopupFooterProps {
  status: 'connected' | 'incomplete' | 'error';
}
```

Layout:
- Flex row, `justify-between`, `items-center`, `px-4 py-2.5`, `border-t border-surface-200`
- Left: colored dot (`w-1.5 h-1.5 rounded-full`) + status text (`text-2xs text-surface-500 font-body font-medium`), gap-1.5
  - `connected` → green dot (`bg-success-500`) + "Connected"
  - `incomplete` → orange dot (`bg-warning-500`) + "Profile incomplete"
  - `error` → red dot (`bg-error-500`) + "Error"
- Right: version string in `text-2xs text-surface-400 font-body`
- Version from `import.meta.env.VITE_APP_VERSION` (defined in `wxt.config.ts` via Vite's `define`)
- Status text: `aria-live="polite"` for screen reader announcements

### 5e. `InitialPanel.tsx` (~100 lines)

The body content. Purely presentational — receives all data via props.

```ts
interface InitialPanelProps {
  hasProfile: boolean;
  isLoading: boolean;
  onExtractJob: () => void;
  onEditProfile: () => void;
}
```

**Renders (both states share the same JSX with conditional values):**

```tsx
<div className="flex flex-col items-center gap-5 p-5 text-center">
  {/* Circle icon */}
  <div className="w-12 h-12 rounded-full bg-accent-50 flex items-center justify-center">
    {hasProfile ? <ScanSearch /> : <CircleUserRound />}
  </div>

  {/* Title */}
  <h2 className="font-display text-lg text-surface-900">
    {hasProfile ? "Ready to tailor" : "Set up your profile"}
  </h2>

  {/* Subtitle */}
  <p className="font-body text-sm text-surface-500 max-w-[280px] leading-relaxed">
    {hasProfile
      ? "Extract the job description from this page to start the pipeline"
      : "Add your CV template and work history to get started"}
  </p>

  {/* Primary action button */}
  <button onClick={hasProfile ? onExtractJob : onEditProfile} ...>
    {hasProfile ? <><Sparkles /> Extract Job</> : <><UserPen /> Edit Profile</>}
  </button>

  {/* Secondary action */}
  {hasProfile ? (
    <button onClick={onEditProfile} className="...text link styles...">
      <UserPen /> Edit Profile
    </button>
  ) : (
    <button disabled className="...disabled styles...">
      <Sparkles /> Extract Job
    </button>
  )}
</div>
```

**Design decisions:**
- Single component with conditional rendering — the two states share identical layout, differ only in icon/text/button config. No separate sub-components.
- Inline button styles — no shared Button component yet. Per "no premature abstraction" rule, extract when a second consumer appears.
- Loading state: when `isLoading` is true, show the circle icon area with `animate-pulse-soft` and placeholder text.

**Button styles:**
- Primary: `w-[220px] h-10 rounded flex items-center justify-center gap-2 bg-accent-400 text-white font-body text-base font-semibold shadow-button hover:bg-accent-500 transition-colors`
- Disabled: `w-[220px] h-10 rounded flex items-center justify-center gap-2 bg-surface-200 text-surface-400 font-body text-base font-semibold opacity-60 cursor-not-allowed`
- Text link: `flex items-center gap-1 text-surface-400 font-body text-xs font-medium hover:text-surface-600 transition-colors cursor-pointer`

### 5f. `popup.ts` — Shared Types (~15 lines)

```ts
type PopupStatus = 'connected' | 'incomplete' | 'error';
export type { PopupStatus };
```

---

## 6. State Logic

### Profile completeness check

```ts
const hasProfile = profile !== null
  && profile.cvTemplate.trim() !== ''
  && profile.professionalHistory.trim() !== '';
```

**Decision:** Derive in `App.tsx`, pass `hasProfile` as a prop to `InitialPanel`. The parent already calls `useUserProfile` (needs `isLoading` to decide when to render). This keeps InitialPanel purely presentational.

### Popup status derivation (in App.tsx)

```ts
const popupStatus: PopupStatus = isLoading
  ? 'connected'      // default during load
  : hasProfile ? 'connected' : 'incomplete';
```

---

## 7. Composition — App.tsx & index.tsx

### `App.tsx` (~50 lines)

```ts
function App() {
  const { profile, isLoading } = useUserProfile();

  const hasProfile = !isLoading
    && profile !== null
    && profile.cvTemplate.trim() !== ''
    && profile.professionalHistory.trim() !== '';

  const popupStatus: PopupStatus = isLoading
    ? 'connected'
    : hasProfile ? 'connected' : 'incomplete';

  const handleExtractJob = () => {
    // TODO: scrape job description, send run-pipeline message
  };

  const handleEditProfile = () => {
    browser.runtime.openOptionsPage();
  };

  const handleClose = () => {
    // TODO: hide popup (set visibility state, persist to storage so it resumes)
  };

  return (
    <MainPopup status={popupStatus} onClose={handleClose}>
      <InitialPanel
        hasProfile={hasProfile}
        isLoading={isLoading}
        onExtractJob={handleExtractJob}
        onEditProfile={handleEditProfile}
      />
    </MainPopup>
  );
}
```

### `index.tsx` (~30 lines) — WXT Content Script Entrypoint

```ts
import { createShadowRootUi } from 'wxt/client';

export default defineContentScript({
  matches: ['*://*/*'],
  cssInjectionMode: 'ui',

  async main(ctx) {
    // Inject Google Fonts <link> into document.head (required — Shadow DOM can't register fonts)
    const fontLink = document.createElement('link');
    fontLink.rel = 'stylesheet';
    fontLink.href = 'https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700&family=Instrument+Serif&display=swap';
    document.head.appendChild(fontLink);

    const ui = await createShadowRootUi(ctx, {
      name: 'resume-fitter-overlay',
      position: 'overlay',
      alignment: 'bottom-right',
      onMount(container) {
        const root = createRoot(container);
        root.render(<App />);
        return root;
      },
      onRemove(root) {
        root.unmount();
      },
    });
    ui.mount();
  },
});
```

---

## 8. Close Behavior

**Decision:** Closing hides the popup (not unmount). State is persisted in `browser.storage` so re-opening resumes from the last state. Implementation:

- `handleClose` sets a `visible: false` flag (could be local React state or stored in `browser.storage.session`)
- The popup container gets `display: none` or the component conditionally renders `null`
- Reopening (via toolbar icon click or keyboard shortcut) sets `visible: true`
- Pipeline state is already persisted in `pipelineSession` storage — nothing to lose on hide

---

## 9. Event Handlers

| Action | Handler | Behavior |
|---|---|---|
| "Extract Job" click | `onExtractJob` | TODO: scrape job description from page, send `run-pipeline` message to background |
| "Edit Profile" click | `onEditProfile` | `browser.runtime.openOptionsPage()` |
| Close click | `onClose` | Hide popup, persist visibility state |

All handlers defined in `App.tsx`, passed down as props. Child components are purely presentational.

---

## 10. Lucide Icons

**Package:** `lucide-react` — tree-shakeable, each icon is an individual ESM export.

```bash
cd extension && npm install lucide-react
```

| Icon | Used in |
|---|---|
| `X` | PopupHeader — close button |
| `ScanSearch` | InitialPanel — ready state circle icon |
| `CircleUserRound` | InitialPanel — no-profile state circle icon |
| `Sparkles` | InitialPanel — Extract Job button icon |
| `UserPen` | InitialPanel — Edit Profile button/link icon |

All icons: `size={16}` for buttons, `size={24}` for circle icon area. `strokeWidth={1.5}` for lighter editorial feel.

---

## 11. CSS / Tailwind / Shadow DOM

### Two-point CSS injection

1. **Google Fonts `<link>` → `document.head`**: Content script injects a `<link>` element into the page head for DM Sans + Instrument Serif. Fonts registered globally are available inside Shadow DOM.

2. **Tailwind + design tokens → shadow root**: WXT's `cssInjectionMode: 'ui'` handles this automatically.

### Positioning

Use WXT's `position: 'overlay'` in `createShadowRootUi` — it handles `position: fixed` and high z-index automatically. Set `alignment: 'bottom-right'` for bottom-right corner placement.

---

## 12. Unit Tests

### Test setup prerequisites

Add to `extension/package.json` devDependencies:

```
vitest
@testing-library/react
@testing-library/jest-dom
@testing-library/user-event
jsdom
```

`extension/vitest.config.ts`:
```ts
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./test-setup.ts'],
  },
});
```

`extension/test-setup.ts`:
```ts
import '@testing-library/jest-dom/vitest';
```

### InitialPanel.test.tsx (~120 lines, 8 tests)

| # | Test | Verifies |
|---|---|---|
| 1 | renders "Set up your profile" when `hasProfile` is false | Title, subtitle, CircleUserRound icon |
| 2 | renders "Ready to tailor" when `hasProfile` is true | Title, subtitle, ScanSearch icon |
| 3 | "Extract Job" button is disabled when `hasProfile` is false | `disabled` attr, click does NOT fire `onExtractJob` |
| 4 | "Extract Job" button is enabled when `hasProfile` is true | Click fires `onExtractJob` |
| 5 | "Edit Profile" is primary button when `hasProfile` is false | Accent bg, click fires `onEditProfile` |
| 6 | "Edit Profile" is text link when `hasProfile` is true | Text link style, click fires `onEditProfile` |
| 7 | renders loading state when `isLoading` is true | Pulse animation class present |
| 8 | does not call any handler on initial render | `expect(fn).not.toHaveBeenCalled()` |

No mocking needed — purely presentational component.

### MainPopup.test.tsx (~80 lines, 6 tests)

| # | Test | Verifies |
|---|---|---|
| 1 | renders header with "Resume Fitter" title | Title text present |
| 2 | renders children in body area | `data-testid="child"` appears |
| 3 | calls `onClose` when close button clicked | `userEvent.click` fires callback |
| 4 | shows green dot + "Connected" when status is `connected` | Dot color class, text |
| 5 | shows orange dot + "Profile incomplete" when status is `incomplete` | Dot color class, text |
| 6 | shows version number in footer | Version text present |

No mocking needed — pure presentational components.

---

## 13. Accessibility

- **Close button**: `<button aria-label="Close popup">`
- **Extract Job / Edit Profile**: Native `<button>` elements. Disabled button uses HTML `disabled` attribute (not just visual styling)
- **MainPopup shell**: `role="dialog"` + `aria-label="Resume Fitter"`
- **Footer status**: `aria-live="polite"` on status text
- **Focus**: `autoFocus` on primary action button when popup mounts
- **Tab order**: Natural DOM order (close button → body buttons)

---

## 14. Implementation Order

| Step | Files | Depends on |
|---|---|---|
| **1** | Install deps: `lucide-react`, `vitest`, `@testing-library/react`, `@testing-library/jest-dom`, `@testing-library/user-event`, `jsdom`. Create `vitest.config.ts` + `test-setup.ts`. | — |
| **2** | `types/popup.ts` | — |
| **3** | `components/icons/LogoIcon.tsx` | — |
| **4** | `main-popup/components/PopupFooter.tsx` | Step 2 |
| **5** | `main-popup/components/PopupHeader.tsx` | Step 3 |
| **6** | `main-popup/components/MainPopup.tsx` | Steps 4, 5 |
| **7** | `__tests__/main-popup/MainPopup.test.tsx` | Step 6 |
| **8** | `main-popup/components/InitialPanel.tsx` | — |
| **9** | `__tests__/main-popup/InitialPanel.test.tsx` | Step 8 |
| **10** | `main-popup/App.tsx` | Steps 6, 8 |
| **11** | `main-popup/index.tsx` (content script entrypoint + Google Fonts `<link>` injection) | Step 10 |
| **12** | Wire version string: add `define` in `wxt.config.ts` to read from `package.json` | — |

---

## 15. Version String via Vite Define

In `wxt.config.ts`:
```ts
import { defineConfig } from 'wxt';
import pkg from './package.json';

export default defineConfig({
  vite: () => ({
    define: {
      'import.meta.env.VITE_APP_VERSION': JSON.stringify(`v${pkg.version}`),
    },
  }),
});
```

Usage in `PopupFooter.tsx`:
```ts
const version = import.meta.env.VITE_APP_VERSION ?? 'v0.1.0';
```

---

## 16. Rules Compliance Checklist

| Rule | Compliance |
|---|---|
| Max 300 lines per file | Largest file is InitialPanel at ~100 lines |
| Single responsibility | Each component does one thing |
| Entrypoints kept thin | `index.tsx` is ~30 lines — delegates to `App.tsx` |
| Shared UI in `components/` | `LogoIcon` in `components/icons/` |
| Use `browser.*` not `chrome.*` | `browser.runtime.openOptionsPage()` in App.tsx |
| TypeScript strict mode | All props interfaces explicitly typed, no `any` |
| No `eval` or `innerHTML` | All rendering via React JSX |
| No premature abstraction | No shared Button component — inline styles |
| Small focused hooks | `useUserProfile` only; no new hooks needed |
| Flat over nested | Component tree is 2 levels deep (Shell > Panel) |
| Prefer built-ins | `lucide-react` is only new runtime dep |
| Google Fonts via `<link>` | Simple, zero extension size overhead |
