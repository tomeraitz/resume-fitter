# State Management Plan

> Branch: `client-state-management`

---

## Overview

Two layers of state, separated by lifecycle:

| Layer | Storage | Survives | Cleared when |
|---|---|---|---|
| **User Profile** (persistent) | `browser.storage.local` via WXT `storage.defineItem<T>()` | Browser close, extension reload | User explicitly deletes profile |
| **Pipeline Session** (transient) | `browser.storage.session` via WXT `storage.defineItem<T>()` | Page navigation, SW restart | User cancels, downloads CV, or starts new pipeline |

**Why not React state / in-memory?** Background SW terminates after ~5 min idle (MV3). All state must survive SW restarts. `browser.storage.session` is the correct choice for transient data — it persists across SW restarts but clears on browser close.

**Important:** `browser.storage.session` is only accessible from the background SW by default. The background script must call `setAccessLevel` at startup to allow content scripts to read/write session storage (see Background SW section below).

---

## State Shape

### 1. User Profile (Persistent) — `browser.storage.local`

```ts
// extension/types/storage.ts

interface UserProfile {
  cvTemplate: string;           // Base CV HTML template
  professionalHistory: string;  // Markdown — full work history
  displayName?: string;         // Optional user name for UI
}
```

**Storage keys:**

```ts
// extension/services/storage.service.ts
import { storage } from 'wxt/storage';

export const userProfile = storage.defineItem<UserProfile>('local:userProfile', {
  fallback: {
    cvTemplate: '',
    professionalHistory: '',
  },
});
```

**Lifecycle:** Set once during onboarding / profile setup. Never cleared by pipeline actions.

---

### 2. Pipeline Session (Transient) — `browser.storage.session`

```ts
// extension/types/pipeline.ts

type PipelineStatus = 'idle' | 'running' | 'completed' | 'error';

type AgentStep = 'hiring-manager' | 'rewrite-resume' | 'ats-scanner' | 'verifier';

type StepStatus = 'pending' | 'running' | 'completed' | 'error';

// Discriminated union — each agent step has a typed result shape
type AgentResultData =
  | { step: 'hiring-manager'; matchScore: number; keywords: string[] }
  | { step: 'rewrite-resume'; rewrittenCv: string }
  | { step: 'ats-scanner'; atsScore: number; issues: string[] }
  | { step: 'verifier'; flaggedClaims: string[]; verified: boolean };

interface AgentResult {
  step: AgentStep;
  status: StepStatus;
  data?: AgentResultData;
  error?: string;
}

// Steps stored as a Record for type-safe lookups (no index-based access)
type StepsRecord = Record<AgentStep, AgentResult>;

interface PipelineSession {
  status: PipelineStatus;
  jobDescription: string;       // Scraped from page
  jobTitle?: string;            // Extracted title
  jobCompany?: string;          // Extracted company
  steps: StepsRecord;           // Progress of each agent
  generatedCv: string | null;   // Final CV HTML — null until pipeline completes
}
```

**Design decisions:**
- `steps` is `Record<AgentStep, AgentResult>` instead of an array — eliminates `findIndex` and makes lookups type-safe.
- Per-step scores (`matchScore`, `atsScore`, `flaggedClaims`) live only inside `steps[].data` — no top-level duplicates. UI derives these via selectors.
- `cancelled` status removed — `clearPipelineSession()` resets directly to `idle`.

**Storage keys:**

```ts
// extension/services/storage.service.ts

const EMPTY_STEPS: StepsRecord = {
  'hiring-manager': { step: 'hiring-manager', status: 'pending' },
  'rewrite-resume': { step: 'rewrite-resume', status: 'pending' },
  'ats-scanner': { step: 'ats-scanner', status: 'pending' },
  'verifier': { step: 'verifier', status: 'pending' },
};

export const pipelineSession = storage.defineItem<PipelineSession>('session:pipelineSession', {
  fallback: {
    status: 'idle',
    jobDescription: '',
    steps: EMPTY_STEPS,
    generatedCv: null,
  },
});
```

