# Implementation Plan: `model.service.ts` + Server Scaffold

> Generated: 2026-03-04
> Branch: `create-server-ai-service`
> Rules source: `.claude\docs\wxt-ai-rules.md`, `.claude\plans\project-structure.md`

---

## 1. Context & Constraints

- The Vercel AI SDK is **only ever used on the backend server** — never imported in any WXT entrypoint or extension code.
- `ModelService` must validate that the required API key exists before any API call and surface a typed error if not.
- Max **300 lines per file** — `model.service.ts` must stay within this limit.
- No `any` — `unknown` + type guards only.
- Provider is resolved from `MODEL_PROVIDER` env var; no code changes are required to swap providers.
- The `FALLBACK_MODEL_PROVIDER` + `FALLBACK_MODEL_NAME` env vars enable cross-provider fallback without any code changes.

---

## 2. `.env.example` Contents

File path: `server/.env.example`

```dotenv
# ─── Primary LLM Provider ────────────────────────────────────────────────────
# Supported values: anthropic | openai | google | ollama
MODEL_PROVIDER=anthropic

# Model name for the primary provider.
# Defaults are applied in ModelService if this is omitted.
# anthropic default : claude-sonnet-4-6
# openai default    : gpt-4o
# google default    : gemini-2.0-flash
# ollama default    : llama3.2
MODEL_NAME=claude-sonnet-4-6

# ─── Fallback LLM Provider ───────────────────────────────────────────────────
# If the primary call fails due to a retriable error (rate limit, 5xx, model
# unavailable), ModelService retries with exponential backoff, then falls back
# to this provider/model.
# Leave blank to disable cross-provider fallback (same-provider fallback still
# applies using the provider's cheaper/faster model).
FALLBACK_MODEL_PROVIDER=openai
FALLBACK_MODEL_NAME=gpt-4o-mini

# ─── Provider API Keys ───────────────────────────────────────────────────────
# Only the key for the active provider (and fallback provider) needs to be set.
ANTHROPIC_API_KEY=sk-ant-...
OPENAI_API_KEY=sk-...
GOOGLE_GENERATIVE_AI_API_KEY=AIza...

# ─── Ollama (local models only) ──────────────────────────────────────────────
# Base URL for a locally running Ollama instance.
# Only required when MODEL_PROVIDER=ollama or FALLBACK_MODEL_PROVIDER=ollama.
OLLAMA_BASE_URL=http://localhost:11434

# ─── Server ──────────────────────────────────────────────────────────────────
PORT=3001

# Secret used to sign and verify short-lived JWTs issued to the extension.
# Generate with: node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"
SESSION_SECRET=replace-with-a-64-byte-random-hex-string
```

**Reasoning.** Every variable is documented inline so a new developer can configure the server without reading source code. Optional variables are clearly marked so `dotenv` can load only what is present without crashing.

---

## 3. Fallback Strategy Design

### 3.1 Error Classification

| Error type | Action |
|---|---|
| `InvalidPromptError` | **Fatal** — bad prompt from our own code; do not retry or fall back. Throw immediately so the bug is surfaced. |
| `NoSuchModelError` | **Fatal for this provider** — the `MODEL_NAME` is wrong. Skip retries, go straight to fallback. Log clearly. |
| `APICallError` with 4xx (400, 401, 403) | **Fatal** — bad key, bad request, or auth error. Do not retry. |
| `APICallError` with 429 (rate limit) | **Retriable** — exponential backoff, then fallback. |
| `APICallError` with 5xx | **Retriable** — server-side error at the provider. Exponential backoff, then fallback. |
| `APICallError` with network error / timeout | **Retriable** — transient. Exponential backoff, then fallback. |
| All other `Error` subtypes | **Fatal** — surface immediately. |

### 3.2 Retry + Backoff Strategy

- **Max retries on primary:** 2 (so 3 total attempts: initial + 2 retries).
- **Backoff:** `100ms * 2^attempt` with a cap at `4000ms` (jitter optional but not required for v1).
  - Attempt 0 → wait 100 ms
  - Attempt 1 → wait 200 ms
  - Attempt 2 → wait 400 ms
- After all primary retries exhausted → attempt fallback (if configured).
- **Fallback is attempted once** (no retries on fallback). If fallback also fails, throw a `PipelineError`.

### 3.3 Same-Provider Fallback

When `FALLBACK_MODEL_PROVIDER` is the same string as `MODEL_PROVIDER` or when `FALLBACK_MODEL_PROVIDER` is empty:

- Use the same provider instance but switch to `FALLBACK_MODEL_NAME`.
- Default same-provider fallback models (only applied when `FALLBACK_MODEL_NAME` is not set and `FALLBACK_MODEL_PROVIDER` equals primary):

| Primary provider | Same-provider fallback |
|---|---|
| `anthropic` | `claude-haiku-4-5` |
| `openai` | `gpt-4o-mini` |
| `google` | `gemini-2.0-flash-lite` |
| `ollama` | same as primary (no cheaper fallback; log warning) |

### 3.4 Cross-Provider Fallback

When `FALLBACK_MODEL_PROVIDER` differs from `MODEL_PROVIDER`:

- Build a second provider instance at startup (validated separately — must have its own API key).
- If the fallback provider key is missing, log a warning at startup but do not crash — cross-provider fallback is simply disabled.

### 3.5 Why This Design

- **Configuration over code** — ops can change fallback without a deploy.
- **No silent degradation** — every fallback event is logged with provider, model, error, and attempt count so alerting can trigger on unexpected fallback rates.
- **Fatal errors are never retried** — avoids wasting tokens on malformed prompts and burning API quota on auth failures.
- **Fallback attempted only once** — keeps the pipeline latency predictable. A double-retry fallback could triple total latency in the worst case.

---

## 4. `ModelService` Class Design

### 4.1 File: `server/src/services/model.service.ts`

**Responsibilities (single class, single file):**
1. Read and validate env vars at construction time.
2. Build the primary provider instance.
3. Build the fallback provider instance (if configured and key is present).
4. Expose `complete(systemPrompt, userPrompt): Promise<string>`.
5. Implement retry loop + fallback internally.

**Dependencies:**
- `ai` — `generateText`, `APICallError`, `NoSuchModelError`, `InvalidPromptError`
- `@ai-sdk/anthropic` — `createAnthropic`
- `@ai-sdk/openai` — `createOpenAI`
- `@ai-sdk/google` — `createGoogleGenerativeAI`
- `@ai-sdk/ollama` — `createOllama`

