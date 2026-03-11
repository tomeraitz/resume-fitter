# State Management Plan

> Branch: `client-state-management`

---

## Overview

Two layers of state, separated by lifecycle:

| Layer | Storage | Survives | Cleared when |
|---|---|---|---|
| **User Profile** (persistent) | `chrome.storage.local` via WXT `storage.defineItem<T>()` | Browser close, extension reload | User explicitly deletes profile |
| **Pipeline Session** (transient) | `chrome.storage.session` via WXT `storage.defineItem<T>()` | Page navigation, SW restart | User cancels, downloads CV, or starts new pipeline |

**Why not React state / in-memory?** Background SW terminates after ~5 min idle (MV3). All state must survive SW restarts. `chrome.storage.session` is the correct choice for transient data — it persists across SW restarts but clears on browser close.

---

## State Shape

### 1. User Profile (Persistent) — `chrome.storage.local`

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

### 2. Pipeline Session (Transient) — `chrome.storage.session`

```ts
// extension/types/pipeline.ts

type PipelineStatus = 'idle' | 'running' | 'completed' | 'error' | 'cancelled';

type AgentStep = 'hiring-manager' | 'rewrite-resume' | 'ats-scanner' | 'verifier';

type StepStatus = 'pending' | 'running' | 'completed' | 'error';

interface AgentResult {
  step: AgentStep;
  status: StepStatus;
  data?: unknown;           // Step-specific output (match score, keywords, ATS score, etc.)
  error?: string;
}

interface PipelineSession {
  status: PipelineStatus;
  jobDescription: string;       // Scraped from page
  jobTitle?: string;            // Extracted title
  jobCompany?: string;          // Extracted company
  steps: AgentResult[];         // Progress of each agent (4 items)
  generatedCv: string | null;   // Final CV HTML — null until pipeline completes
  matchScore?: number;          // From agent 1
  atsScore?: number;            // From agent 3
  flaggedClaims?: string[];     // From agent 4
}
```

**Storage keys:**

```ts
// extension/services/storage.service.ts

export const pipelineSession = storage.defineItem<PipelineSession>('session:pipelineSession', {
  fallback: {
    status: 'idle',
    jobDescription: '',
    steps: [],
    generatedCv: null,
  },
});
```

**Lifecycle:** Created when pipeline starts. Cleared on cancel or download.

---

## State Transitions

```
                    ┌─────────────────────────────────────┐
                    │           User Profile              │
                    │  (chrome.storage.local — persistent) │
                    │                                     │
                    │  cvTemplate: string                 │
                    │  professionalHistory: string        │
                    │                                     │
                    │  ✓ Survives cancel / download       │
                    │  ✓ Survives browser restart         │
                    └─────────────────────────────────────┘

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
  → pipelineSession.setValue({ status: 'idle', jobDescription: '', steps: [], generatedCv: null })
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
import type { PipelineSession } from '../../types/pipeline';

export const EMPTY_SESSION: PipelineSession = {
  status: 'idle',
  jobDescription: '',
  steps: [],
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

```ts
import type { AgentStep, StepStatus } from '../../types/pipeline';
import { pipelineSession, EMPTY_SESSION } from './pipeline.storage';

export async function clearPipelineSession(): Promise<void> {
  await pipelineSession.setValue(EMPTY_SESSION);
}

export async function updateStepResult(
  step: AgentStep,
  status: StepStatus,
  data?: unknown,
): Promise<void> {
  const session = await pipelineSession.getValue();
  const idx = session.steps.findIndex((s) => s.step === step);
  const updated = { step, status, data };
  if (idx >= 0) {
    session.steps[idx] = updated;
  } else {
    session.steps.push(updated);
  }
  await pipelineSession.setValue(session);
}

export async function setPipelineStatus(
  status: PipelineSession['status'],
): Promise<void> {
  const session = await pipelineSession.getValue();
  session.status = status;
  await pipelineSession.setValue(session);
}

export async function setGeneratedCv(cv: string): Promise<void> {
  const session = await pipelineSession.getValue();
  session.generatedCv = cv;
  session.status = 'completed';
  await pipelineSession.setValue(session);
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

```ts
import { useEffect, useState } from 'react';
import { userProfile } from '../../../../services/storage';
import type { UserProfile } from '../../../../types/storage';

export function useUserProfile() {
  const [profile, setProfile] = useState<UserProfile | null>(null);

  useEffect(() => {
    userProfile.getValue().then(setProfile);

    const unwatch = userProfile.watch((newVal) => {
      setProfile(newVal);
    });

    return () => unwatch();
  }, []);

  return profile;
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

  useEffect(() => {
    pipelineSession.getValue().then(setSession);

    const unwatch = pipelineSession.watch((newVal) => {
      setSession(newVal);
    });

    return () => unwatch();
  }, []);

  const cancel = async () => {
    await clearPipelineSession();
  };

  const download = async () => {
    if (session?.generatedCv) {
      // Download logic handled by caller
      await clearPipelineSession();
    }
  };

  return { session, cancel, download };
}
```

---

### Background SW Usage: `extension/entrypoints/background.ts`

Shows how background imports from the split files.

```ts
import { userProfile } from '../services/storage';
import {
  pipelineSession,
  updateStepResult,
  setPipelineStatus,
  setGeneratedCv,
} from '../services/storage';

async function handleRunPipeline(jobDescription: string) {
  const profile = await userProfile.getValue();

  await pipelineSession.setValue({
    status: 'running',
    jobDescription,
    steps: [
      { step: 'hiring-manager', status: 'pending' },
      { step: 'rewrite-resume', status: 'pending' },
      { step: 'ats-scanner', status: 'pending' },
      { step: 'verifier', status: 'pending' },
    ],
    generatedCv: null,
  });

  // POST to backend with profile.cvTemplate + profile.professionalHistory + jobDescription
  // Update steps as backend responds...
}
```

---

## What Gets Cleared vs. What Stays

| Action | `userProfile` (local) | `pipelineSession` (session) |
|---|---|---|
| **Cancel pipeline** | Untouched | Reset to idle/empty |
| **Download CV** | Untouched | Reset to idle/empty |
| **Pipeline error** | Untouched | `status: 'error'`, steps preserved for retry |
| **Start new pipeline** | Untouched | Overwritten with new session |
| **Browser close** | Untouched | Auto-cleared by `chrome.storage.session` |
| **Extension reload** | Untouched | Auto-cleared by `chrome.storage.session` |
| **User edits profile** | Updated | Untouched |

---

## File Structure

```
extension/
├── types/
│   ├── storage.ts                          # UserProfile interface
│   └── pipeline.ts                         # PipelineSession, AgentStep, StepStatus, AgentResult
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
    ├── background.ts                       # Reads userProfile, writes pipelineSession
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
| State persistence — no in-memory state in SW | All state in `chrome.storage.local` or `chrome.storage.session` |
| Use `browser.*` not `chrome.*` | WXT `storage` API handles this internally |
| Max 300 lines per file | Each storage file ~15-30 lines, each hook ~30 lines |
| Single responsibility | `profile.storage` = profile persistence, `pipeline.storage` = session persistence, `pipeline.actions` = mutations, hooks = reactive UI binding |
| No premature abstraction | Two hooks, one service — no extra layers |
| TypeScript strict | All types explicitly defined |
