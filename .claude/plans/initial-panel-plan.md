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

The existing content script entrypoint is `extension/entrypoints/content/overlay/` which already contains hooks (`useUserProfile.ts`, `usePipelineSession.ts`). Rather than creating a parallel `main-popup/` directory, we rename `overlay/` to `main-popup/` to avoid duplicate entrypoints on the same `matches` pattern.

Shared UI pieces go under `extension/components/`. `PopupStatus` type is inlined in `MainPopup.tsx` (too small for its own file). Test files are co-located next to source files.

```
extension/
├── components/
│   ├── icons/
│   │   └── LogoIcon.tsx                 # CV logo icon (amber square with "CV" text)
│   └── ErrorBoundary.tsx                # Simple error boundary for overlay crash recovery
│
├── entrypoints/
│   └── content/
│       └── main-popup/                  # renamed from overlay/
│           ├── App.tsx                  # root component, owns hooks + state
│           ├── index.tsx                # WXT content script entrypoint
│           ├── main-popup.css           # Tailwind directives + design token import
│           ├── components/
│           │   ├── MainPopup.tsx         # reusable shell (header, footer, frame)
│           │   ├── MainPopup.test.tsx    # 6 tests (co-located)
│           │   ├── PopupHeader.tsx       # header bar (logo, title, close)
│           │   ├── PopupFooter.tsx       # footer bar (status dot, version)
│           │   ├── InitialPanel.tsx      # body content for both states
│           │   └── InitialPanel.test.tsx # 8 tests (co-located)
│           └── hooks/
│               ├── useUserProfile.ts        # (exists — moved from overlay/)
│               └── usePipelineSession.ts    # (exists — moved from overlay/)
```

**Total new files: 9** (4 components, 1 App root, 1 entrypoint, 1 icon, 1 CSS, 1 error boundary, 2 test files).

---

## 4. Font Strategy: Bundled WOFF2 Files

**Decision: Bundle WOFF2 font files with `web_accessible_resources` and `@font-face` declarations.**

Key constraint: `@font-face` does NOT work inside Shadow DOM — fonts must be registered in `document.head` regardless of approach. Once registered globally, Shadow DOM elements can reference the `font-family` by name.

### Why bundled instead of CDN

The primary target audience uses job boards (LinkedIn, Greenhouse, Lever) and corporate ATS portals, which often set strict CSP `font-src` directives blocking `fonts.gstatic.com`. Bundling ensures fonts work reliably on these critical sites.

### Implementation

1. Download DM Sans (400, 500, 600, 700) and Instrument Serif WOFF2 files into `extension/assets/fonts/`.
2. Add `web_accessible_resources` in WXT manifest config for the font files.
3. In `index.tsx`, inject a `<style>` with `@font-face` declarations into `document.head`, using `browser.runtime.getURL()` for font file paths.
4. **Clean up on context invalidation** — remove the injected `<style>` when the content script is invalidated:

```ts
const fontStyle = document.createElement('style');
fontStyle.textContent = `
  @font-face {
    font-family: 'DM Sans';
    src: url('${browser.runtime.getURL('/assets/fonts/dm-sans-400.woff2')}') format('woff2');
    font-weight: 400;
    font-display: swap;
  }
  /* ... additional weights and Instrument Serif ... */
`;
document.head.appendChild(fontStyle);

ctx.onInvalidated(() => {
  fontStyle.remove();
});
```

### Trade-offs accepted

- Adds ~150KB to extension size (WOFF2 is well-compressed)
- Slightly more implementation work than a CDN `<link>`
- Works offline and on all sites regardless of CSP

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
- Version from `browser.runtime.getManifest().version` (idiomatic extension API — WXT derives it from `package.json`)
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

### 5f. `PopupStatus` type (inlined in `MainPopup.tsx`)

```ts
type PopupStatus = 'connected' | 'incomplete' | 'error';
```

Inlined in `MainPopup.tsx` rather than a separate file — a single type alias doesn't warrant its own file. Extract to a shared file if more popup types emerge.

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

### `index.tsx` (~45 lines) — WXT Content Script Entrypoint

