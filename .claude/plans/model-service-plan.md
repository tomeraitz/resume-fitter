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
# Defaults are applied in model.constants.ts if this is omitted (see below).
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

# ─── Default Models Per Provider (model.constants.ts) ────────────────────────
# Used when MODEL_NAME is not set. These override the hardcoded fallbacks in
# model.constants.ts so you can change defaults without a code change.
ANTHROPIC_DEFAULT_MODEL=claude-sonnet-4-6
OPENAI_DEFAULT_MODEL=gpt-4o
GOOGLE_DEFAULT_MODEL=gemini-2.0-flash
OLLAMA_DEFAULT_MODEL=llama3.2

# ─── Same-Provider Fallback Models (model.constants.ts) ──────────────────────
# Used when FALLBACK_MODEL_PROVIDER is not set (implicit same-provider fallback).
# Set to empty string to disable same-provider fallback for that provider.
# ollama has no default same-provider fallback (leave unset to keep it disabled).
ANTHROPIC_FALLBACK_MODEL=claude-haiku-4-5
OPENAI_FALLBACK_MODEL=gpt-4o-mini
GOOGLE_FALLBACK_MODEL=gemini-2.0-flash-lite
# OLLAMA_FALLBACK_MODEL=   # unset = disabled

# ─── Retry Configuration (model.constants.ts) ────────────────────────────────
# RETRY_MAX_ATTEMPTS   : retries after the initial attempt (default: 2 → 3 total)
# RETRY_BASE_BACKOFF_MS: initial backoff in ms, doubles each attempt (default: 100)
# RETRY_MAX_BACKOFF_MS : backoff ceiling in ms (default: 4000)
# RETRY_MAX_ATTEMPTS=2
# RETRY_BASE_BACKOFF_MS=100
# RETRY_MAX_BACKOFF_MS=4000

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
- `ai` — `generateText`, `LanguageModel`, `APICallError`, `NoSuchModelError`, `InvalidPromptError`
- `@ai-sdk/anthropic` — `createAnthropic`
- `@ai-sdk/openai` — `createOpenAI`
- `@ai-sdk/google` — `createGoogleGenerativeAI`
- `ollama-ai-provider-v2` — `ollama` (community provider — `@ai-sdk/ollama` does not exist on npm)

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

### 4.3 Constants File: `server/src/services/model.constants.ts`

All previously hardcoded constants are defined here and read from environment variables with in-code defaults. This means **no code change is needed to adjust retry behaviour or default models** — only `.env` edits.

```typescript
// ── Provider Types ──────────────────────────────────────────────────────────
export type SupportedProvider = "anthropic" | "openai" | "google" | "ollama";

// ── Retry Configuration ─────────────────────────────────────────────────────
export const MAX_RETRIES        = Number(process.env["RETRY_MAX_ATTEMPTS"]    ?? "2");
export const BASE_BACKOFF_MS    = Number(process.env["RETRY_BASE_BACKOFF_MS"] ?? "100");
export const MAX_BACKOFF_MS     = Number(process.env["RETRY_MAX_BACKOFF_MS"]  ?? "4000");

// ── Default Models Per Provider ─────────────────────────────────────────────
export const DEFAULT_MODELS: Record<SupportedProvider, string> = {
  anthropic: process.env["ANTHROPIC_DEFAULT_MODEL"] || "claude-sonnet-4-6",
  openai:    process.env["OPENAI_DEFAULT_MODEL"]    || "gpt-4o",
  google:    process.env["GOOGLE_DEFAULT_MODEL"]    || "gemini-2.0-flash",
  ollama:    process.env["OLLAMA_DEFAULT_MODEL"]    || "llama3.2",
};

// ── Same-Provider Fallback Models ───────────────────────────────────────────
export const FALLBACK_MODELS: Record<SupportedProvider, string | null> = {
  anthropic: process.env["ANTHROPIC_FALLBACK_MODEL"] || "claude-haiku-4-5",
  openai:    process.env["OPENAI_FALLBACK_MODEL"]    || "gpt-4o-mini",
  google:    process.env["GOOGLE_FALLBACK_MODEL"]    || "gemini-2.0-flash-lite",
  ollama:    process.env["OLLAMA_FALLBACK_MODEL"]    || null,
};
```

`||` (not `??`) is used intentionally: an empty string env value (`OLLAMA_FALLBACK_MODEL=`) is treated as "not set", falling through to the in-code default (or `null` for ollama).

### 4.4 Pseudocode / Annotated Structure

