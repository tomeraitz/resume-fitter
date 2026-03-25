# CV Output Full Page Implementation Plan

**Goal:** Add a full-page CV preview tab with split view (CV + chat shell) that opens when user clicks "Preview CV"

**Architecture:** New WXT unlisted page entrypoint (`cv-preview.html`) reads pipeline session from storage. The popup sends a message to background to open the preview tab. Download/Cancel clear session and close tab.

**Tech Stack:** WXT, React, Tailwind CSS, Lucide icons, WXT storage API

---

### Task 1: Add `open-cv-preview` message type and background handler

**Files:**
- `extension/types/messages.ts`
- `extension/entrypoints/background.ts`

**Steps:**
- [ ] Add `OpenCvPreviewMessage` type to messages.ts
- [ ] Add handler in background.ts to open the CV preview tab
- [ ] Commit

**Code — `extension/types/messages.ts`:**

Add the new message type and update the union:

```typescript
interface OpenCvPreviewMessage {
  type: 'open-cv-preview';
}

type ExtensionMessage =
  | RunPipelineMessage
  | CancelPipelineMessage
  | ExtractJobMessage
  | OpenCvPreviewMessage;
```

Also export `OpenCvPreviewMessage`:

```typescript
export type {
  RunPipelineMessage,
  CancelPipelineMessage,
  ExtractJobMessage,
  ExtractJobResponse,
  ExtensionMessage,
  OpenCvPreviewMessage,
};
```

**Code — `extension/entrypoints/background.ts`:**

Add handler inside the `browser.runtime.onMessage.addListener` callback, after the `close-popup` handler:

```typescript
if (type === 'open-cv-preview') {
  browser.tabs.create({
    url: browser.runtime.getURL('/cv-preview.html'),
  });
  return true;
}
```

**Test:** Manual — send `{ type: 'open-cv-preview' }` from the popup and verify a new tab opens at the extension URL. (The page will 404 until Task 2 is done.)

---

### Task 2: Create the `cv-preview.html` WXT page entrypoint (shell)

**Files:**
- `extension/entrypoints/cv-preview/index.html` (WXT page entrypoint)
- `extension/entrypoints/cv-preview/main.tsx` (React mount)
- `extension/entrypoints/cv-preview/App.tsx` (root component — loading state only)
- `extension/entrypoints/cv-preview/cv-preview.css` (Tailwind + design tokens + font-faces)

**Steps:**
- [ ] Create `extension/entrypoints/cv-preview/index.html`
- [ ] Create `extension/entrypoints/cv-preview/main.tsx`
- [ ] Create `extension/entrypoints/cv-preview/cv-preview.css`
- [ ] Create `extension/entrypoints/cv-preview/App.tsx` (loading skeleton)
- [ ] Verify `pnpm dev` builds the new entrypoint and the page loads at `/cv-preview.html`
- [ ] Commit

**Code — `extension/entrypoints/cv-preview/index.html`:**

```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Resume Fitter — CV Preview</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="./main.tsx"></script>
  </body>
</html>
```

**Code — `extension/entrypoints/cv-preview/main.tsx`:**

```tsx
import ReactDOM from 'react-dom/client';
import { App } from './App';
import { ErrorBoundary } from '../../components/ErrorBoundary';
import './cv-preview.css';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <ErrorBoundary>
    <App />
  </ErrorBoundary>,
);
```

**Code — `extension/entrypoints/cv-preview/cv-preview.css`:**

