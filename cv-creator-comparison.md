# cv-creator skill vs resume-fitter: Codebase Comparison

## 1. cv-creator skill (`create-cv`)

### Purpose
A Claude Code skill (SKILL.md prompt) that orchestrates Claude sub-agents to tailor a CV for a specific job. It is a **CLI-native workflow** — runs entirely inside Claude Code sessions, reads local files on disk, and writes output HTML to `new-cvs/<position-name>.html`.

### Tech Stack
- Single markdown skill file (`SKILL.md`) — no code, no server
- Claude sub-agents defined as `.claude/agents/*.md` files
- Reads local templates: `.claude/templates/ai-engineer-cv-temp.html`
- Reads candidate history: `.claude/tomer-docs/tomer-history.md`
- Output written directly to local filesystem

### Agent Pipeline
| Step | Sub-agent | Task |
|------|-----------|------|
| 1 | `hiring-manager-reviewer` | Compare JD vs CV template + history; return match score (0-100) + top 5 missing keywords |
| 2 | `rewrite-resume` | Rewrite CV using missing keywords; use XYZ formula for achievements; save HTML |
| 3 | `application-tracking-system` | Scan updated CV for ATS parsing problems; return recommendations |
| 4 | (inline) | Re-read tomer-history + template to verify no fabrication; flag discrepancies |

### Input / Output
- **Input**: Position title (skill arg) + job description (user pastes when prompted)
- **Output**: HTML file at `new-cvs/<position-name>.html` + console summary

### Key Files
- `.claude/skills/create-cv/SKILL.md` — entire workflow definition
- `.claude/agents/hiring-manager-reviewer.md` — step 1 agent prompt
- `.claude/agents/rewrite-resume.md` — step 2 agent prompt
- `.claude/agents/application-tracking-system.md` — step 3 agent prompt
- `.claude/templates/ai-engineer-cv-temp.html` — source CV template (hardcoded to Tomer)
- `.claude/tomer-docs/tomer-history.md` — candidate history (hardcoded to Tomer)

---

## 2. resume-fitter

### Purpose
A **Chrome extension + Node.js backend** product that lets any user paste their CV (or upload a PDF), submit a job description, and receive a tailored, ATS-optimised CV back — all through a browser UI. It is a **multi-user, API-driven product** generalised for any candidate.

### Tech Stack
**Server** (`server/`):
- Node.js + Express 5 (TypeScript, ESM)
- Vercel AI SDK (`ai` + `@ai-sdk/anthropic`, `@ai-sdk/google`, `@ai-sdk/openai`)
- Zod for schema validation
- MuPDF + Python script (`convert_pdf.py`) for PDF-to-HTML conversion
- JWT auth + rate limiting
- SSE (Server-Sent Events) for streaming pipeline progress
- Vitest for tests (including prompt eval tests)
- Docker support

**Extension** (`extension/`):
- WXT (Chrome MV3) + React 19 + TypeScript
- Tailwind CSS
- `lucide-react` icons, `jose` for JWT
- Content script popup injected into job listing pages
- Background service worker with keep-alive for MV3

### Agent Pipeline
Orchestrated in `server/src/agents/orchestrator.ts` via TypeScript functions (not sub-agents):

| Step | Agent module | Task | Output schema |
|------|-------------|------|---------------|
| 1 | `hiring-manager.ts` | Analyse JD vs CV; return `missingKeywords[]`, `rewriteInstructions`, `cvLanguage`, match score | Zod-validated JSON |
| 2 | `rewrite-resume.ts` | Rewrite CV HTML using keywords + instructions; handle absolute-positioned PDF-converted HTML | `{ updatedCvHtml, keywordsNotAdded[] }` |
| 3 | `verifier.ts` | Cross-check rewritten CV against candidate history; flag fabrications; produce final clean HTML | `{ verifiedCv, flaggedClaims[] }` |
| 4 | `ats-scanner.ts` | Score ATS compatibility (0-100); list specific parsing problems | `{ atsScore, problemAreas[] }` |

Additional agents:
- `job-extractor.ts` — extracts structured job details from raw page HTML (used by extension content script)
- `cv-chat.ts` — conversational CV editor; applies user edits to live CV HTML without structural changes

### Input / Output
- **Input**: CV as HTML string (or PDF uploaded and converted to HTML), job description text, optional candidate history string
- **Output**: Final rewritten CV HTML (`finalCv`), ATS score, flagged claims, per-step SSE events streamed to client

### Routes
| Route | Purpose |
|-------|---------|
| `POST /pipeline` | Main 4-step pipeline, SSE streaming |
| `POST /chat` | Conversational CV editing |
| `POST /extract` | Job description extraction from page HTML |
| `POST /pdf-to-html` | PDF upload → HTML conversion via MuPDF |

### Key Files
- `server/src/agents/orchestrator.ts` — pipeline runner
- `server/src/routes/pipeline.ts` — SSE endpoint, auth, rate limit
- `server/src/services/model.service.ts` — model abstraction (Anthropic/Google/OpenAI/Ollama)
- `server/src/prompts/*.md` — one prompt file per agent
- `server/convert_pdf.py` — PDF-to-HTML via Python/MuPDF
- `extension/src/` — WXT popup, content script, background worker