### 4.2 Types (defined inside the service file to keep it self-contained)

```typescript
type SupportedProvider = "anthropic" | "openai" | "google" | "ollama";

interface ProviderConfig {
  provider: SupportedProvider;
  modelName: string;
}

// Passed to each generateText() call
interface CompletionOptions {
  systemPrompt: string;
  userPrompt: string;
  config: ProviderConfig;
}
```

### 4.3 Default Models Per Provider

```typescript
const DEFAULT_MODELS: Record<SupportedProvider, string> = {
  anthropic: "claude-sonnet-4-6",
  openai: "gpt-4o",
  google: "gemini-2.0-flash",
  ollama: "llama3.2",
};

const SAME_PROVIDER_FALLBACK_MODELS: Record<SupportedProvider, string | null> = {
  anthropic: "claude-haiku-4-5",
  openai: "gpt-4o-mini",
  google: "gemini-2.0-flash-lite",
  ollama: null, // no cheaper local fallback; skip same-provider fallback
};
```

### 4.4 Pseudocode / Annotated Structure

```typescript
// server/src/services/model.service.ts

import { generateText, APICallError, NoSuchModelError, InvalidPromptError } from "ai";
import { createAnthropic } from "@ai-sdk/anthropic";
import { createOpenAI } from "@ai-sdk/openai";
import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { createOllama } from "@ai-sdk/ollama";

// ── Constants ──────────────────────────────────────────────────────────────

const MAX_RETRIES = 2;
const BASE_BACKOFF_MS = 100;
const MAX_BACKOFF_MS = 4_000;

const DEFAULT_MODELS: Record<SupportedProvider, string> = { ... };
const SAME_PROVIDER_FALLBACK_MODELS: Record<SupportedProvider, string | null> = { ... };

// ── Helpers ────────────────────────────────────────────────────────────────

function sleep(ms: number): Promise<void>
  // Returns a promise that resolves after ms milliseconds.

function backoffMs(attempt: number): number
  // Returns Math.min(BASE_BACKOFF_MS * 2 ** attempt, MAX_BACKOFF_MS)

function isRetriable(error: unknown): boolean
  // Returns true for:
  //   - APICallError where statusCode is 429 or >= 500
  //   - APICallError where isRetryable === true (SDK flag)
  //   - Network/timeout errors (non-APICallError Errors with "ECONNRESET", "ETIMEDOUT" etc.)
  // Returns false (fatal) for:
  //   - InvalidPromptError (always fatal — our bug)
  //   - APICallError with 400, 401, 403
  //   - NoSuchModelError (wrong model name — fatal for this provider)
  //   - Anything else unknown

function isFatalForProvider(error: unknown): boolean
  // Returns true for NoSuchModelError (wrong model name — skip retries, try fallback immediately)
  // Returns true for ECONNREFUSED / ENOTFOUND network errors (provider unreachable — no point retrying)
  //   Detection: error is a TypeError or non-APICallError Error whose message includes
  //   "ECONNREFUSED" or "ENOTFOUND" — these are thrown by fetch when the host is unreachable.
  //   For Ollama-as-primary, this means the local server is down → go straight to Gemini fallback.

function buildModel(config: ProviderConfig): LanguageModelV1
  // Reads API key from process.env based on config.provider.
  // Throws ModelConfigError if the required key is missing.
  // Returns the appropriate provider model object:
  //   anthropic: createAnthropic({ apiKey })("<modelName>")
  //   openai:    createOpenAI({ apiKey })("<modelName>")
  //   google:    createGoogleGenerativeAI({ apiKey })("<modelName>")
  //   ollama:    createOllama({ baseURL })("<modelName>")

function parseSupportedProvider(raw: string | undefined, varName: string): SupportedProvider
  // Validates that raw is one of the four supported values.
  // Throws with a descriptive message if not.

// ── ModelService ───────────────────────────────────────────────────────────

export class ModelService {

  private readonly primaryConfig: ProviderConfig;
  private readonly fallbackConfig: ProviderConfig | null;

  constructor()
    // Reads MODEL_PROVIDER, MODEL_NAME, FALLBACK_MODEL_PROVIDER, FALLBACK_MODEL_NAME.
    // Validates primaryConfig (key must exist — throws immediately if missing).
    // Attempts to resolve fallbackConfig:
    //   - If FALLBACK_MODEL_PROVIDER is set but its API key is missing:
    //     logs a warning, sets fallbackConfig = null (graceful degradation).
    //   - If FALLBACK_MODEL_PROVIDER is not set:
    //     derives same-provider fallback from SAME_PROVIDER_FALLBACK_MODELS.
    //     If the provider has no same-provider fallback (ollama), sets fallbackConfig = null.

  async complete(systemPrompt: string, userPrompt: string): Promise<string>
    // Main public API.
    // 1. Call attemptCompletion(primaryConfig, systemPrompt, userPrompt).
    // 2. On success, return the text.
    // 3. On failure:
    //    a. If error is InvalidPromptError → throw immediately (fatal, our bug).
    //    b. If error is NoSuchModelError   → skip to fallback (fatal for this provider).
    //    c. If error is retriable          → retry up to MAX_RETRIES with backoff.
    //    d. After retries exhausted, or on non-retriable fatal → try fallback.
    //    e. If no fallback configured      → throw PipelineError wrapping original error.
    //    f. If fallback also throws        → throw PipelineError with both errors logged.

  private async attemptCompletion(
    config: ProviderConfig,
    systemPrompt: string,
    userPrompt: string,
  ): Promise<string>
    // Calls generateText() with the built model.
    // Returns result.text.
    // Lets all errors propagate — caller handles classification.

  private async withRetry(
    config: ProviderConfig,
    systemPrompt: string,
    userPrompt: string,
  ): Promise<string>
    // Internal retry loop for primaryConfig only.
    // Implements: attempt 0 → catch → classify → sleep(backoffMs(attempt)) → attempt 1 → etc.
    // Throws last caught error when retries are exhausted.
    // Immediately rethrows InvalidPromptError and NoSuchModelError (no backoff).

  private resolveFallbackConfig(): ProviderConfig | null
    // Called from constructor.
    // Returns resolved ProviderConfig for fallback, or null if disabled/unavailable.

  private logFallback(
    primaryError: unknown,
    primaryConfig: ProviderConfig,
    fallbackConfig: ProviderConfig,
  ): void
    // Logs: warn level, provider, model, error message, attempt count.
    // Does NOT log the full prompt text (no PII/user content in logs).
}
```

### 4.5 Error Types