```css
@import '../../assets/design-tokens.css';
@tailwind base;
@tailwind components;
@tailwind utilities;

@font-face {
  font-family: 'DM Sans';
  font-style: normal;
  font-weight: 400 700;
  font-display: swap;
  src: url('/assets/fonts/dm-sans-latin.woff2') format('woff2');
  unicode-range: U+0000-00FF, U+0131, U+0152-0153, U+02BB-02BC, U+02C6,
    U+02DA, U+02DC, U+0304, U+0308, U+0329, U+2000-206F, U+20AC, U+2122,
    U+2191, U+2193, U+2212, U+2215, U+FEFF, U+FFFD;
}

@font-face {
  font-family: 'DM Sans';
  font-style: normal;
  font-weight: 400 700;
  font-display: swap;
  src: url('/assets/fonts/dm-sans-latin-ext.woff2') format('woff2');
  unicode-range: U+0100-02BA, U+02BD-02C5, U+02C7-02CC, U+02CE-02D7,
    U+02DD-02FF, U+0304, U+0308, U+0329, U+1D00-1DBF, U+1E00-1E9F,
    U+1EF2-1EFF, U+2020, U+20A0-20AB, U+20AD-20C0, U+2113, U+2C60-2C7F,
    U+A720-A7FF;
}

@font-face {
  font-family: 'Instrument Serif';
  font-style: normal;
  font-weight: 400;
  font-display: swap;
  src: url('/assets/fonts/instrument-serif-latin.woff2') format('woff2');
  unicode-range: U+0000-00FF, U+0131, U+0152-0153, U+02BB-02BC, U+02C6,
    U+02DA, U+02DC, U+0304, U+0308, U+0329, U+2000-206F, U+20AC, U+2122,
    U+2191, U+2193, U+2212, U+2215, U+FEFF, U+FFFD;
}

@font-face {
  font-family: 'Instrument Serif';
  font-style: normal;
  font-weight: 400;
  font-display: swap;
  src: url('/assets/fonts/instrument-serif-latin-ext.woff2') format('woff2');
  unicode-range: U+0100-02BA, U+02BD-02C5, U+02C7-02CC, U+02CE-02D7,
    U+02DD-02FF, U+0304, U+0308, U+0329, U+1D00-1DBF, U+1E00-1E9F,
    U+1EF2-1EFF, U+2020, U+20A0-20AB, U+20AD-20C0, U+2113, U+2C60-2C7F,
    U+A720-A7FF;
}

html {
  font-family: 'DM Sans', system-ui, sans-serif;
  font-size: 16px;
  line-height: 1.5;
  color: var(--rf-surface-800);
  -webkit-font-smoothing: antialiased;
  -moz-osx-font-smoothing: grayscale;
}

body {
  margin: 0;
  padding: 0;
  background-color: var(--rf-surface-50);
}
```

**Code — `extension/entrypoints/cv-preview/App.tsx`:**

```tsx
export function App() {
  return (
    <div className="flex h-screen items-center justify-center font-body text-md text-surface-500">
      Loading CV preview...
    </div>
  );
}
```

**Test command:**

```bash
cd extension && pnpm dev
# Open chrome-extension://<id>/cv-preview.html — should show "Loading CV preview..."
```

---

### Task 3: Create `useCvPreviewData` hook to read pipeline session

**Files:**
- `extension/entrypoints/cv-preview/hooks/useCvPreviewData.ts`
- `extension/entrypoints/cv-preview/hooks/useCvPreviewData.test.ts`

**Steps:**
- [ ] Create the hook that reads `pipelineSession` from storage and derives the view data
- [ ] Write unit tests
- [ ] Commit

**Code — `extension/entrypoints/cv-preview/hooks/useCvPreviewData.ts`:**