---

## 3. Structured Comparison

### Overlapping Functionality
| Feature | cv-creator skill | resume-fitter |
|---------|-----------------|---------------|
| Hiring manager analysis (JD vs CV, missing keywords) | Yes (step 1) | Yes (step 1) |
| CV rewriting with keywords | Yes (step 2) | Yes (step 2) |
| ATS compatibility scan | Yes (step 3) | Yes (step 4) |
| Accuracy / hallucination check | Yes (step 4, file-based) | Yes (step 3, history-param-based) |
| Output format | HTML file | HTML string via API |
| No fabrication rule | Yes (explicit rule) | Yes (explicit rule) |

The **core 4-step pipeline logic is identical in intent**: hiring-manager → rewrite → verify → ATS scan. The prompt philosophy (XYZ formula, no fabrication, preserve HTML structure, keyword integration) is shared.

### What cv-creator skill Does That resume-fitter Does Not
- Runs entirely inside Claude Code — no server, no deployment required
- Reads CV template and history from local files on disk (hardcoded paths)
- Produces a saved `.html` file directly to filesystem
- Has a `cv-researcher` sub-agent (likely for researching the target company/role)
- Has mock test fixtures (`/mock/tomer`, `/mock/lilach` with real PDFs + config)
- Hardcoded to a single candidate (Tomer); simpler to use for personal automation

### What resume-fitter Does That cv-creator skill Does Not
- Multi-user product: candidate history and CV passed as API parameters, not hardcoded files
- Chrome extension UI: injects popup into job listing pages, extracts JD from page automatically
- PDF upload and conversion to HTML (MuPDF + Python)
- SSE streaming: pipeline progress sent to client in real time, step by step
- Conversational CV editor (`/chat` endpoint + `cv-chat` agent)
- Job description extractor agent (`job-extractor`) — parses raw page HTML
- JWT authentication + rate limiting
- Multi-model support: Anthropic, Google, OpenAI, Ollama (configurable)
- Full test suite with prompt eval tests
- Docker deployment support
- Handles RTL/Hebrew CVs (`cvLanguage` field)
- Handles absolute-positioned PDF-converted HTML (special rewriting mode)

### Architecture Differences
| Dimension | cv-creator skill | resume-fitter |
|-----------|-----------------|---------------|
| Runtime | Claude Code CLI (no server) | Node.js Express server + Chrome extension |
| Orchestration | SKILL.md prompt → Claude spawns sub-agents | TypeScript `orchestrator.ts` calls agent functions sequentially |
| Agent definition | `.claude/agents/*.md` markdown files | TypeScript modules + separate `prompts/*.md` |
| CV source | Local HTML template file on disk | Client-supplied HTML string (or uploaded PDF) |
| History source | Local markdown file on disk | Optional `history` string in API request body |
| Candidate scope | Single candidate (Tomer) | Any candidate |
| Output delivery | Writes HTML file to filesystem | Returns HTML via SSE/JSON API |
| Pipeline control | Implicit (Claude decides sub-agent calls) | Explicit sequential function calls with typed I/O |
| Schema validation | None (prompt-based) | Zod schemas on every agent output |
| Error handling | None (Claude retries naturally) | Explicit JSON parse + Zod parse with typed errors |

### Potential for Merging or Reusing Code

**High-value reuse opportunities:**

1. **Prompt content** — The `hiring-manager`, `rewrite-resume`, `ats-scanner`, and `verifier` prompts in resume-fitter are the production-hardened evolution of the cv-creator skill agents. They are strictly better: more detailed output contracts, Zod-validated, with edge-case handling (RTL, absolute-positioned HTML). The skill's agent `.md` files could simply be replaced by the resume-fitter prompts.

2. **cv-chat agent** — resume-fitter's `cv-chat` prompt (conversational CV editor) does not exist in cv-creator skill. It could be added as a `Step 5` or interactive post-step in the skill.

3. **job-extractor agent** — resume-fitter's job extractor (parsing JD from raw HTML) could replace the manual "paste job description" step in the skill, if the skill were extended to accept a URL.

**Merge strategy options:**

- **Option A — Skill uses server**: Point the create-cv skill at the running resume-fitter server (`POST /pipeline`). The skill becomes a thin Claude Code wrapper that collects inputs and calls the API. Eliminates prompt duplication entirely.

- **Option B — Skill inherits prompts**: Copy the production-grade `prompts/*.md` from resume-fitter into cv-creator's `.claude/agents/` as drop-in replacements. No code changes needed; just prompt files.

- **Option C — Full merge**: Fold cv-creator's use case (personal, file-based, CLI) into resume-fitter as a special mode — e.g., a CLI script or a `--local-files` flag that reads CV and history from disk rather than requiring API upload.

**Friction points for merging:**
- cv-creator is hardcoded to Tomer's files; resume-fitter is generalised — any merge must keep the personalisation optional
- cv-creator has no server dependency; if merged into resume-fitter, a running server becomes required
- Pipeline step order differs slightly: cv-creator does verify in step 4 after ATS; resume-fitter does verify in step 3 before ATS (so ATS scans the already-verified HTML)