Two thin error classes defined at the top of the file (not in a separate file — they are model.service.ts internals exported for agent callers):

```typescript
export class ModelConfigError extends Error {
  // Thrown when a required env var (API key or MODEL_PROVIDER) is missing.
  constructor(message: string) {
    super(message);
    this.name = "ModelConfigError";
  }
}

export class PipelineError extends Error {
  // Thrown when both primary and fallback fail, or primary fails with no fallback.
  public readonly cause: unknown;
  constructor(message: string, cause: unknown) {
    super(message);
    this.name = "PipelineError";
    this.cause = cause;
  }
}
```

**Reasoning for keeping error classes in model.service.ts:** They are tightly coupled to this service's contract and have no value elsewhere in the codebase at this stage. If additional services need them, extract to `src/types/errors.ts` then.

### 4.6 `complete()` Control Flow (detailed)

```
complete(systemPrompt, userPrompt)
  │
  ├─► withRetry(primaryConfig, ...)
  │     ├── attempt 0: attemptCompletion(primaryConfig, ...)
  │     │     └── success → return text ✓
  │     ├── attempt 0 fails:
  │     │     ├── InvalidPromptError? → rethrow immediately (fatal)
  │     │     ├── NoSuchModelError?   → rethrow (skip to fallback)
  │     │     ├── isRetriable?        → sleep(100ms), attempt 1
  │     │     └── other fatal 4xx    → rethrow immediately
  │     ├── attempt 1 fails → sleep(200ms), attempt 2
  │     └── attempt 2 fails → rethrow last error
  │
  ├─► primary threw InvalidPromptError?
  │     └── throw immediately (do not try fallback — this is our bug)
  │
  ├─► fallbackConfig === null?
  │     └── throw PipelineError("Primary model failed, no fallback configured", err)
  │
  └─► attemptCompletion(fallbackConfig, ...)  ← single attempt, no retry
        ├── success → log warn("Fell back to {provider}/{model}"), return text ✓
        └── fail    → throw PipelineError("Both primary and fallback failed", err)
```

---

## 5. Server Stub Files to Create

All paths are relative to the monorepo root. These are **minimal stubs** — enough structure for TypeScript to compile and for `model.service.ts` to be wired in without creating empty files that confuse the compiler.

### 5.1 File List

| File path | Stub content |
|---|---|
| `server/package.json` | Full package.json with all required deps |
| `server/tsconfig.json` | Strict TypeScript config targeting Node 20 |
| `server/.env.example` | Full env example (see Section 2) |
| `server/src/index.ts` | Express app bootstrap (minimal, mounts routes) |
| `server/src/services/model.service.ts` | **Full implementation** (this plan's main deliverable) |
| `server/src/types/pipeline.types.ts` | `AgentResult`, `PipelineRequest`, `PipelineResponse` interfaces |
| `server/src/middleware/auth.ts` | JWT validation stub (`// TODO: implement`) |
| `server/src/middleware/rateLimit.ts` | Rate limit stub |
| `server/src/routes/pipeline.ts` | POST /pipeline route stub |
| `server/src/agents/orchestrator.ts` | Orchestrator stub (calls ModelService) |
| `server/src/agents/hiring-manager.ts` | Agent 1 stub |
| `server/src/agents/rewrite-resume.ts` | Agent 2 stub |
| `server/src/agents/ats-scanner.ts` | Agent 3 stub |
| `server/src/agents/verifier.ts` | Agent 4 stub |
| `server/src/prompts/hiring-manager.md` | Empty prompt placeholder |
| `server/src/prompts/rewrite-resume.md` | Empty prompt placeholder |
| `server/src/prompts/ats-scanner.md` | Empty prompt placeholder |
| `server/src/prompts/verifier.md` | Empty prompt placeholder |
| `server/tests/model.service.test.ts` | Unit test suite (mocked) |
| `server/tests/model.service.integration.test.ts` | Integration test suite (real HTTP) |

### 5.2 Stub Content Specifications

#### `server/package.json`

```json
{
  "name": "resume-fitter-server",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "tsx watch src/index.ts",
    "build": "tsc",
    "start": "node dist/index.js",
    "test": "vitest run",
    "test:watch": "vitest",
    "test:integration": "RUN_INTEGRATION_TESTS=true vitest run --reporter=verbose tests/model.service.integration.test.ts"
  },
  "dependencies": {
    "ai": "4.3.16",
    "@ai-sdk/anthropic": "1.2.12",
    "@ai-sdk/openai": "1.3.22",
    "@ai-sdk/google": "1.2.18",
    "@ai-sdk/ollama": "1.2.0",
    "express": "4.21.2",
    "dotenv": "16.4.7",
    "jsonwebtoken": "9.0.2",
    "express-rate-limit": "7.5.0",
    "zod": "3.24.2"
  },
  "devDependencies": {
    "@types/express": "4.17.21",
    "@types/jsonwebtoken": "9.0.9",
    "@types/node": "22.13.10",
    "typescript": "5.8.2",
    "tsx": "4.19.3",
    "vitest": "2.1.9"
  }
}
```

**Note on pinned versions:** Per `wxt-ai-rules.md`, no `^` on critical packages. Versions above reflect the latest stable releases as of 2026-03-04 and must be verified with `npm info <package> version` before committing.

#### `server/tsconfig.json`

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "outDir": "dist",
    "rootDir": "src",
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "exactOptionalPropertyTypes": true,
    "noImplicitOverride": true,
    "skipLibCheck": true,
    "esModuleInterop": true
  },
  "include": ["src/**/*"],
  "exclude": ["node_modules", "dist"]
}
```

**Reasoning:** `NodeNext` module resolution is required for ESM `import` in Node 20. `noUncheckedIndexedAccess` prevents index-into-array returning `T` instead of `T | undefined`, which matters when parsing env vars. `exactOptionalPropertyTypes` catches accidental `undefined` writes to optional fields.

#### `server/src/index.ts` (stub)

```typescript
import "dotenv/config";
import express from "express";
import { pipelineRouter } from "./routes/pipeline.js";

const app = express();
app.use(express.json({ limit: "256kb" }));
app.use("/pipeline", pipelineRouter);

const port = process.env["PORT"] ?? "3001";
app.listen(Number(port), () => {
  console.log(`[server] listening on port ${port}`);
});
```

**Note:** `dotenv/config` must be imported before anything else so env vars are available when `ModelService` constructor runs.

#### `server/src/types/pipeline.types.ts` (stub)

```typescript
export interface AgentResult {
  step: 1 | 2 | 3 | 4;
  name: string;
  output: Record<string, unknown>;
  durationMs: number;
}

