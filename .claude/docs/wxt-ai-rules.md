# WXT + Vercel AI SDK Project Rules

## Code Quality

### OOP & Modularity
- Use **classes** for services (e.g., `ModelService`, `StorageService`) — one responsibility per class.
- **Max 300 lines per file.** Split into smaller modules when approaching the limit.
- Group by feature, not by type:
  ```
  entrypoints/     ← WXT entrypoints only (popup, background, content)
  services/        ← Business logic classes
  utils/           ← Pure helper functions
  types/           ← Shared TypeScript interfaces/types
  ```
- Use `interface` for data shapes, `class` for stateful services.
- Export only what is needed — keep internals private.
- Prefer named exports over default exports for better refactoring.

### TypeScript
- Strict mode enabled (`"strict": true` in tsconfig).
- No `any` — use `unknown` and narrow with type guards.
- Use WXT's built-in typed storage (`storage.defineItem<T>()`) instead of raw `localStorage`.

---

## Security

### API Key Handling
- **Never hardcode API keys** in source code or commit them to git.
- All provider API keys live **exclusively in `server/.env`** — never sent to the browser.
- The extension holds only a short-lived session token (JWT) — never a provider API key.
- `ModelService` reads the active provider and key from env vars at startup; validate key existence before making any API call.
- The Vercel AI SDK is **only ever used on the backend server** — never imported in extension code.

### Content Security Policy (MV3)
- No `eval()`, `new Function()`, or `unsafe-eval` — MV3 forbids them.
- No remote script loading — all code must be bundled at build time.
- `host_permissions` scoped to job-posting domains + your backend server only — **not** to any LLM provider API directly.

### Messaging & Permissions
- Use WXT's typed messaging (`defineBackground`, `onMessage`) — never `window.postMessage` between extension contexts.
- Validate and sanitize all data received from content scripts before using it.
- Request only the **minimum permissions** required in `manifest`.
- No logging of sensitive data (API keys, user text) in production.

### Supply Chain
- Pin dependency versions in `package.json` (avoid `^` for critical packages).
- Audit regularly: `npm audit` before releases.

---

## Simple & Easy Solutions

- **Prefer built-in WXT APIs** over custom wrappers (storage, messaging, permissions).
- **Avoid premature abstraction** — don't build a generic system for a single use case.
- Each function does one thing and has a name that explains it.
- Streaming responses from LLM providers should be handled on the **backend server** and progress relayed to the UI via WXT messaging — keeps UI logic simple.
- Prefer `async/await` over `.then()` chains.
- Use early returns to reduce nesting depth (max 3 levels).
- Switch LLM providers by changing `MODEL_PROVIDER` + `MODEL_NAME` env vars — no code changes required.

---

## Provider Configuration

| `MODEL_PROVIDER` | Package | Example `MODEL_NAME` |
|---|---|---|
| `anthropic` | `@ai-sdk/anthropic` | `claude-sonnet-4-6` |
| `openai` | `@ai-sdk/openai` | `gpt-4o` |
| `google` | `@ai-sdk/google` | `gemini-2.0-flash` |
| `ollama` | `@ai-sdk/ollama` | `llama3.2` |

---

## Sources
- [WXT Framework](https://wxt.dev/)
- [Vercel AI SDK Docs](https://sdk.vercel.ai/docs)
- [Vercel AI SDK Providers](https://sdk.vercel.ai/providers/ai-sdk-providers)
- [MV3 Content Security Policy — Chrome Developers](https://developer.chrome.com/docs/extensions/mv3/manifest/content_security_policy/)
- [Browser Extension Security Risks](https://layerxsecurity.com/learn/browser-extension/)
- [Building AI-Powered Browser Extensions With WXT](https://marmelab.com/blog/2025/04/15/browser-extension-form-ai-wxt.html)
