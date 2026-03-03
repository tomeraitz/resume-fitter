# WXT + Anthropic Project Rules

## Code Quality

### OOP & Modularity
- Use **classes** for services (e.g., `AnthropicService`, `StorageService`) — one responsibility per class.
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
- Store the user's API key in WXT secure storage (`storage.defineItem`, `local` area) — never in `sessionStorage` or plain cookies.
- Use `dangerouslyAllowBrowser: true` only in the **background service worker**, never in content scripts.
- Validate that the key exists and has the correct format before making any API call.

### Content Security Policy (MV3)
- No `eval()`, `new Function()`, or `unsafe-eval` — MV3 forbids them.
- No remote script loading — all code must be bundled at build time.
- Restrict `host_permissions` to only the domains the extension actually needs (e.g., `https://api.anthropic.com/*`).

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
- Streaming responses from Anthropic should be handled in the **background** service worker and sent to the UI via WXT messaging — keeps UI logic simple.
- Prefer `async/await` over `.then()` chains.
- Use early returns to reduce nesting depth (max 3 levels).

### Anthropic SDK Pattern (background only)
```ts
// constants/anthropic.ts
export const ANTHROPIC_MODEL = "claude-sonnet-4-6" as const;
export const ANTHROPIC_MAX_TOKENS = 1024;
export const MESSAGE_ROLE = {
  USER: "user",
  ASSISTANT: "assistant",
} as const;
export const CONTENT_TYPE = {
  TEXT: "text",
} as const;

// services/anthropic.service.ts
import Anthropic from "@anthropic-ai/sdk";
import { storage } from "wxt/storage";
import {
  ANTHROPIC_MODEL,
  ANTHROPIC_MAX_TOKENS,
  MESSAGE_ROLE,
  CONTENT_TYPE,
} from "../constants/anthropic";

const apiKeyItem = storage.defineItem<string>("local:apiKey");

export class AnthropicService {
  private async getClient(): Promise<Anthropic> {
    const key = await apiKeyItem.getValue();
    if (!key) throw new Error("API key not set");
    return new Anthropic({ apiKey: key, dangerouslyAllowBrowser: true });
  }

  async complete(prompt: string): Promise<string> {
    const client = await this.getClient();
    const msg = await client.messages.create({
      model: ANTHROPIC_MODEL,
      max_tokens: ANTHROPIC_MAX_TOKENS,
      messages: [{ role: MESSAGE_ROLE.USER, content: prompt }],
    });
    const first = msg.content[0];
    return first.type === CONTENT_TYPE.TEXT ? first.text : "";
  }
}
```

---

## Sources
- [WXT Framework](https://wxt.dev/)
- [Anthropic API Key Best Practices](https://support.claude.com/en/articles/9767949-api-key-best-practices-keeping-your-keys-safe-and-secure)
- [MV3 Content Security Policy — Chrome Developers](https://developer.chrome.com/docs/extensions/mv3/manifest/content_security_policy/)
- [Browser Extension Security Risks](https://layerxsecurity.com/learn/browser-extension/)
- [Building AI-Powered Browser Extensions With WXT](https://marmelab.com/blog/2025/04/15/browser-extension-form-ai-wxt.html)