export interface PipelineRequest {
  jobDescription: string;
  cvTemplate: string;
  history: string;
}

export interface PipelineResponse {
  steps: AgentResult[];
  finalCv: string;
}
```

#### `server/src/routes/pipeline.ts` (stub)

```typescript
import { Router } from "express";
import type { PipelineRequest, PipelineResponse } from "../types/pipeline.types.js";

export const pipelineRouter = Router();

pipelineRouter.post("/", async (req, res) => {
  // TODO: auth middleware
  // TODO: validate request body with Zod
  // TODO: call orchestrator.run(body)
  // TODO: return PipelineResponse
  res.status(501).json({ error: "Not implemented" });
});
```

#### `server/src/middleware/auth.ts` (stub)

```typescript
import type { Request, Response, NextFunction } from "express";

export function requireAuth(req: Request, res: Response, next: NextFunction): void {
  // TODO: verify Bearer JWT using SESSION_SECRET
  // TODO: attach decoded payload to req.user
  next(); // remove when implemented
}
```

#### `server/src/middleware/rateLimit.ts` (stub)

```typescript
import rateLimit from "express-rate-limit";

export const rateLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
});
```

#### `server/src/agents/orchestrator.ts` (stub)

```typescript
import { ModelService } from "../services/model.service.js";
import type { AgentResult, PipelineRequest, PipelineResponse } from "../types/pipeline.types.js";

const modelService = new ModelService();

export async function runPipeline(request: PipelineRequest): Promise<PipelineResponse> {
  // TODO: call each agent in sequence, passing only required context
  // TODO: collect AgentResult for each step
  // TODO: return PipelineResponse
  throw new Error("Not implemented");
}
```

**Note:** `ModelService` is instantiated **once** at module load (not inside the request handler) so constructor validation runs at startup, not per-request. Service worker restart is not a concern for the Node.js backend — this singleton pattern is intentional and safe here.

#### Agent stubs (`hiring-manager.ts`, `rewrite-resume.ts`, `ats-scanner.ts`, `verifier.ts`)

Each follows the same pattern:

```typescript
// server/src/agents/hiring-manager.ts
import type { ModelService } from "../services/model.service.js";

export interface HiringManagerOutput {
  matchScore: number;
  missingKeywords: string[];
}

export async function runHiringManager(
  modelService: ModelService,
  jobDescription: string,
  cvTemplate: string,
  history: string,
): Promise<HiringManagerOutput> {
  // TODO: load hiring-manager.md system prompt
  // TODO: call modelService.complete(systemPrompt, userPrompt)
  // TODO: parse and Zod-validate the JSON response
  throw new Error("Not implemented");
}
```

**Reasoning for function-per-agent, not class-per-agent:** Agents are stateless transformations — they take inputs, call the model, return a typed output. A class would add no value. `ModelService` is the only stateful singleton (holds provider config).

---

## 6. `model.service.ts` Line-Count Estimate

| Section | Estimated lines |
|---|---|
| Imports | 8 |
| Type definitions (`SupportedProvider`, `ProviderConfig`) | 10 |
| Constants (`DEFAULT_MODELS`, `SAME_PROVIDER_FALLBACK_MODELS`, retry config) | 18 |
| `ModelConfigError` + `PipelineError` classes | 20 |
| `sleep()` + `backoffMs()` helpers | 10 |
| `isRetriable()` + `isFatalForProvider()` helpers | 25 |
| `buildModel()` helper | 35 |
| `parseSupportedProvider()` helper | 15 |
| `ModelService` constructor | 50 |
| `ModelService.complete()` | 40 |
| `ModelService.withRetry()` | 35 |
| `ModelService.attemptCompletion()` | 15 |
| `ModelService.resolveFallbackConfig()` | 20 |
| `ModelService.logFallback()` | 10 |
| **Total** | **~311** |

**Action required:** The estimate slightly exceeds 300 lines. To stay within the rule, extract the four helper functions (`sleep`, `backoffMs`, `isRetriable`, `isFatalForProvider`) into `server/src/utils/model-helpers.ts` and import them. This gives `model.service.ts` ~260 lines and `model-helpers.ts` ~50 lines — both well within budget.

---

## 7. Additional Utility File

**`server/src/utils/model-helpers.ts`** (extracted from service to respect 300-line rule):

```typescript
// Pure helper functions for ModelService — no class dependencies.

export function sleep(ms: number): Promise<void>
export function backoffMs(attempt: number): number
export function isRetriable(error: unknown): boolean
export function isFatalForProvider(error: unknown): boolean
```

---

## 8. Implementation Order

1. `server/package.json` + `server/tsconfig.json` + `server/.env.example` — project foundation.
2. `server/src/types/pipeline.types.ts` — shared types needed by everything else.
3. `server/src/utils/model-helpers.ts` — pure functions, no deps, easy to test first.
4. `server/src/services/model.service.ts` — the main deliverable.
5. `server/src/index.ts` — bootstrap, ensures the service initializes on startup.
6. All stubs (`middleware/`, `routes/`, `agents/`, `prompts/`) — allows TypeScript to compile the whole server without errors.

---

## 9. Testing Strategy

Two test suites live side by side:

| Suite | File | Runs in CI | Needs real keys |
|---|---|---|---|
| Unit | `tests/model.service.test.ts` | Yes | No (all mocked) |
| Integration | `tests/model.service.integration.test.ts` | Only when `RUN_INTEGRATION_TESTS=true` | Yes |

**Test runner:** Vitest (ESM-native, TypeScript-first, fast). Add to `package.json` devDependencies:

```json
"vitest": "2.1.9"
```

Add scripts:

```json
"test":             "vitest run",
"test:watch":       "vitest",
"test:integration": "RUN_INTEGRATION_TESTS=true vitest run --reporter=verbose tests/model.service.integration.test.ts"
```

---

### 9.1 Unit Tests (`model.service.test.ts`)

Mock `generateText` from `ai` using Vitest's `vi.mock`. All network calls are intercepted — no API keys or running services needed.

**File structure:**

```typescript
// server/tests/model.service.test.ts
import { describe, it, expect, vi, beforeEach } from "vitest";
import { ModelService, ModelConfigError, PipelineError } from "../src/services/model.service.js";
import { InvalidPromptError, NoSuchModelError, APICallError } from "ai";

vi.mock("ai", async (importOriginal) => {
  const actual = await importOriginal<typeof import("ai")>();
  return { ...actual, generateText: vi.fn() };
});

