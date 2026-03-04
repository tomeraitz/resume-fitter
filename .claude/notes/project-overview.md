# CV Fitter Chrome Extension - Project Overview

## Main Goal

Build a Chrome extension that automates the `/create-cv` skill workflow as a standalone product.
The extension runs a multi-agent pipeline (inspired by Claude Code's agent architecture) to generate
a tailored, ATS-optimized CV for any job posting the user is browsing.

---

## Core Workflow (4-Step Agent Pipeline)

Each step is an **isolated Claude API call** (split context - agents don't share conversation history):

```
User visits job posting
        ↓
[Agent 1] Hiring Manager Reviewer
  - Compares job description vs CV template + professional history
  - Outputs: match score (0-100) + top 5 missing keywords
        ↓
[Agent 2] Rewrite Resume
  - Takes missing keywords, rewrites CV naturally
  - Uses Google X-Y-Z formula for achievements
  - Outputs: updated CV HTML
        ↓
[Agent 3] ATS Scanner
  - Scans updated CV as an ATS bot would
  - Outputs: ATS compatibility score + problem areas
        ↓
[Agent 4] Accuracy Verifier
  - Cross-checks against professional history
  - Flags any fabricated or unsupported claims
        ↓
Final CV saved / displayed to user
```

---

## Tech Stack

| Layer | Choice | Reason |
|---|---|---|
| Extension framework | **WXT** | Vite-based, TypeScript-first, auto manifest generation |
| UI | React + TypeScript | Familiar, works inside WXT |
| UI surface | Injected overlay (content script UI) | Floating popup rendered directly on the page |
| Agent orchestration | Background Service Worker | Persistent across page navigations |
| LLM calls | **Vercel AI SDK** on backend (Node.js) | Unified interface for Claude, OpenAI, Gemini, Ollama (local) |
| API key storage | Server environment variable | Never exposed to client |
| Auth | Session token (short-lived JWT) | Extension authenticates to backend, not to Claude directly |
| Job desc capture | Content Script | Auto-reads from LinkedIn, Greenhouse, etc. |
| CV/history storage | `chrome.storage.local` | Safe for non-sensitive data (CV template, history) |

---

## Architecture

```
┌──────────────────────────────────────────────┐
│              Chrome Browser                  │
│                                              │
│  Content Script (content.ts)                 │
│  └── Scrapes job description from page       │
│      (LinkedIn, Greenhouse, Glassdoor...)    │
│                                              │
│  Background Service Worker (background.ts)   │
│  └── Orchestrates messages to backend        │
│      └── fetch() → Backend Server           │
│                                              │
│  Injected Overlay (content script UI)        │
│  └── Floating React app in Shadow DOM        │
│      Chat UI: agent progress + CV output     │
│      (renders on top of the job posting)     │
└──────────────────────────────────────────────┘
        ↕ HTTPS + session token
┌──────────────────────────────────────────────┐
│           Backend Server (Node.js)           │
│                                              │
│  API key stored in env vars                  │
│  └── Orchestrates the 4-agent pipeline       │
│      └── Vercel AI SDK → any LLM provider   │
│          (Claude / OpenAI / Gemini / Ollama) │
└──────────────────────────────────────────────┘
```

### Split Context Pattern (like Claude Code sub-agents)

Each agent is a **separate, fresh API call** - no shared history between agents:

```
Orchestrator (your TS code, not Claude)
  → API call #1: hiring-manager-reviewer  (system prompt + job desc + CV)
  → API call #2: rewrite-resume           (system prompt + keywords only)
  → API call #3: ats-scanner              (system prompt + new CV only)
  → API call #4: verifier                 (system prompt + new CV + history)
```

---

## Key Design Decisions

- **Backend server required** - API key lives in server env vars, never sent to browser
- **Extension only holds a session token** - short-lived, scoped, not the actual Claude API key
- **Vercel AI SDK on backend** - unified provider interface; swap between Claude, OpenAI, Gemini, or local Ollama models via a single env var (`MODEL_PROVIDER`)
- **Split context** - each agent gets only what it needs, prevents context bloat
- **Content script** - auto-captures job description so user doesn't paste manually
- **Injected overlay** - floating React app rendered directly on the job posting page, isolated in Shadow DOM so the page's CSS doesn't bleed in

## API Key Security - Why `chrome.storage.local` is NOT safe for secrets

| Storage | Risk |
|---|---|
| `chrome.storage.local` | Readable by any JS in the extension context, visible in DevTools |
| `chrome.storage.session` | Cleared on browser close, but still readable in DevTools during session |
| JS memory only | Gone on service worker restart (Chrome kills SW after ~30s idle) |
| **Backend env var** | Never reaches the browser - safest option |

---

## Project Source

Skill definition: `.claude/skills/create-cv/SKILL.md`
Agent definitions: `.claude/agents/`
CV template: `.claude/templates/ai-engineer-cv-temp.html`
Professional history: `.claude/tomer-docs/tomer-history.md`