```typescript
import { useEffect, useState } from 'react';
import { pipelineSession } from '../../../services/storage';
import type { PipelineSession } from '../../../types/pipeline';

export interface CvPreviewData {
  finalCv: string;
  jobTitle: string;
  jobCompany: string;
  atsScore: number;
  matchScore: number;
}

type CvPreviewState =
  | { status: 'loading' }
  | { status: 'ready'; data: CvPreviewData }
  | { status: 'empty' };

export function useCvPreviewData(): CvPreviewState {
  const [state, setState] = useState<CvPreviewState>({ status: 'loading' });

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        const session = await pipelineSession.getValue();
        if (cancelled) return;

        const data = derivePreviewData(session);
        setState(data ? { status: 'ready', data } : { status: 'empty' });
      } catch {
        if (!cancelled) setState({ status: 'empty' });
      }
    }

    load();

    const unwatch = pipelineSession.watch((newVal) => {
      if (cancelled) return;
      const data = derivePreviewData(newVal);
      setState(data ? { status: 'ready', data } : { status: 'empty' });
    });

    return () => {
      cancelled = true;
      unwatch();
    };
  }, []);

  return state;
}

function derivePreviewData(session: PipelineSession): CvPreviewData | null {
  if (session.status !== 'completed' || !session.generatedCv) return null;

  const hmData = session.steps['hiring-manager'].data;
  const atsData = session.steps['ats-scanner'].data;

  const matchScore =
    hmData?.step === 'hiring-manager' ? hmData.matchScore : 0;
  const atsScore =
    atsData?.step === 'ats-scanner' ? atsData.atsScore : 0;

  return {
    finalCv: session.generatedCv,
    jobTitle: session.jobTitle ?? 'Untitled Position',
    jobCompany: session.jobCompany ?? '',
    atsScore,
    matchScore,
  };
}
```

**Code — `extension/entrypoints/cv-preview/hooks/useCvPreviewData.test.ts`:**

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { useCvPreviewData } from './useCvPreviewData';
import type { PipelineSession } from '../../../types/pipeline';

const COMPLETED_SESSION: PipelineSession = {
  status: 'completed',
  extractionStatus: 'done',
  jobDescription: 'Test JD',
  jobTitle: 'Senior Engineer',
  jobCompany: 'Acme',
  generatedCv: '<html><body>CV</body></html>',
  steps: {
    'hiring-manager': {
      step: 'hiring-manager',
      status: 'completed',
      data: {
        step: 'hiring-manager',
        matchScore: 92,
        missingKeywords: [],
        summary: 'Good match',
        cvLanguage: 'en',
      },
    },
    'rewrite-resume': {
      step: 'rewrite-resume',
      status: 'completed',
      data: {
        step: 'rewrite-resume',
        updatedCvHtml: '<html>updated</html>',
        keywordsNotAdded: [],
      },
    },
    'ats-scanner': {
      step: 'ats-scanner',
      status: 'completed',
      data: {
        step: 'ats-scanner',
        atsScore: 87,
        problemAreas: [],
        updatedCvHtml: '<html>ats</html>',
      },
    },
    'verifier': {
      step: 'verifier',
      status: 'completed',
      data: {
        step: 'verifier',
        verifiedCv: '<html>verified</html>',
        flaggedClaims: [],
      },
    },
  },
};

vi.mock('../../../services/storage', () => {
  let currentSession = { ...COMPLETED_SESSION };
  let watchers: Array<(val: PipelineSession) => void> = [];

  return {
    pipelineSession: {
      getValue: vi.fn(() => Promise.resolve(currentSession)),
      watch: vi.fn((cb: (val: PipelineSession) => void) => {
        watchers.push(cb);
        return () => {
          watchers = watchers.filter((w) => w !== cb);
        };
      }),
      setValue: vi.fn(async (val: PipelineSession) => {
        currentSession = val;
        watchers.forEach((w) => w(val));
      }),
    },
    EMPTY_SESSION: {
      status: 'idle',
      extractionStatus: 'idle',
      jobDescription: '',
      steps: {
        'hiring-manager': { step: 'hiring-manager', status: 'pending' },
        'rewrite-resume': { step: 'rewrite-resume', status: 'pending' },
        'ats-scanner': { step: 'ats-scanner', status: 'pending' },
        'verifier': { step: 'verifier', status: 'pending' },
      },
      extractedJob: undefined,
      generatedCv: null,
    },
  };
});