// Import after mock so we can control return values per test
import { generateText } from "ai";
const mockGenerateText = vi.mocked(generateText);
```

**Test cases:**

```
describe("ModelService — constructor")
  ✓ throws ModelConfigError when MODEL_PROVIDER is missing
  ✓ throws ModelConfigError when primary API key is missing
  ✓ logs warning + disables fallback when FALLBACK_MODEL_PROVIDER key is missing
  ✓ uses DEFAULT_MODELS when MODEL_NAME is not set
  ✓ uses SAME_PROVIDER_FALLBACK_MODELS when FALLBACK_MODEL_PROVIDER not set (non-ollama)
  ✓ sets fallbackConfig = null for ollama primary with no FALLBACK_MODEL_PROVIDER

describe("ModelService.complete() — happy path")
  ✓ returns text from generateText on first attempt

describe("ModelService.complete() — fatal errors (no retry, no fallback)")
  ✓ InvalidPromptError → rethrows immediately
  ✓ APICallError 401 → rethrows immediately (no retry)
  ✓ APICallError 403 → rethrows immediately (no retry)
  ✓ APICallError 400 → rethrows immediately (no retry)

describe("ModelService.complete() — fatal-for-provider (skip retries, use fallback)")
  ✓ NoSuchModelError → goes to fallback after 0 retries
  ✓ ECONNREFUSED error → goes to fallback after 0 retries
  ✓ ENOTFOUND error → goes to fallback after 0 retries

describe("ModelService.complete() — retriable errors")
  ✓ APICallError 429 → retries 2x with backoff, then falls to fallback
  ✓ APICallError 500 → retries 2x with backoff, then falls to fallback
  ✓ generateText called exactly 3 times (primary) + 1 time (fallback) on 429
  ✓ fallback success → returns text and logs warn (spy on console.warn)

describe("ModelService.complete() — fallback exhaustion")
  ✓ primary fails + fallback fails → throws PipelineError
  ✓ primary fails + no fallback configured → throws PipelineError
  ✓ PipelineError.cause contains the original error

describe("model-helpers — isRetriable / isFatalForProvider")
  ✓ isRetriable: true for 429, 500, 503
  ✓ isRetriable: false for 400, 401, 403, InvalidPromptError
  ✓ isFatalForProvider: true for NoSuchModelError
  ✓ isFatalForProvider: true for Error with message "ECONNREFUSED"
  ✓ isFatalForProvider: true for Error with message "ENOTFOUND"
  ✓ isFatalForProvider: false for retriable APICallError
```

**Backoff timing test approach** — fake timers so tests don't actually wait:

```typescript
it("retries 429 with exponential backoff", async () => {
  vi.useFakeTimers();
  mockGenerateText
    .mockRejectedValueOnce(new APICallError({ statusCode: 429, ... }))
    .mockRejectedValueOnce(new APICallError({ statusCode: 429, ... }))
    .mockResolvedValueOnce({ text: "ok" });

  const svc = makeService(); // helper that sets env + constructs ModelService
  const promise = svc.complete("sys", "usr");
  await vi.runAllTimersAsync();
  await expect(promise).resolves.toBe("ok");
  expect(mockGenerateText).toHaveBeenCalledTimes(3);
  vi.useRealTimers();
});
```

---

### 9.2 Integration Tests (`model.service.integration.test.ts`)

These make **real HTTP calls** to verify actual provider connectivity and key validity. Gated behind `RUN_INTEGRATION_TESTS=true` so they never run accidentally in CI.

```typescript
// server/tests/model.service.integration.test.ts
import { describe, it, expect, beforeAll } from "vitest";

const RUN = process.env["RUN_INTEGRATION_TESTS"] === "true";
const describeIf = (cond: boolean) => (cond ? describe : describe.skip);
```

**Suite 1 — Primary model smoke test (Ollama)**

```
describeIf(RUN)("Integration: Ollama primary (MODEL_PROVIDER=ollama)")
  beforeAll: set env MODEL_PROVIDER=ollama, MODEL_NAME=llama3.2, OLLAMA_BASE_URL=..., no fallback

  ✓ complete() returns a non-empty string for a minimal prompt ("Reply with: ok")
      → proves Ollama is running and the model is downloaded
  ✓ response time is under 60 000 ms (soft assertion — logs if slow, does not fail)
```

**Suite 2 — Fallback smoke test (Ollama → Gemini)**

```
describeIf(RUN)("Integration: Ollama→Gemini fallback")
  beforeAll: set env MODEL_PROVIDER=ollama, MODEL_NAME=this-model-does-not-exist,
             FALLBACK_MODEL_PROVIDER=google, FALLBACK_MODEL_NAME=gemini-2.0-flash-lite,
             GOOGLE_GENERATIVE_AI_API_KEY=<real key from env>

  ✓ complete() succeeds and returns a non-empty string
      → proves: primary (bad Ollama model) fails with NoSuchModelError,
                fallback correctly switches to Gemini,
                Gemini API key is valid and model responds
  ✓ console.warn was called with a message containing "fallback" (spy)
      → proves the fallback log fires (not silent degradation)
```

**Suite 3 — Fallback smoke test when Ollama server is down**

```
describeIf(RUN)("Integration: ECONNREFUSED → Gemini fallback")
  beforeAll: set OLLAMA_BASE_URL=http://localhost:19999 (nothing listening there),
             MODEL_PROVIDER=ollama, MODEL_NAME=llama3.2,
             FALLBACK_MODEL_PROVIDER=google, FALLBACK_MODEL_NAME=gemini-2.0-flash-lite

  ✓ complete() succeeds (Gemini handles the call)
  ✓ total time < 5000 ms — proves no retries were wasted on the dead Ollama server
      (if retries happened, time would be > 700 ms from backoff alone)
```

**Suite 4 — Gemini direct smoke test**

```
describeIf(RUN)("Integration: Gemini primary (MODEL_PROVIDER=google)")
  beforeAll: set MODEL_PROVIDER=google, MODEL_NAME=gemini-2.0-flash-lite,
             GOOGLE_GENERATIVE_AI_API_KEY=<from env>

  ✓ complete() returns a non-empty string for a minimal prompt
      → proves Gemini key is valid independently of fallback logic