**Lifecycle:** Created when pipeline starts. Cleared on cancel or download.

---

## State Transitions

```
                    ┌──────────────────────────────────────────┐
                    │           User Profile                    │
                    │  (browser.storage.local — persistent)     │
                    │                                           │
                    │  cvTemplate: string                       │
                    │  professionalHistory: string              │
                    │                                           │
                    │  ✓ Survives cancel / download             │
                    │  ✓ Survives browser restart               │
                    └──────────────────────────────────────────┘

┌──────────┐   start    ┌──────────┐  step done  ┌───────────┐
│   idle   │ ────────→  │ running  │ ──────────→ │ completed │
└──────────┘            └──────────┘             └───────────┘
     ↑                      │                        │
     │                      │ error                  │ cancel / download
     │                      ▼                        ▼
     │                 ┌──────────┐            ┌──────────┐
     │                 │  error   │            │  idle    │
     │                 └──────────┘            └──────────┘
     │                      │                        │
     │       retry          │     cancel             │
     └──────────────────────┴────────────────────────┘

On CANCEL or DOWNLOAD:
  → pipelineSession.setValue(EMPTY_SESSION)
  → userProfile stays UNTOUCHED
```

---

## Storage Service — File Breakdown

Each concern lives in its own file under `extension/services/storage/`.

---

### File 1: `extension/services/storage/profile.storage.ts`

Persistent user profile — never cleared by pipeline actions.

```ts
import { storage } from 'wxt/storage';
import type { UserProfile } from '../../types/storage';

export const userProfile = storage.defineItem<UserProfile>('local:userProfile', {
  fallback: {
    cvTemplate: '',
    professionalHistory: '',
  },
});
```

---

### File 2: `extension/services/storage/pipeline.storage.ts`

Transient pipeline session — cleared on cancel, download, or browser close.

```ts
import { storage } from 'wxt/storage';
import type { PipelineSession, StepsRecord } from '../../types/pipeline';

const EMPTY_STEPS: StepsRecord = {
  'hiring-manager': { step: 'hiring-manager', status: 'pending' },
  'rewrite-resume': { step: 'rewrite-resume', status: 'pending' },
  'ats-scanner': { step: 'ats-scanner', status: 'pending' },
  'verifier': { step: 'verifier', status: 'pending' },
};

export const EMPTY_SESSION: PipelineSession = {
  status: 'idle',
  jobDescription: '',
  steps: EMPTY_STEPS,
  generatedCv: null,
};

export const pipelineSession = storage.defineItem<PipelineSession>(
  'session:pipelineSession',
  { fallback: EMPTY_SESSION },
);
```

---

### File 3: `extension/services/storage/pipeline.actions.ts`

Mutation helpers for the pipeline session. Used by the background SW.

All mutations go through `mutatePipelineSession` to centralize the read-modify-write pattern and make it easy to add a lock if concurrent writes become an issue.

```ts
import type { AgentStep, StepStatus, AgentResultData, PipelineSession } from '../../types/pipeline';
import { pipelineSession, EMPTY_SESSION } from './pipeline.storage';

// Centralized read-modify-write helper.
// Storage APIs don't offer transactions, but funneling all mutations
// through a single function makes it easy to add a mutex later.
async function mutatePipelineSession(
  mutator: (session: PipelineSession) => PipelineSession,
): Promise<void> {
  const session = await pipelineSession.getValue();
  await pipelineSession.setValue(mutator(session));
}

export async function clearPipelineSession(): Promise<void> {
  await pipelineSession.setValue(EMPTY_SESSION);
}

export async function updateStepResult(
  step: AgentStep,
  status: StepStatus,
  data?: AgentResultData,
): Promise<void> {
  await mutatePipelineSession((session) => ({
    ...session,
    steps: {
      ...session.steps,
      [step]: { step, status, data },
    },
  }));
}

export async function setPipelineStatus(
  status: PipelineSession['status'],
): Promise<void> {
  await mutatePipelineSession((session) => ({
    ...session,
    status,
  }));
}

export async function setGeneratedCv(cv: string): Promise<void> {
  await mutatePipelineSession((session) => ({
    ...session,
    generatedCv: cv,
    status: 'completed',
  }));
}
```