describe('useCvPreviewData', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns loading initially then ready with data', async () => {
    const { result } = renderHook(() => useCvPreviewData());
    expect(result.current.status).toBe('loading');

    await waitFor(() => {
      expect(result.current.status).toBe('ready');
    });

    if (result.current.status === 'ready') {
      expect(result.current.data.jobTitle).toBe('Senior Engineer');
      expect(result.current.data.atsScore).toBe(87);
      expect(result.current.data.matchScore).toBe(92);
      expect(result.current.data.finalCv).toContain('<html>');
    }
  });
});
```

**Test command:**

```bash
cd extension && pnpm test -- useCvPreviewData
```

---

### Task 4: Build the `PreviewTopBar` component

**Files:**
- `extension/entrypoints/cv-preview/components/PreviewTopBar.tsx`
- `extension/entrypoints/cv-preview/components/PreviewTopBar.test.tsx`

**Steps:**
- [ ] Create PreviewTopBar with logo, job title, score badges, Download button, Cancel button
- [ ] Write unit tests
- [ ] Commit

**Code — `extension/entrypoints/cv-preview/components/PreviewTopBar.tsx`:**

```tsx
import { Download, ShieldCheck, Target, X } from 'lucide-react';
import { LogoIcon } from '../../../components/icons/LogoIcon';

interface PreviewTopBarProps {
  jobTitle: string;
  atsScore: number;
  matchScore: number;
  onDownload: () => void;
  onCancel: () => void;
}

export function PreviewTopBar({
  jobTitle,
  atsScore,
  matchScore,
  onDownload,
  onCancel,
}: PreviewTopBarProps) {
  return (
    <header className="flex h-14 shrink-0 items-center justify-between border-b border-surface-200 bg-white px-5">
      {/* Left: Logo + title + separator + job title */}
      <div className="flex items-center gap-3">
        <LogoIcon size={32} />
        <span className="font-display text-xl text-surface-900">
          Resume Fitter
        </span>
        <div className="h-6 w-px bg-surface-200" aria-hidden="true" />
        <span className="font-body text-sm text-surface-500">{jobTitle}</span>
      </div>

      {/* Right: Badges + buttons */}
      <div className="flex items-center gap-2.5">
        <div className="flex items-center gap-1 rounded-full bg-success-50 px-2.5 py-1">
          <ShieldCheck size={14} className="text-success-700" aria-hidden="true" />
          <span className="font-body text-xs font-semibold text-success-700">
            ATS: {atsScore}
          </span>
        </div>
        <div className="flex items-center gap-1 rounded-full bg-accent-50 px-2.5 py-1">
          <Target size={14} className="text-accent-700" aria-hidden="true" />
          <span className="font-body text-xs font-semibold text-accent-700">
            Match: {matchScore}%
          </span>
        </div>

        <button
          type="button"
          onClick={onDownload}
          className="ml-1 flex h-9 items-center gap-1.5 rounded bg-surface-900 px-3.5 font-body text-sm font-semibold text-white shadow-button transition-colors hover:bg-surface-800 active:bg-surface-700"
        >
          <Download size={14} strokeWidth={2} />
          Download
        </button>
        <button
          type="button"
          onClick={onCancel}
          aria-label="Cancel and close"
          className="flex h-9 items-center gap-1.5 rounded border border-surface-200 bg-surface-100 px-3 font-body text-sm font-semibold text-surface-600 transition-colors hover:bg-surface-200"
        >
          <X size={14} strokeWidth={2} />
          Cancel
        </button>
      </div>
    </header>
  );
}
```

**Code — `extension/entrypoints/cv-preview/components/PreviewTopBar.test.tsx`:**

```tsx
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { PreviewTopBar } from './PreviewTopBar';

