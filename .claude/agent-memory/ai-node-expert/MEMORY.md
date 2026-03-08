# AI Node Expert Memory

## Project Architecture
- Server: `server/src/` — Express + Vercel AI SDK (`ai` v6, `@ai-sdk/anthropic` v3)
- 4-agent pipeline: hiring-manager → rewrite-resume → ats-scanner → verifier
- Orchestrator: `server/src/agents/orchestrator.ts`
- Model service: `server/src/services/model.service.ts` (class with `complete()` and `completeWithMeta()`)
- Route: `server/src/routes/pipeline.ts`

## Key File Paths
- `server/src/services/model.service.ts` — ModelService, CompletionMeta type
- `server/src/services/model.constants.ts` — SupportedProvider, DEFAULT_MODELS, FALLBACK_MODELS, MAX_RETRIES
- `server/src/services/model.builder.ts` — buildModel(), parseSupportedProvider()
- `server/src/services/model.errors.ts` — ModelConfigError, PipelineError
- `server/src/utils/html-helpers.ts` — stripHtml()
- `server/src/types/pipeline.types.ts` — AgentResult, PipelineRequest, PipelineResponse
- `server/src/types/model.types.ts` — ProviderConfig

## Vercel AI SDK v6 Patterns
- Cache metrics live in `result.usage.inputTokenDetails.cacheReadTokens` and `.cacheWriteTokens` (NOT `experimental_providerMetadata`)
- `result.providerMetadata` exists but cache tokens come from the standard usage shape
- Anthropic prompt caching: pass system as a `TextPart` in `messages[0].content` with `providerOptions: { anthropic: { cacheControl: { type: 'ephemeral' } } }` — do NOT use the `system` param when caching
- `TextPart` supports `providerOptions` field (from `@ai-sdk/provider-utils`)

## Feature Flags (all default false)
- `OPTIMIZATION_HTML_STRIP` — strips HTML in hiring-manager before LLM call
- `OPTIMIZATION_PROMPT_CACHING` — Anthropic ephemeral cache on system prompt
- `OPTIMIZATION_SSE` — enables SSE streaming on `/pipeline` route

## Test Patterns
- Vitest mocks with `vi.mock()` + `await import()` after mock hoisting
- `toHaveBeenCalledWith` with `expect.anything()` does NOT match `undefined` — use `mock.calls[0]?.[argIndex]` for precise arg inspection when optional args may be undefined
- Benchmark tests gated by `RUN_BENCHMARK_TESTS=true`, use `describe.skip` pattern
- Integration tests gated by `RUN_INTEGRATION_TESTS=true`