```typescript
// server/src/services/model.service.ts

import { generateText, type LanguageModel, APICallError, NoSuchModelError, InvalidPromptError } from "ai";
import { createAnthropic } from "@ai-sdk/anthropic";
import { createOpenAI } from "@ai-sdk/openai";
import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { ollama } from "ollama-ai-provider-v2"; // community provider — @ai-sdk/ollama does not exist

// ── Constants ──────────────────────────────────────────────────────────────

const MAX_RETRIES = 2;
const BASE_BACKOFF_MS = 100;
const MAX_BACKOFF_MS = 4_000;

const DEFAULT_MODELS: Record<SupportedProvider, string> = { ... };
const FALLBACK_MODELS: Record<SupportedProvider, string | null> = { ... };

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

function buildModel(config: ProviderConfig): LanguageModel
  // Reads API key from process.env based on config.provider.
  // Throws ModelConfigError if the required key is missing.
  // Returns the appropriate provider model object:
  //   anthropic: createAnthropic({ apiKey })(config.modelName)
  //   openai:    createOpenAI({ apiKey })(config.modelName)
  //   google:    createGoogleGenerativeAI({ apiKey })(config.modelName)
  //   ollama:    ollama(config.modelName)
  //              baseURL is configured via the OLLAMA_BASE_URL env var handled by
  //              the community provider internally (defaults to http://localhost:11434)

function parseSupportedProvider(raw: string | undefined, varName: string): SupportedProvider
  // Validates that raw is one of the four supported values.
  // Throws with a descriptive message if not.
  // IMPORTANT: must only be called when raw is defined and non-empty.
  //   In resolveFallbackConfig(), guard with:
  //   if (!raw) { /* skip to same-provider fallback */ }

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
    //     derives same-provider fallback from FALLBACK_MODELS.
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
    // Error classification order on each failure:
    //   1. InvalidPromptError?      → rethrow immediately (fatal, no fallback)
    //   2. isFatalForProvider(err)? → rethrow (triggers fallback in complete(), 0 retries)
    //                                  covers: NoSuchModelError, ECONNREFUSED, ENOTFOUND
    //   3. isRetriable(err)?        → sleep(backoffMs(attempt)) and retry
    //   4. else (fatal 4xx etc.)    → rethrow immediately
    // Throws last caught error when retries are exhausted.

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
  // Uses ES2022 built-in Error.cause — do NOT redeclare cause as a class field.
  constructor(message: string, cause: unknown) {
    super(message, { cause }); // sets this.cause via the built-in Error constructor
    this.name = "PipelineError";
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
  │     ├── attempt 0 fails (classification order):
  │     │     ├── InvalidPromptError?       → rethrow immediately (fatal, no fallback)
  │     │     ├── isFatalForProvider(err)?  → rethrow (0 retries, triggers fallback)
  │     │     │     covers: NoSuchModelError, ECONNREFUSED, ENOTFOUND
  │     │     ├── isRetriable?              → sleep(100ms), attempt 1
  │     │     └── other fatal (4xx)         → rethrow immediately
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
| `server/src/services/model.constants.ts` | All env-driven constants (`SupportedProvider`, retry config, default models) |
| `server/src/services/model.service.ts` | **Full implementation** (imports constants from `model.constants.ts`) |
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
    "ai": "<verify: npm view ai version>",
    "@ai-sdk/anthropic": "<verify: npm view @ai-sdk/anthropic version>",
    "@ai-sdk/openai": "<verify: npm view @ai-sdk/openai version>",
    "@ai-sdk/google": "<verify: npm view @ai-sdk/google version>",
    "ollama-ai-provider-v2": "<verify: npm view ollama-ai-provider-v2 version>",
    "express": "<verify: npm view express version>",
    "dotenv": "<verify: npm view dotenv version>",
    "jsonwebtoken": "<verify: npm view jsonwebtoken version>",
    "express-rate-limit": "<verify: npm view express-rate-limit version>",
    "zod": "<verify: npm view zod version>"
  },
  "devDependencies": {
    "@types/express": "<verify: npm view @types/express version>",
    "@types/jsonwebtoken": "<verify: npm view @types/jsonwebtoken version>",
    "@types/node": "<verify: npm view @types/node version>",
    "typescript": "<verify: npm view typescript version>",
    "tsx": "<verify: npm view tsx version>",
    "vitest": "<verify: npm view vitest version>"
  }
}
```

**Note on pinned versions:** Per `wxt-ai-rules.md`, no `^` on critical packages. All versions above are placeholders — run `npm view <package> version` for each before writing the final `package.json`. The `ai` and `@ai-sdk/*` packages must all be from the same major version family (currently `6.x` / `3.x` respectively). Verify Express major version (v4 vs v5) since v5 has breaking API changes; confirm stub code is compatible before pinning.

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
// Eagerly import orchestrator so ModelService validates env vars at startup,
// not on the first incoming request.
import "./agents/orchestrator.js";