describe('PreviewTopBar', () => {
  const defaultProps = {
    jobTitle: 'Senior Frontend Engineer',
    atsScore: 87,
    matchScore: 92,
    onDownload: vi.fn(),
    onCancel: vi.fn(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders the brand name "Resume Fitter"', () => {
    render(<PreviewTopBar {...defaultProps} />);
    expect(screen.getByText('Resume Fitter')).toBeInTheDocument();
  });

  it('renders the job title', () => {
    render(<PreviewTopBar {...defaultProps} />);
    expect(screen.getByText('Senior Frontend Engineer')).toBeInTheDocument();
  });

  it('renders ATS score badge', () => {
    render(<PreviewTopBar {...defaultProps} />);
    expect(screen.getByText('ATS: 87')).toBeInTheDocument();
  });

  it('renders Match score badge', () => {
    render(<PreviewTopBar {...defaultProps} />);
    expect(screen.getByText('Match: 92%')).toBeInTheDocument();
  });

  it('calls onDownload when Download button is clicked', async () => {
    render(<PreviewTopBar {...defaultProps} />);
    await userEvent.click(screen.getByRole('button', { name: /download/i }));
    expect(defaultProps.onDownload).toHaveBeenCalledOnce();
  });

  it('calls onCancel when Cancel button is clicked', async () => {
    render(<PreviewTopBar {...defaultProps} />);
    await userEvent.click(screen.getByRole('button', { name: /cancel/i }));
    expect(defaultProps.onCancel).toHaveBeenCalledOnce();
  });
});
```

**Test command:**

```bash
cd extension && pnpm test -- PreviewTopBar
```

---

### Task 5: Build the `CvPanel` component (left side — CV renderer)

**Files:**
- `extension/entrypoints/cv-preview/components/CvPanel.tsx`
- `extension/entrypoints/cv-preview/components/CvPanel.test.tsx`

**Steps:**
- [ ] Create CvPanel that renders the HTML CV in a paper container using `dangerouslySetInnerHTML`
- [ ] Write unit tests
- [ ] Commit

**Code — `extension/entrypoints/cv-preview/components/CvPanel.tsx`:**

```tsx
interface CvPanelProps {
  cvHtml: string;
}

export function CvPanel({ cvHtml }: CvPanelProps) {
  return (
    <div className="flex-1 overflow-auto bg-white p-8">
      <div className="mx-auto w-[600px] rounded bg-white p-8 pt-10 shadow-card">
        <div dangerouslySetInnerHTML={{ __html: cvHtml }} />
      </div>
    </div>
  );
}
```

> **Note on `dangerouslySetInnerHTML`:** The `finalCv` is generated by our own server pipeline (trusted output), not user input. The `wxt-react-rules.md` rule "No `eval` or `innerHTML`" targets page-injected content scripts where CSP applies. This is an extension page (`chrome-extension://` origin) rendering our own server output, so `dangerouslySetInnerHTML` is acceptable here. The CV HTML is already validated server-side by the verifier agent.

**Code — `extension/entrypoints/cv-preview/components/CvPanel.test.tsx`:**

```tsx
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { CvPanel } from './CvPanel';

describe('CvPanel', () => {
  it('renders CV HTML content', () => {
    render(<CvPanel cvHtml="<h1>John Doe</h1><p>Software Engineer</p>" />);
    expect(screen.getByText('John Doe')).toBeInTheDocument();
    expect(screen.getByText('Software Engineer')).toBeInTheDocument();
  });

  it('renders within a 600px paper container', () => {
    const { container } = render(<CvPanel cvHtml="<p>test</p>" />);
    const paper = container.querySelector('.w-\\[600px\\]');
    expect(paper).toBeInTheDocument();
  });
});
```

**Test command:**

```bash
cd extension && pnpm test -- CvPanel
```

---

### Task 6: Build the `ChatPanel` component (right side — static UI shell)

**Files:**
- `extension/entrypoints/cv-preview/components/ChatPanel.tsx`
- `extension/entrypoints/cv-preview/components/ChatPanel.test.tsx`

**Steps:**
- [ ] Create ChatPanel with header, system message, sample AI message, and input area
- [ ] Write unit tests
- [ ] Commit

**Code — `extension/entrypoints/cv-preview/components/ChatPanel.tsx`:**

