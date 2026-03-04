# AI-WXT Expert Agent Memory

## Project Identity
- Monorepo: `resume-fitter/` with `extension/` (WXT+React) and `server/` (Node.js)
- Branch convention: feature branches off `main`
- Rules file: `.claude/docs/wxt-ai-rules.md` (NOT `.claude/rules/`)
- Structure plan: `.claude/plans/project-structure.md`

## Architecture Decisions (stable)
- Vercel AI SDK used ONLY on server — never imported in any WXT entrypoint/content script/popup
- `ModelService` singleton instantiated at module load in orchestrator, not per-request
- Provider resolved from `MODEL_PROVIDER` env var; no code changes to swap providers
- `FALLBACK_MODEL_PROVIDER` + `FALLBACK_MODEL_NAME` enable cross-provider fallback via env only
- All API keys in `server/.env` — extension holds only a short-lived JWT session token
- `host_permissions` scoped to job-posting domains + backend only — never LLM provider URLs

## ModelService Fallback Rules (from model-service-plan.md)
- Fatal (no retry, no fallback): `InvalidPromptError`, 400/401/403 `APICallError`
- Fatal for provider (skip retries, go to fallback): `NoSuchModelError`
- Retriable: 429, 5xx, network errors — max 2 retries, backoff 100ms*2^attempt, cap 4000ms
- Fallback attempted once only (no retry on fallback)
- Missing fallback key at startup → warning logged, fallback disabled, server still starts

## Key File Paths (server)
- `server/src/services/model.service.ts` — ModelService class
- `server/src/utils/model-helpers.ts` — sleep/backoff/isRetriable helpers (extracted to stay <300 lines)
- `server/src/types/pipeline.types.ts` — AgentResult, PipelineRequest, PipelineResponse
- `server/src/agents/orchestrator.ts` — runs 4-agent pipeline sequentially

## Provider Default Models
- anthropic: `claude-sonnet-4-6` / fallback `claude-haiku-4-5`
- openai: `gpt-4o` / fallback `gpt-4o-mini`
- google: `gemini-2.0-flash` / fallback `gemini-2.0-flash-lite`
- ollama: `llama3.2` / no same-provider fallback

## 300-Line Rule Enforcement
- If model.service.ts approaches limit, extract helpers to `utils/model-helpers.ts`
- Agents are functions (not classes) — stateless transformations, no class overhead

## Ollama Provider — CRITICAL
- `@ai-sdk/ollama` does NOT exist on npm (404). The wxt-ai-rules.md table is wrong on this point.
- Correct community package: `ollama-ai-provider-v2` (npm install ollama-ai-provider-v2)
- Import: `import { ollama } from "ollama-ai-provider-v2"` — use as `ollama("<modelName>")`
- No factory function (`createOllama`) — use the pre-built `ollama` instance directly

## Vercel AI SDK Type Corrections
- Model return type from provider factories is `LanguageModel` (from `"ai"`), NOT `LanguageModelV1`
- `LanguageModelV1` is an internal `@ai-sdk/provider` protocol type — do not use in app code
- `APICallError` must NOT be constructed directly in tests; use mock/factory pattern
- `PipelineError`: use `super(message, { cause })` (ES2022 built-in) — do NOT redeclare `cause` as a class field
- All error types (`APICallError`, `NoSuchModelError`, `InvalidPromptError`) import from `"ai"`
- `APICallError.isInstance(err)` is the correct type-narrowing pattern

## Package Version Reality (as of 2026-03-04)
- ai: 6.0.111 | @ai-sdk/anthropic: 3.0.54 | @ai-sdk/openai: 3.0.39 | @ai-sdk/google: 3.0.37
- express: 5.2.1 (v5 — breaking changes from v4) | vitest: 4.0.18 | typescript: 5.9.3
- Always verify with `npm view <pkg> version` before pinning; never trust plan-generated versions

## Detailed Notes
- See `.claude/plans/model-service-plan.md` for full implementation plan (Section 10 = review findings)
