import { NoSuchModelError, InvalidPromptError } from "ai";
import { BASE_BACKOFF_MS, MAX_BACKOFF_MS } from "../services/model.constants.js";

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function backoffMs(attempt: number): number {
  return Math.min(BASE_BACKOFF_MS * 2 ** attempt, MAX_BACKOFF_MS);
}

/**
 * Returns true for errors that are safe to retry:
 *   - Rate limit (429) or server-side errors (5xx)
 *   - Errors with isRetryable=true from the SDK
 *   - Transient network errors (ECONNRESET, ETIMEDOUT)
 *
 * Returns false (fatal) for:
 *   - InvalidPromptError — our bug, surface immediately
 *   - Client errors (400, 401, 403) — bad key, bad request
 *   - NoSuchModelError — wrong model name
 *   - Anything else unknown
 *
 * Uses duck typing on statusCode/isRetryable so it works with both
 * real SDK error instances and hand-crafted test objects.
 */
export function isRetriable(error: unknown): boolean {
  if (error instanceof InvalidPromptError) return false;
  if (error instanceof NoSuchModelError) return false;

  if (error !== null && typeof error === "object") {
    const e = error as Record<string, unknown>;
    if (typeof e["statusCode"] === "number") {
      const code = e["statusCode"];
      if (code === 400 || code === 401 || code === 403) return false;
      if (code === 429 || code >= 500) return true;
      if (e["isRetryable"] === true) return true;
      return false;
    }
    // APICallError without statusCode but with isRetryable flag
    if (e["isRetryable"] === true) return true;
  }

  // Transient network errors that are not classified as APICallError
  if (error instanceof Error) {
    const msg = error.message;
    if (msg.includes("ECONNRESET") || msg.includes("ETIMEDOUT")) return true;
  }

  return false;
}

/**
 * Returns true for errors that are fatal for the current provider and
 * should skip retries entirely (go straight to fallback):
 *   - NoSuchModelError — wrong model name, retrying won't help
 *   - ECONNREFUSED / ENOTFOUND — provider host is unreachable
 */
export function isFatalForProvider(error: unknown): boolean {
  if (error instanceof NoSuchModelError) return true;

  if (error instanceof Error) {
    const msg = error.message;
    if (msg.includes("ECONNREFUSED") || msg.includes("ENOTFOUND")) return true;
  }

  return false;
}