const app = express();
app.use(express.json({ limit: "256kb" }));
app.use("/pipeline", pipelineRouter);

const port = process.env["PORT"] ?? "3001";
app.listen(Number(port), () => {
  console.log(`[server] listening on port ${port}`);
});
```

**Note:** `dotenv/config` must be imported before anything else so env vars are available when `ModelService` constructor runs. The `orchestrator.js` import is intentionally side-effectful — it causes `new ModelService()` to run at module load so a missing `MODEL_PROVIDER` or API key crashes the server at startup with a clear error, not silently on the first request.

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
| Constants (`DEFAULT_MODELS`, `FALLBACK_MODELS`, retry config) | 18 |
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
// Imports BASE_BACKOFF_MS and MAX_BACKOFF_MS from ../services/model.constants.js
// so backoff timing is also configurable via env vars.

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
  ✓ uses FALLBACK_MODELS when FALLBACK_MODEL_PROVIDER not set (non-ollama)
  ✓ sets fallbackConfig = null for ollama primary with no FALLBACK_MODEL_PROVIDER

describe("ModelService.complete() — happy path")
  ✓ returns text from generateText on first attempt

describe("ModelService.complete() — fatal errors (no retry, no fallback)")
  ✓ InvalidPromptError → rethrows immediately
  ✓ APICallError 401 → rethrows immediately (no retry)
  ✓ APICallError 403 → rethrows immediately (no retry)
  ✓ APICallError 400 → rethrows immediately (no retry)

describe("ModelService.complete() — fatal-for-provider (skip retries, use fallback)")
  ✓ NoSuchModelError → goes to fallback after 0 retries, generateText called exactly 1 time
  ✓ ECONNREFUSED error → goes to fallback after 0 retries, generateText called exactly 1 time
  ✓ ENOTFOUND error → goes to fallback after 0 retries, generateText called exactly 1 time

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

**Backoff timing test approach** — fake timers so tests don't actually wait.

**Important:** `APICallError` cannot be directly constructed with `new APICallError({ statusCode: 429 })` — it is an internal SDK class not designed for user instantiation. Use a plain object that passes the `APICallError.isInstance()` duck-type check, or mock at the `generateText` level so `isRetriable` receives the raw rejection value and classifies it by shape:

```typescript
// Helper — create a mock APICallError-like object for retriable status codes
function makeApiError(statusCode: number): Error & { statusCode: number; isRetryable: boolean } {
  const err = Object.assign(new Error(`HTTP ${statusCode}`), {
    statusCode,
    isRetryable: statusCode === 429 || statusCode >= 500,
  });
  return err as Error & { statusCode: number; isRetryable: boolean };
}

it("retries 429 with exponential backoff", async () => {
  vi.useFakeTimers();
  mockGenerateText
    .mockRejectedValueOnce(makeApiError(429))
    .mockRejectedValueOnce(makeApiError(429))
    .mockResolvedValueOnce({ text: "ok" });

  const svc = makeService(); // helper that sets env vars + constructs ModelService
  const promise = svc.complete("sys", "usr");
  await vi.runAllTimersAsync();
  await expect(promise).resolves.toBe("ok");
  expect(mockGenerateText).toHaveBeenCalledTimes(3);
  vi.useRealTimers();
});
```

**Note on `isRetriable` implementation:** Since `APICallError.isInstance()` may not return `true` for hand-crafted objects, implement `isRetriable()` to check `statusCode` and `isRetryable` as plain property reads (duck typing) rather than relying on `APICallError.isInstance()` exclusively. This makes the helper testable without real SDK error instances.

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
- [ ] `FALLBACK_MODEL_NAME` unset and same provider → `FALLBACK_MODELS` default used.
- [ ] `ollama` primary with no fallback configured → `PipelineError` if primary fails.
- [ ] `ollama` primary + `google` fallback + Ollama server not running → `ECONNREFUSED` triggers **immediate** fallback to Gemini (no retries, no backoff).
- [ ] `FALLBACK_MODEL_PROVIDER=google` but `GOOGLE_GENERATIVE_AI_API_KEY` missing → warning at startup, fallback disabled, server starts.
- [ ] `complete()` returns clean string (`generateText` returns `.text`).
- [ ] No API keys appear in any log output.

**Integration (local only, `RUN_INTEGRATION_TESTS=true`):**
- [ ] Ollama primary with real model → returns non-empty response.
- [ ] Ollama (bad model name) + Gemini fallback → Gemini responds, warn log fires. *(Note: Ollama may not throw `NoSuchModelError` for unknown models — assert on `console.warn` containing "fallback" rather than error type.)*
- [ ] Ollama (server down / ECONNREFUSED) + Gemini fallback → Gemini responds in < 5 s.
- [ ] Gemini primary direct → returns non-empty response.