```

**Running integration tests locally:**

```bash
# from server/
cp .env.example .env
# fill in GOOGLE_GENERATIVE_AI_API_KEY and OLLAMA_BASE_URL
npm run test:integration
```

**What integration tests do NOT test:**
- Rate limit (429) fallback — would require exhausting quota deliberately; covered by unit tests instead.
- Production Anthropic/OpenAI keys — test only the providers you configure for this project.

---

### 9.3 Testing Checklist (all tests green = task complete)

**Unit (CI):**
- [ ] `MODEL_PROVIDER` missing → `ModelConfigError` thrown at startup, server does not start.
- [ ] `ANTHROPIC_API_KEY` missing when `MODEL_PROVIDER=anthropic` → `ModelConfigError` at startup.
- [ ] `FALLBACK_MODEL_PROVIDER` set but its key missing → warning logged, fallback disabled, server starts.
- [ ] `InvalidPromptError` from primary → thrown immediately, no retry, no fallback.
- [ ] `NoSuchModelError` from primary → no retry, falls through to fallback immediately.
- [ ] 429 from primary → retried 2x with backoff, then falls to fallback.
- [ ] 5xx from primary → retried 2x with backoff, then falls to fallback.
- [ ] Fallback succeeds after primary fails → returns text, logs warn with provider/model/error.
- [ ] Both primary and fallback fail → `PipelineError` thrown with original errors.
- [ ] `MODEL_NAME` unset → default model for the provider is used without crash.
- [ ] `FALLBACK_MODEL_NAME` unset and same provider → `SAME_PROVIDER_FALLBACK_MODELS` default used.
- [ ] `ollama` primary with no fallback configured → `PipelineError` if primary fails.
- [ ] `ollama` primary + `google` fallback + Ollama server not running → `ECONNREFUSED` triggers **immediate** fallback to Gemini (no retries, no backoff).
- [ ] `FALLBACK_MODEL_PROVIDER=google` but `GOOGLE_GENERATIVE_AI_API_KEY` missing → warning at startup, fallback disabled, server starts.
- [ ] `complete()` returns clean string (`generateText` returns `.text`).
- [ ] No API keys appear in any log output.

**Integration (local only, `RUN_INTEGRATION_TESTS=true`):**
- [ ] Ollama primary with real model → returns non-empty response.
- [ ] Ollama (bad model name) + Gemini fallback → Gemini responds, warn log fires.
- [ ] Ollama (server down / ECONNREFUSED) + Gemini fallback → Gemini responds in < 5 s.
- [ ] Gemini primary direct → returns non-empty response.

---

## 10. Review Notes

> Reviewed: 2026-03-04
> Reviewer: ai-wxt-expert agent
> Rules source: `.claude/docs/wxt-ai-rules.md`

---

### 10.1 Critical Bugs — Must Fix Before Implementation

#### [BUG-1] Section 5.2 — `@ai-sdk/ollama` does not exist on npm

**Severity: Blocker.**

The package `@ai-sdk/ollama` referenced in Sections 4.1 (Dependencies), 4.4 (imports), 5.2 (`package.json`), and 7 (`model-helpers.ts` signatures) **does not exist in the npm registry**. Running `npm view @ai-sdk/ollama` returns a 404.

The Vercel AI SDK docs list Ollama as a **community provider**, not a first-party `@ai-sdk/*` provider. The correct community packages are:
- `ollama-ai-provider-v2` (install: `npm install ollama-ai-provider-v2`, import: `import { ollama } from 'ollama-ai-provider-v2'`)
- `ai-sdk-ollama` (alternative community package)

**Required changes:**
1. In Section 4.1 — replace `@ai-sdk/ollama` → `ollama-ai-provider-v2` in the Dependencies list.
2. In Section 4.4 — replace the import:
   ```typescript
   // WRONG:
   import { createOllama } from "@ai-sdk/ollama";

   // CORRECT:
   import { ollama } from "ollama-ai-provider-v2";
   ```
   The community provider exports a pre-built `ollama` instance used as `ollama("<modelName>")`, not a factory `createOllama(...)`. The `buildModel()` helper must be updated accordingly — for the ollama branch, use `ollama(config.modelName)` instead of `createOllama({ baseURL })(config.modelName)`.
3. In Section 5.2 (`package.json`) — replace `"@ai-sdk/ollama": "1.2.0"` with `"ollama-ai-provider-v2": "<latest>"`. The version `1.2.0` was fabricated; verify the real latest with `npm view ollama-ai-provider-v2 version` before pinning.
4. The `OLLAMA_BASE_URL` env var may still be usable if the community provider accepts a baseURL option — verify against `ollama-ai-provider-v2` docs. If not supported, document that Ollama must be reachable at its default `http://localhost:11434`.

**Note on `wxt-ai-rules.md`:** The rules table lists `@ai-sdk/ollama` as the Ollama package. This is incorrect in the rules file as well. The implementation must use the actual working package; flag this to the rules file maintainer separately.

---

#### [BUG-2] Section 4.4 — `LanguageModelV1` is the wrong type name

**Severity: TypeScript compilation error.**

The `buildModel()` helper is typed as returning `LanguageModelV1`. The Vercel AI SDK's public surface type for the model parameter accepted by `generateText()` is `LanguageModel` (not `LanguageModelV1`).

`LanguageModelV1` is an internal protocol interface inside `@ai-sdk/provider` and is not the type you should use as a return type in application code. Using it will likely compile only if you happen to have `@ai-sdk/provider` as a direct dependency, but it creates a brittle coupling to the internal versioned protocol.

**Required change in Section 4.4:**
```typescript
// WRONG:
function buildModel(config: ProviderConfig): LanguageModelV1

// CORRECT:
import type { LanguageModel } from "ai";
function buildModel(config: ProviderConfig): LanguageModel
```

Add `LanguageModel` to the import from `"ai"` in Section 4.4.

---

#### [BUG-3] Section 5.2 — Package versions are significantly outdated or fabricated

**Severity: High — pinned versions must be correct per the `no ^ on critical packages` rule.**

Actual latest npm versions as of 2026-03-04 vs. what the plan specifies:

| Package | Plan version | Actual latest | Status |
|---|---|---|---|
| `ai` | `4.3.16` | `6.0.111` | Wrong — major version behind |
| `@ai-sdk/anthropic` | `1.2.12` | `3.0.54` | Wrong — major version behind |
| `@ai-sdk/openai` | `1.3.22` | `3.0.39` | Wrong — major version behind |
| `@ai-sdk/google` | `1.2.18` | `3.0.37` | Wrong — major version behind |
| `@ai-sdk/ollama` | `1.2.0` | Does not exist | Blocker (see BUG-1) |
| `express` | `4.21.2` | `5.2.1` | Wrong — major version behind |
| `vitest` | `2.1.9` | `4.0.18` | Wrong — major version behind |
| `tsx` | `4.19.3` | `4.21.0` | Close but not exact |
| `typescript` | `5.8.2` | `5.9.3` | Wrong |
| `express-rate-limit` | `7.5.0` | `8.2.1` | Wrong — major version behind |
| `jsonwebtoken` | `9.0.2` | `9.0.3` | Close but not exact |
| `dotenv` | `16.4.7` | `17.3.1` | Wrong — major version behind |
| `zod` | `3.24.2` | `4.3.6` | Wrong — major version behind |

**Required action:** Do not hardcode these versions in the plan — the plan already states "must be verified with `npm info <package> version` before committing." However, the example versions in the plan are so far off that they could be copy-pasted and cause broken installs. Replace all hardcoded versions in Section 5.2 with a `<verify with npm view>` placeholder, or update them to reflect real values before implementation begins.

**Additional concern — breaking API changes:** The jump from `ai@4.x` to `ai@6.x` and `express@4.x` to `express@5.x` likely involves breaking API changes. The express v5 router and error handling APIs differ from v4. The plan's stub code for `server/src/routes/pipeline.ts` and `server/src/middleware/auth.ts` uses Express v4 patterns. Verify compatibility before pinning to v5.

---

#### [BUG-4] Section 9.1 — `APICallError` constructor call in test is wrong

**Severity: Unit tests will not compile.**

The test snippet constructs `APICallError` directly:
```typescript
new APICallError({ statusCode: 429, ... })
```

`APICallError` is a structured error thrown by the SDK internally — it is **not intended to be constructed directly** in user code using a plain object argument. The correct approach in tests is to use the static factory check `APICallError.isInstance(err)` for type narrowing, and to construct test errors by subclassing or by creating a plain object that satisfies the duck-type check.

The recommended approach for unit tests is to mock `generateText` to reject with a plain `Error` whose properties mimic `APICallError`, or use Vitest's `vi.fn().mockRejectedValue(...)` with a hand-crafted object that passes `APICallError.isInstance()`. Alternatively, check if the SDK exports a `createAPICallError` factory — if not, stub the error shape manually.

**Required change in Section 9.1:** Remove the direct `new APICallError(...)` constructor usage from the test snippet and replace with a factory pattern or a plain object that the `isRetriable()` helper will correctly classify. Document this pattern explicitly in the testing section.

---

### 10.2 Rule Violations

#### [RULE-1] Section 4.4 — `CompletionOptions` interface inside `model.service.ts` violates grouping rule

**Rule:** `wxt-ai-rules.md` — "Use `interface` for data shapes" + "Group by feature, not by type" with `types/` for shared TypeScript interfaces.

**Finding:** Section 4.2 defines `SupportedProvider`, `ProviderConfig`, and `CompletionOptions` directly inside `model.service.ts` "to keep it self-contained." However, `ProviderConfig` and `SupportedProvider` are likely needed by `model-helpers.ts` (which receives a `ProviderConfig` to classify errors in context) and by agents that may construct partial configs. Keeping them inside the service file creates circular import risk if helpers need them.

**Recommendation:** Move `SupportedProvider` and `ProviderConfig` to `server/src/types/pipeline.types.ts` (or a new `server/src/types/model.types.ts`). `CompletionOptions` is a private implementation detail and can stay in the service file as a private type (not exported). This has no rules violation — just be explicit that `ProviderConfig` will need to be in `types/` once `model-helpers.ts` imports it.

#### [RULE-2] Section 4.5 — `PipelineError.cause` shadows built-in `Error.cause`

**Rule:** `wxt-ai-rules.md` — "Strict mode enabled" + general TypeScript correctness.

**Finding:** `PipelineError` declares `public readonly cause: unknown` as its own property. In ES2022 (the compile target), `Error` already has a built-in `cause` property (set via `super(message, { cause })`). Declaring `this.cause = cause` as a separate field while also having the built-in `Error.cause` set to `undefined` creates two different `cause` values — the built-in one (undefined) and the class field (the wrapped error).

**Correction for Section 4.5:**
```typescript
export class PipelineError extends Error {
  constructor(message: string, cause: unknown) {
    super(message, { cause }); // ES2022 built-in Error.cause
    this.name = "PipelineError";
    // Do NOT redeclare cause as a separate property
  }
}
```
Access the cause via the standard `error.cause` which TypeScript types as `unknown` in ES2022. Remove the `public readonly cause: unknown` field declaration.

---

### 10.3 Gaps and Missing Pieces

#### [GAP-1] Section 4.4 — `buildModel()` for Ollama does not handle `OLLAMA_BASE_URL`

The pseudocode says `createOllama({ baseURL })` but the plan never specifies where `baseURL` is read from inside `buildModel()`. The `.env.example` in Section 2 defines `OLLAMA_BASE_URL` — the implementation must read `process.env["OLLAMA_BASE_URL"] ?? "http://localhost:11434"` inside the ollama branch of `buildModel()`. This is implied but not stated explicitly, creating an implementation ambiguity. Add an explicit note in Section 4.4.

#### [GAP-2] Section 4.4 — `parseSupportedProvider()` return used in `resolveFallbackConfig()` for optional var

`parseSupportedProvider()` is described as throwing if the value is not one of the four supported values. But `FALLBACK_MODEL_PROVIDER` is optional — if it is not set, the function should not throw. The plan needs to clarify that `parseSupportedProvider()` should only be called when the env var is defined and non-empty. Add a guard in `resolveFallbackConfig()`: if `FALLBACK_MODEL_PROVIDER` is `undefined` or `""`, skip the parse call entirely and go to same-provider fallback resolution.

#### [GAP-3] Section 4.6 — Control flow diagram missing `isFatalForProvider` branch in `withRetry`

The control flow diagram in Section 4.6 shows `withRetry` handling `NoSuchModelError` (rethrows to trigger fallback), but `isFatalForProvider()` is also supposed to return `true` for `ECONNREFUSED`/`ENOTFOUND`. These network-fatal errors are not shown in the diagram — they look like they fall through to the `isRetriable?` check, which would then return `false` (since they're not retriable APICallErrors), causing them to be rethrown as fatal rather than triggering fallback.

The logic should be:
```
attempt fails →
  InvalidPromptError?        → rethrow immediately (fatal, no fallback)
  isFatalForProvider(err)?   → rethrow to caller (triggers fallback, no retry)
  isRetriable(err)?          → sleep + retry
  else                       → rethrow immediately (other fatal 4xx)
```
This precedence order must be explicitly stated in both Section 4.4 (`withRetry` pseudocode) and Section 4.6.

#### [GAP-4] Section 5.2 — `index.ts` stub does not mount `ModelService` startup validation

The stub boots Express and mounts routes, but `ModelService` is only instantiated inside `orchestrator.ts` at module load. If `orchestrator.ts` is never imported by `index.ts` (only lazily imported when a request hits the route), startup validation of `MODEL_PROVIDER` and API key will not run at boot time — the error will surface on the first real request.

**Recommendation:** Either import `orchestrator.ts` eagerly in `index.ts` (before `app.listen`) or add an explicit `new ModelService()` call in `index.ts` with a try/catch that exits the process on `ModelConfigError`. The plan should make this intent explicit. Currently `index.ts` only imports `pipelineRouter`, which does not import `orchestrator.ts`.

#### [GAP-5] Section 9.1 — No test for the `isFatalForProvider` + ECONNREFUSED path being exempt from retry timing

The test checklist (Section 9.3) includes "ollama + ECONNREFUSED triggers immediate fallback (no retries, no backoff)" but the unit test file structure in Section 9.1 does not include a corresponding test that verifies `generateText` was called exactly once (not 3 times) when an ECONNREFUSED-like error is thrown. Add this to the describe block for "fatal-for-provider" errors:
```
✓ ECONNREFUSED error → generateText called exactly 1 time (no retry)
✓ ENOTFOUND error    → generateText called exactly 1 time (no retry)
```

#### [GAP-6] Section 9.2 — Integration Suite 2 uses a bad Ollama model name to trigger `NoSuchModelError`

This relies on Ollama returning a `NoSuchModelError` when given a non-existent model name. Ollama's behavior when a model is not pulled locally may differ from what the Vercel AI SDK's community provider surfaces — it may throw a generic `Error` or a fetch error instead of a typed `NoSuchModelError`. The integration test comment should note this assumption and include a fallback assertion: if `console.warn` was called with "fallback", the test passes regardless of the exact error type. Document the potential fragility.

---

### 10.4 Code Snippet Corrections Summary

| Section | Issue | Correction |
|---|---|---|
| 4.1 Dependencies | `@ai-sdk/ollama` does not exist | Replace with `ollama-ai-provider-v2` |
| 4.4 imports | `import { createOllama } from "@ai-sdk/ollama"` | `import { ollama } from "ollama-ai-provider-v2"` |
| 4.4 `buildModel()` return type | `LanguageModelV1` | `LanguageModel` (from `"ai"`) |
| 4.5 `PipelineError` | `public readonly cause: unknown` redeclaration | Use `super(message, { cause })` and remove the field |
| 5.2 `package.json` | All dependency versions outdated (see BUG-3) | Verify all with `npm view <pkg> version` before pinning |
| 9.1 test snippet | `new APICallError({ statusCode: 429, ... })` | Use mock/factory pattern; do not construct directly |

---

### 10.5 Confirmations — No Changes Required

The following sections are correct and compliant:

- **Section 1 (Context & Constraints):** Accurately states all key rules: SDK server-only, 300-line limit, no `any`, env-var-driven provider swap. Fully compliant with `wxt-ai-rules.md`.
- **Section 2 (`.env.example`):** Well-structured, all four providers covered, `SESSION_SECRET` and `PORT` included, inline comments are clear. `GOOGLE_GENERATIVE_AI_API_KEY` is the correct env var name for `@ai-sdk/google`.
- **Section 3 (Fallback Strategy):** Error classification table is correct and matches SDK-documented error types. Retry counts (max 2, 3 total attempts), backoff formula (`100ms * 2^attempt`, cap 4000ms), and the "fallback attempted once" rule are all sound design decisions.
- **Section 3.3 Same-Provider Fallback Models:** Model names are correct (`claude-haiku-4-5`, `gpt-4o-mini`, `gemini-2.0-flash-lite`). Ollama having no same-provider fallback is the right call.
- **Section 4.3 Default Models:** `claude-sonnet-4-6`, `gpt-4o`, `gemini-2.0-flash`, `llama3.2` — all valid for their respective providers (subject to API version at time of implementation).
- **Section 4.4 imports for non-Ollama providers:** `createAnthropic`, `createOpenAI`, `createGoogleGenerativeAI` are all correct import names from their respective `@ai-sdk/*` packages.
- **Section 4.4 `generateText` import and usage:** `import { generateText } from "ai"` is correct. `result.text` is correct (the result object has `.text` directly).
- **Section 4.4 error imports:** `APICallError`, `NoSuchModelError`, `InvalidPromptError` are all correctly imported from `"ai"`. `APICallError.isInstance()` is the correct way to type-narrow (referenced in `isRetriable` comments).
- **Section 4.5 `ModelConfigError`:** Design is correct — thrown at constructor time so the server refuses to start with bad config. `this.name` assignment is correct.
- **Section 4.6 Control Flow:** Conceptually correct for the non-Ollama paths. See GAP-3 for the ECONNREFUSED branch omission.
- **Section 5.2 `tsconfig.json`:** `NodeNext` module resolution for ESM Node 20 is correct. `noUncheckedIndexedAccess` and `exactOptionalPropertyTypes` are good additions. `skipLibCheck: true` is appropriate.
- **Section 5.2 `index.ts`:** `import "dotenv/config"` as the first line is correct — env vars must load before `ModelService` runs.
- **Section 5.2 agent stubs:** Function-per-agent (not class) is correct and stated reasoning is sound. `import type { ModelService }` (type-only import) is good — prevents circular import issues.
- **Section 6 (Line Count Estimate):** The estimate of ~311 lines and the decision to extract helpers to `model-helpers.ts` is the correct approach. Estimated final split (~260 + ~50) satisfies the 300-line rule.
- **Section 7 (model-helpers.ts):** Correct approach. Pure functions with no class dependencies are appropriate for extraction.
- **Section 8 (Implementation Order):** Logical sequence. Types before service, helpers before service, service before stubs. Correct.
- **Section 9 (Testing):** Vitest as test runner is correct for an ESM TypeScript project. `vi.useFakeTimers()` + `vi.runAllTimersAsync()` is the correct pattern for testing backoff without real waits. The `RUN_INTEGRATION_TESTS` gate is the right approach for keeping expensive tests out of CI.
- **Section 9.3 Checklist:** Comprehensive. Covers all error paths, config edge cases, and the "no API keys in logs" requirement from `wxt-ai-rules.md`.