```tsx
import { Send, Sparkles, CheckCircle } from 'lucide-react';

export function ChatPanel() {
  return (
    <div className="flex w-[400px] shrink-0 flex-col border-l border-surface-200 bg-surface-50">
      {/* Chat header */}
      <div className="flex h-[52px] shrink-0 items-center gap-2.5 border-b border-surface-200 px-4">
        <div className="flex h-7 w-7 items-center justify-center rounded-full bg-accent-100">
          <Sparkles size={14} className="text-accent-600" />
        </div>
        <span className="font-body text-sm font-semibold text-surface-800">
          CV Assistant
        </span>
      </div>

      {/* Messages area */}
      <div className="flex-1 overflow-y-auto p-4">
        {/* System success message */}
        <div className="mb-4 flex items-start gap-2 rounded-md bg-success-50 p-3">
          <CheckCircle size={16} className="mt-0.5 shrink-0 text-success-700" />
          <p className="font-body text-xs text-success-700">
            Pipeline complete — your CV has been tailored to the job description.
            Ask me to make adjustments.
          </p>
        </div>

        {/* Sample AI message */}
        <div className="mb-4 max-w-[320px] rounded-lg border border-surface-200 bg-white p-3">
          <p className="font-body text-sm text-surface-700">
            Your CV is ready! I can help you adjust the wording, highlight
            specific skills, or restructure sections. What would you like to
            change?
          </p>
        </div>
      </div>

      {/* Chat input area */}
      <div className="shrink-0 border-t border-surface-200 p-3">
        <div className="flex items-center gap-2 rounded-md border border-surface-200 bg-white px-3 py-2">
          <input
            type="text"
            placeholder="Ask about your CV..."
            disabled
            className="flex-1 bg-transparent font-body text-sm text-surface-800 placeholder:text-surface-400 focus:outline-none disabled:cursor-not-allowed disabled:opacity-60"
          />
          <button
            type="button"
            disabled
            aria-label="Send message"
            className="flex h-7 w-7 items-center justify-center rounded bg-accent-400 text-white transition-colors disabled:cursor-not-allowed disabled:opacity-50"
          >
            <Send size={14} />
          </button>
        </div>
        <p className="mt-1.5 font-body text-2xs text-surface-400">
          Chat coming soon
        </p>
      </div>
    </div>
  );
}
```

**Code — `extension/entrypoints/cv-preview/components/ChatPanel.test.tsx`:**

```tsx
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ChatPanel } from './ChatPanel';

describe('ChatPanel', () => {
  it('renders the "CV Assistant" header', () => {
    render(<ChatPanel />);
    expect(screen.getByText('CV Assistant')).toBeInTheDocument();
  });

  it('renders the system success message', () => {
    render(<ChatPanel />);
    expect(
      screen.getByText(/pipeline complete/i),
    ).toBeInTheDocument();
  });

  it('renders a sample AI message', () => {
    render(<ChatPanel />);
    expect(screen.getByText(/your cv is ready/i)).toBeInTheDocument();
  });

  it('renders a disabled input with placeholder', () => {
    render(<ChatPanel />);
    const input = screen.getByPlaceholderText('Ask about your CV...');
    expect(input).toBeDisabled();
  });

  it('renders a disabled send button', () => {
    render(<ChatPanel />);
    const sendBtn = screen.getByRole('button', { name: /send message/i });
    expect(sendBtn).toBeDisabled();
  });

  it('shows "Chat coming soon" note', () => {
    render(<ChatPanel />);
    expect(screen.getByText('Chat coming soon')).toBeInTheDocument();
  });
});
```

**Test command:**

```bash
cd extension && pnpm test -- ChatPanel
```

---

### Task 7: Wire up `App.tsx` — compose full-page layout with all panels

**Files:**
- `extension/entrypoints/cv-preview/App.tsx` (rewrite from Task 2 skeleton)

**Steps:**
- [ ] Import and use `useCvPreviewData` hook
- [ ] Compose `PreviewTopBar`, `CvPanel`, `ChatPanel`
- [ ] Implement `handleDownload` — create blob download, then clear session and close tab
- [ ] Implement `handleCancel` — clear session and close tab
- [ ] Handle `loading` and `empty` states
- [ ] Commit

**Code — `extension/entrypoints/cv-preview/App.tsx`:**

