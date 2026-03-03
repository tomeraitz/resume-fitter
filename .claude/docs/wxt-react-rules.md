# WXT + React Project Rules

## Code Quality

- **OOP & modularity**: Each class/component has a single responsibility. Avoid god objects or monolithic files.
- **Max 300 lines per file**: Split large files into focused modules. Extract hooks, utilities, and types into separate files.
- **Entrypoint structure**: Organize by WXT entrypoint type — `entrypoints/popup/`, `entrypoints/content/`, `entrypoints/background/`. Keep entrypoints thin; delegate logic to hooks and services.
- **Shared code**: Put reusable logic in `utils/`, UI components in `components/`, and custom hooks in `hooks/`. Never duplicate across entrypoints.
- **Use `browser.*` not `chrome.*`**: WXT provides a cross-browser `browser` global — use it everywhere for compatibility.
- **TypeScript strict mode**: Enable `strict: true`. Type all API responses and message payloads explicitly.
- **State persistence**: Do not hold state in memory in background service workers — they terminate after ~5 min. Use `chrome.storage` or `browser.storage` for persistence.

## Security

- **Never hardcode API keys**: API keys must not appear in source code or be bundled into the extension. Use `chrome.storage.local` to store user-provided keys at runtime.
- **Minimal permissions**: Request only the permissions the extension actually uses. Start with the smallest set (`tabs`, `scripting`, `storage`) and justify each addition.
- **Content Security Policy (CSP)**: Configure CSP in `wxt.config.ts` under `manifest`. Restrict `script-src` to `'self'` and only explicitly needed external origins.
- **Input validation**: Validate and sanitize all data received from the DOM, messages, or LLM responses before use. Use Zod for structured LLM output validation.
- **Content script isolation**: Never trust page content. Use the `scripting` API to inject scripts into tabs rather than direct DOM access from a popup.
- **No `eval` or `innerHTML`**: Both violate MV3 CSP and are injection vectors. Use `textContent` or React rendering instead.
- **Anthropic SDK in background only**: Call the Anthropic API only from the background service worker, never from content scripts (avoids key exposure in page context).

## Simple & Easy Solutions

- **Prefer built-ins**: Use native browser APIs and WXT's auto-imports before reaching for third-party libraries.
- **Flat over nested**: Avoid deeply nested component trees or overly abstracted class hierarchies. If a helper is only used once, inline it.
- **No premature abstraction**: Don't create shared utilities until the pattern appears at least twice. Three similar lines is better than a wrong abstraction.
- **Small, focused hooks**: Each custom hook does one thing (e.g., `useFillForm`, `useClaudeStream`). Keep UI components as presentational as possible.
- **Token budget awareness**: Truncate DOM/HTML payloads before sending to the API. Limit input to ~100k characters to stay within model context limits and control cost.
- **Structured LLM output**: Use Zod schemas to define expected response shapes — avoids brittle string parsing and makes failures explicit.
- **Avoid over-engineering**: No feature flags, backwards-compat shims, or speculative abstractions. Build for current requirements only.