---

### File 4: `extension/services/storage/index.ts`

Barrel export — single import point for all consumers.

```ts
export { userProfile } from './profile.storage';
export { pipelineSession, EMPTY_SESSION } from './pipeline.storage';
export {
  clearPipelineSession,
  updateStepResult,
  setPipelineStatus,
  setGeneratedCv,
} from './pipeline.actions';
```

---

### File 5: `extension/entrypoints/content/overlay/hooks/useUserProfile.ts`

Reactive hook for reading the persistent user profile.

Handles the async `watch()` return correctly and avoids the race condition between `getValue()` and `watch()`.

```ts
import { useEffect, useState } from 'react';
import { userProfile } from '../../../../services/storage';
import type { UserProfile } from '../../../../types/storage';

export function useUserProfile() {
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let initialized = false;

    // watch() is the authoritative source — if it fires before
    // getValue() resolves, it has the newer value.
    const unwatchPromise = userProfile.watch((newVal) => {
      initialized = true;
      setProfile(newVal);
      setIsLoading(false);
    });

    userProfile.getValue().then((val) => {
      if (!initialized) {
        setProfile(val);
        setIsLoading(false);
      }
    });

    return () => {
      // watch() returns Promise<() => void> — must unwrap before calling
      unwatchPromise.then((unwatch) => unwatch());
    };
  }, []);

  return { profile, isLoading };
}
```

---

### File 6: `extension/entrypoints/content/overlay/hooks/usePipelineSession.ts`

Reactive hook for pipeline state + cancel/download actions.

```ts
import { useEffect, useState } from 'react';
import { pipelineSession, clearPipelineSession } from '../../../../services/storage';
import type { PipelineSession } from '../../../../types/pipeline';

export function usePipelineSession() {
  const [session, setSession] = useState<PipelineSession | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let initialized = false;

    const unwatchPromise = pipelineSession.watch((newVal) => {
      initialized = true;
      setSession(newVal);
      setIsLoading(false);
    });

    pipelineSession.getValue().then((val) => {
      if (!initialized) {
        setSession(val);
        setIsLoading(false);
      }
    });

    return () => {
      unwatchPromise.then((unwatch) => unwatch());
    };
  }, []);

  const cancel = async () => {
    await clearPipelineSession();
  };

  // Read directly from storage to avoid stale closures
  const download = async () => {
    const current = await pipelineSession.getValue();
    if (current?.generatedCv) {
      // Download logic handled by caller — returns the CV HTML
      await clearPipelineSession();
      return current.generatedCv;
    }
    return null;
  };

  return { session, isLoading, cancel, download };
}
```

---

### Background SW Usage: `extension/entrypoints/background.ts`

Shows how background imports from the split files and enables session storage access for content scripts.

```ts
import { userProfile } from '../services/storage';
import {
  pipelineSession,
  EMPTY_SESSION,
  updateStepResult,
  setPipelineStatus,
  setGeneratedCv,
} from '../services/storage';

export default defineBackground(() => {
  // Allow content scripts to read/write browser.storage.session.
  // Without this, all content script reads of pipelineSession will fail.
  browser.storage.session.setAccessLevel({
    accessLevel: 'TRUSTED_AND_UNTRUSTED_CONTEXTS',
  });
});

async function handleRunPipeline(jobDescription: string) {
  const profile = await userProfile.getValue();

  await pipelineSession.setValue({
    status: 'running',
    jobDescription,
    steps: {
      'hiring-manager': { step: 'hiring-manager', status: 'pending' },
      'rewrite-resume': { step: 'rewrite-resume', status: 'pending' },
      'ats-scanner': { step: 'ats-scanner', status: 'pending' },
      'verifier': { step: 'verifier', status: 'pending' },
    },
    generatedCv: null,
  });

  // POST to backend with profile.cvTemplate + profile.professionalHistory + jobDescription
  // Update steps as backend responds...
}
```