```ts
import { createShadowRootUi } from 'wxt/client';
import './main-popup.css'; // Tailwind directives + design tokens — injected into shadow root by WXT

export default defineContentScript({
  matches: ['*://*/*'],
  cssInjectionMode: 'ui',

  async main(ctx) {
    // Inject @font-face into document.head (required — Shadow DOM can't register fonts)
    const fontStyle = document.createElement('style');
    fontStyle.textContent = `
      @font-face {
        font-family: 'DM Sans';
        src: url('${browser.runtime.getURL('/assets/fonts/dm-sans-400.woff2')}') format('woff2');
        font-weight: 400; font-display: swap;
      }
      /* ... additional weights + Instrument Serif */
    `;
    document.head.appendChild(fontStyle);

    // Clean up font style on extension reload/update
    ctx.onInvalidated(() => {
      fontStyle.remove();
    });

    const ui = await createShadowRootUi(ctx, {
      name: 'resume-fitter-overlay',
      position: 'overlay',
      onMount(container) {
        const root = createRoot(container);
        root.render(
          <ErrorBoundary>
            <App />
          </ErrorBoundary>
        );
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

**Notes:**
- `position: 'overlay'` handles `position: fixed` and high z-index. Bottom-right positioning is done via CSS on the `MainPopup` wrapper (e.g., `fixed bottom-4 right-4`), NOT via `alignment` (which is only valid for `createIntegratedUi`).
- `./main-popup.css` contains `@tailwind base; @tailwind components; @tailwind utilities;` plus `@import '../../assets/design-tokens.css';`. WXT's `cssInjectionMode: 'ui'` injects CSS imported in the entrypoint into the shadow root.
- `<ErrorBoundary>` wraps `<App />` to prevent rendering errors from crashing the entire overlay.

---

## 8. Close Behavior

**Decision:** Closing hides the popup via conditional rendering (`App` returns `null`). The React tree stays mounted but renders nothing, so storage watchers in hooks are paused (no DOM, minimal overhead). Visibility state is stored in `browser.storage.session` so it persists across page navigations within the same browser session.

### Mechanism

- `handleClose` writes `{ visible: false }` to `browser.storage.session` and sets local state to hidden.
- `App` reads visibility on mount from `browser.storage.session`. If `visible === false`, renders `null`.
- Pipeline state is already persisted in `pipelineSession` storage — nothing to lose on hide.

### Reopening

- **Toolbar icon click**: Background script listens for `browser.action.onClicked`, sends a message to the content script to toggle visibility.
- **Keyboard shortcut** (optional, future): Register a command in manifest, background forwards to content script.
- Content script listens via `browser.runtime.onMessage` for a `toggle-popup` message, flips visibility state.

### Why not `ui.remove()`/`ui.mount()`

Unmounting and remounting the shadow root is heavier than conditional rendering. The shadow root container exists either way — toggling what renders inside it is simpler and preserves any transient React state.

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

1. **`@font-face` `<style>` → `document.head`**: Content script injects a `<style>` element with `@font-face` declarations pointing to bundled WOFF2 files via `browser.runtime.getURL()`. Fonts registered globally are available inside Shadow DOM. Cleaned up via `ctx.onInvalidated()`.

2. **Tailwind + design tokens → shadow root**: WXT's `cssInjectionMode: 'ui'` injects CSS that is **imported in the entrypoint file** into the shadow root. The entrypoint must import `./main-popup.css` which contains:

```css
@import '../../../assets/design-tokens.css';
@tailwind base;
@tailwind components;
@tailwind utilities;
```

Without this explicit import, no Tailwind classes will resolve inside the shadow root.

### Positioning

Use WXT's `position: 'overlay'` in `createShadowRootUi` — it handles `position: fixed` and high z-index automatically. Bottom-right placement is done via CSS on the `MainPopup` wrapper element (e.g., `fixed bottom-4 right-4`). Note: `alignment` is NOT a valid option for overlay position — it belongs to `createIntegratedUi`.

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
- **Focus**: `autoFocus` doesn't work in Shadow DOM — use `useEffect` + `ref.current?.focus()` on the primary action button. Only auto-focus when the user explicitly opens the popup (toolbar click), not on initial content script mount, to avoid stealing focus from host page form fields.
- **Tab order**: Natural DOM order (close button → body buttons)

---

## 14. Implementation Order

| Step | Files | Depends on |
|---|---|---|
| **1** | Rename `overlay/` to `main-popup/`. Install deps: `lucide-react`, `vitest`, `@testing-library/react`, `@testing-library/jest-dom`, `@testing-library/user-event`, `jsdom`. Create `vitest.config.ts` + `test-setup.ts`. | — |
| **2** | Download WOFF2 font files into `extension/assets/fonts/`. Add `web_accessible_resources` config. | — |
| **3** | `components/icons/LogoIcon.tsx` | — |
| **4** | `components/ErrorBoundary.tsx` | — |
| **5** | `main-popup/main-popup.css` (Tailwind directives + design token import) | — |
| **6** | `main-popup/components/PopupFooter.tsx` | — |
| **7** | `main-popup/components/PopupHeader.tsx` | Step 3 |
| **8** | `main-popup/components/MainPopup.tsx` (`PopupStatus` type inlined here) | Steps 6, 7 |
| **9** | `main-popup/components/MainPopup.test.tsx` (co-located) | Step 8 |
| **10** | `main-popup/components/InitialPanel.tsx` | — |
| **11** | `main-popup/components/InitialPanel.test.tsx` (co-located) | Step 10 |
| **12** | `main-popup/App.tsx` | Steps 8, 10 |
| **13** | `main-popup/index.tsx` (entrypoint + font injection + cleanup + ErrorBoundary) | Steps 4, 5, 12 |

---

## 15. Version String via Extension Manifest API

Usage in `PopupFooter.tsx`:
```ts
const version = `v${browser.runtime.getManifest().version}`;
```

This is the idiomatic extension approach — WXT derives the manifest version from `package.json` automatically. No `wxt.config.ts` define block needed.

---

## 16. Rules Compliance Checklist

| Rule | Compliance |
|---|---|
| Max 300 lines per file | Largest file is InitialPanel at ~100 lines |
| Single responsibility | Each component does one thing |
| Entrypoints kept thin | `index.tsx` is ~45 lines — delegates to `App.tsx` |
| Shared UI in `components/` | `LogoIcon`, `ErrorBoundary` in `components/` |
| Shared code rule | Hooks stay in `main-popup/hooks/` (single consumer for now) |
| Use `browser.*` not `chrome.*` | `browser.runtime.openOptionsPage()`, `browser.runtime.getManifest()` |
| TypeScript strict mode | All props interfaces explicitly typed, no `any` |
| No `eval` or `innerHTML` | All rendering via React JSX |
| No premature abstraction | No shared Button component — inline styles. `PopupStatus` inlined. |
| Small focused hooks | `useUserProfile` only; no new hooks needed |
| Flat over nested | Component tree is 2 levels deep (Shell > Panel) |
| Prefer built-ins | `lucide-react` is only new runtime dep |
| Bundled WOFF2 fonts | Reliable on job boards with strict CSP |
| Content script isolation | Font `<style>` cleaned up via `ctx.onInvalidated()` |
| Error resilience | `ErrorBoundary` wraps `<App />` in entrypoint |
| Test co-location | Tests next to source files, not in separate `__tests__/` |