```tsx
import { useCvPreviewData } from './hooks/useCvPreviewData';
import { PreviewTopBar } from './components/PreviewTopBar';
import { CvPanel } from './components/CvPanel';
import { ChatPanel } from './components/ChatPanel';
import { clearPipelineSession } from '../../services/storage';

export function App() {
  const previewState = useCvPreviewData();

  const closeAndClear = async () => {
    await clearPipelineSession();
    window.close();
  };

  const handleDownload = async () => {
    if (previewState.status !== 'ready') return;

    const blob = new Blob([previewState.data.finalCv], { type: 'text/html' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'tailored-cv.html';
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 5000);

    await closeAndClear();
  };

  const handleCancel = () => {
    closeAndClear();
  };

  if (previewState.status === 'loading') {
    return (
      <div className="flex h-screen items-center justify-center font-body text-md text-surface-500">
        Loading CV preview...
      </div>
    );
  }

  if (previewState.status === 'empty') {
    return (
      <div className="flex h-screen flex-col items-center justify-center gap-3 font-body">
        <p className="text-md text-surface-700">No CV data available</p>
        <p className="text-sm text-surface-500">
          The pipeline session may have been cleared or has not completed yet.
        </p>
        <button
          type="button"
          onClick={() => window.close()}
          className="mt-2 rounded bg-surface-900 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-surface-800"
        >
          Close tab
        </button>
      </div>
    );
  }

  const { data } = previewState;

  return (
    <div className="flex h-screen flex-col">
      <PreviewTopBar
        jobTitle={data.jobTitle}
        atsScore={data.atsScore}
        matchScore={data.matchScore}
        onDownload={handleDownload}
        onCancel={handleCancel}
      />
      <div className="flex flex-1 overflow-hidden">
        <CvPanel cvHtml={data.finalCv} />
        <ChatPanel />
      </div>
    </div>
  );
}
```

**Test:** Manual — run the full pipeline, then click "Preview CV" from the popup. Verify:
1. New tab opens with the top bar, CV on the left, chat shell on the right
2. Scores and job title display correctly
3. CV HTML renders inside the paper container
4. Download triggers file save, clears session, closes tab
5. Cancel clears session and closes tab

---

### Task 8: Update popup to open preview tab instead of downloading

**Files:**
- `extension/entrypoints/main-popup.content/App.tsx`
- `extension/entrypoints/main-popup.content/components/PipelineCompletePanel.tsx`
- `extension/entrypoints/main-popup.content/components/PipelineCompletePanel.test.tsx`

**Steps:**
- [ ] Change `handleReviewCv` in `App.tsx` to send `{ type: 'open-cv-preview' }` message and close the popup
- [ ] Rename button text from "Review CV" to "Preview CV" in PipelineCompletePanel
- [ ] Update the `Eye` icon to remain (or keep it — it fits "Preview" well)
- [ ] Update tests to match new button text
- [ ] Commit

**Code changes — `extension/entrypoints/main-popup.content/App.tsx`:**

Replace the `handleReviewCv` function (lines 134-143):

```typescript
const handleReviewCv = () => {
  if (!pipelineResults?.finalCv) return;
  browser.runtime.sendMessage({ type: 'open-cv-preview' });
  browser.runtime.sendMessage({ type: 'close-popup' });
};
```

**Code changes — `extension/entrypoints/main-popup.content/components/PipelineCompletePanel.tsx`:**

Change the button text from "Review CV" to "Preview CV" (line 66):

```tsx
<Eye size={16} strokeWidth={1.5} />
Preview CV
```

**Code changes — `extension/entrypoints/main-popup.content/components/PipelineCompletePanel.test.tsx`:**

Update the test on line 49 from `review cv` to `preview cv`:

```typescript
it('"Preview CV" button calls onReviewCv', async () => {
  const onReviewCv = vi.fn();
  render(<PipelineCompletePanel {...defaultProps} onReviewCv={onReviewCv} />);

  await userEvent.click(screen.getByRole('button', { name: /preview cv/i }));
  expect(onReviewCv).toHaveBeenCalledOnce();
});
```

**Test command:**

```bash
cd extension && pnpm test -- PipelineCompletePanel
```

---

### Task 9: Update Tailwind content paths to include cv-preview entrypoint

**Files:**
- `extension/tailwind.config.ts`