---

## Messaging Interface

The content script triggers the pipeline via WXT's extension messaging.

```ts
// extension/types/messages.ts

interface RunPipelineMessage {
  type: 'run-pipeline';
  jobDescription: string;
  jobTitle?: string;
  jobCompany?: string;
}

interface CancelPipelineMessage {
  type: 'cancel-pipeline';
}

type ExtensionMessage = RunPipelineMessage | CancelPipelineMessage;
```

The background SW registers a listener:

```ts
// In extension/entrypoints/background.ts

browser.runtime.onMessage.addListener((message: ExtensionMessage) => {
  switch (message.type) {
    case 'run-pipeline':
      handleRunPipeline(message.jobDescription);
      return;
    case 'cancel-pipeline':
      clearPipelineSession();
      return;
  }
});
```

The content script sends messages:

```ts
// From content script overlay
await browser.runtime.sendMessage({ type: 'run-pipeline', jobDescription });
```

---

## What Gets Cleared vs. What Stays

| Action | `userProfile` (local) | `pipelineSession` (session) |
|---|---|---|
| **Cancel pipeline** | Untouched | Reset to idle/empty |
| **Download CV** | Untouched | Reset to idle/empty |
| **Pipeline error** | Untouched | `status: 'error'`, steps preserved for retry |
| **Start new pipeline** | Untouched | Overwritten with new session |
| **Browser close** | Untouched | Auto-cleared by `browser.storage.session` |
| **Extension reload** | Untouched | Auto-cleared by `browser.storage.session` |
| **User edits profile** | Updated | Untouched |

---

## File Structure

```
extension/
├── types/
│   ├── storage.ts                          # UserProfile interface
│   ├── pipeline.ts                         # PipelineSession, AgentStep, StepStatus,
│   │                                       # AgentResult, AgentResultData, StepsRecord
│   └── messages.ts                         # ExtensionMessage types
│
├── services/
│   └── storage/
│       ├── index.ts                        # Barrel export (single import point)
│       ├── profile.storage.ts              # userProfile defineItem (persistent)
│       ├── pipeline.storage.ts             # pipelineSession defineItem + EMPTY_SESSION (transient)
│       └── pipeline.actions.ts             # clearPipelineSession, updateStepResult,
│                                           # setPipelineStatus, setGeneratedCv
│
└── entrypoints/
    ├── background.ts                       # setAccessLevel + message listener + pipeline runner
    └── content/
        └── overlay/
            └── hooks/
                ├── useUserProfile.ts       # Reactive read of persistent profile
                └── usePipelineSession.ts   # Reactive read + cancel/download actions
```

---

## Rules Compliance

| Rule (wxt-react-rules.md) | How this plan complies |
|---|---|
| State persistence — no in-memory state in SW | All state in `browser.storage.local` or `browser.storage.session` |
| Use `browser.*` not `chrome.*` | WXT `storage` API handles this internally; docs reference `browser.*` |
| Max 300 lines per file | Each storage file ~15-30 lines, each hook ~30 lines |
| Single responsibility | `profile.storage` = profile persistence, `pipeline.storage` = session persistence, `pipeline.actions` = mutations, hooks = reactive UI binding |
| No premature abstraction | Two hooks, one service — no extra layers |
| TypeScript strict | All types explicitly defined with discriminated unions — no `unknown` |
| Session storage access | `setAccessLevel` called in background `defineBackground()` |