**Steps:**
- [ ] Verify that `./entrypoints/**/*.{ts,tsx}` already covers `cv-preview/` (it does, since `cv-preview/` is under `entrypoints/`)
- [ ] No change needed — this is a verification step
- [ ] Commit (if any adjustment was needed)

**Verification:** The existing content path `"./entrypoints/**/*.{ts,tsx}"` already matches `./entrypoints/cv-preview/**/*.{ts,tsx}`. No change needed.

---

### Task 10: Final integration test and cleanup

**Steps:**
- [ ] Run the full test suite: `cd extension && pnpm test`
- [ ] Run `pnpm dev` and verify end-to-end flow:
  1. Complete the pipeline (all 4 agents)
  2. Click "Preview CV" in the popup
  3. New tab opens with the full-page CV preview
  4. Top bar shows correct job title, ATS score, Match score
  5. CV renders in the left panel inside the paper container
  6. Chat panel shows on the right with disabled input
  7. Click Download — file downloads, session clears, tab closes
  8. Click Cancel — session clears, tab closes, popup returns to initial state
- [ ] Verify no console errors in the extension page
- [ ] Commit final cleanup (if any)

**Test command:**

```bash
cd extension && pnpm test
```

**Expected:** All tests pass, including new tests for `useCvPreviewData`, `PreviewTopBar`, `CvPanel`, `ChatPanel`, and updated `PipelineCompletePanel`.

---

## File Summary

| File | Action | Task |
|---|---|---|
| `extension/types/messages.ts` | Edit | 1 |
| `extension/entrypoints/background.ts` | Edit | 1 |
| `extension/entrypoints/cv-preview/index.html` | Create | 2 |
| `extension/entrypoints/cv-preview/main.tsx` | Create | 2 |
| `extension/entrypoints/cv-preview/cv-preview.css` | Create | 2 |
| `extension/entrypoints/cv-preview/App.tsx` | Create (skeleton), Rewrite (Task 7) | 2, 7 |
| `extension/entrypoints/cv-preview/hooks/useCvPreviewData.ts` | Create | 3 |
| `extension/entrypoints/cv-preview/hooks/useCvPreviewData.test.ts` | Create | 3 |
| `extension/entrypoints/cv-preview/components/PreviewTopBar.tsx` | Create | 4 |
| `extension/entrypoints/cv-preview/components/PreviewTopBar.test.tsx` | Create | 4 |
| `extension/entrypoints/cv-preview/components/CvPanel.tsx` | Create | 5 |
| `extension/entrypoints/cv-preview/components/CvPanel.test.tsx` | Create | 5 |
| `extension/entrypoints/cv-preview/components/ChatPanel.tsx` | Create | 6 |
| `extension/entrypoints/cv-preview/components/ChatPanel.test.tsx` | Create | 6 |
| `extension/entrypoints/main-popup.content/App.tsx` | Edit | 8 |
| `extension/entrypoints/main-popup.content/components/PipelineCompletePanel.tsx` | Edit | 8 |
| `extension/entrypoints/main-popup.content/components/PipelineCompletePanel.test.tsx` | Edit | 8 |

## Rule Compliance Checklist

| Rule | Status |
|---|---|
| Single responsibility per component | Pass — each component is small and focused |
| Max 300 lines per file | Pass — all files are well under 300 lines |
| Use `browser.*` not `chrome.*` | Pass — all API calls use `browser.*` |
| TypeScript strict mode | Pass — all types explicitly defined |
| No hardcoded API keys | Pass — no keys involved |
| Minimal permissions | Pass — uses existing `tabs` + `storage` permissions, no new ones needed |
| No `eval` or `innerHTML` | Note — `dangerouslySetInnerHTML` used for trusted server output in extension page context (not content script), documented justification above |
| No premature abstraction | Pass — no shared Button/Layout abstractions created |
| Small focused hooks | Pass — one hook (`useCvPreviewData`) doing one thing |
| Shared code in correct locations | Pass — reuses `LogoIcon`, `ErrorBoundary`, storage services |
| State persistence | Pass — reads from `session:pipelineSession` WXT storage |
