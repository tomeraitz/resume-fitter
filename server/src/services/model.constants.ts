// ── Provider Types ──────────────────────────────────────────────────────────

export type SupportedProvider = "anthropic" | "openai" | "google" | "ollama";

// ── Retry Configuration ─────────────────────────────────────────────────────
// All values are configurable via environment variables.
// RETRY_MAX_ATTEMPTS   : number of retries after the initial attempt (default: 2 → 3 total calls)
// RETRY_BASE_BACKOFF_MS: initial backoff delay in ms, doubles each attempt (default: 100)
// RETRY_MAX_BACKOFF_MS : backoff ceiling in ms (default: 4000)

export const MAX_RETRIES = Number(process.env["RETRY_MAX_ATTEMPTS"] ?? "2");
export const BASE_BACKOFF_MS = Number(
  process.env["RETRY_BASE_BACKOFF_MS"] ?? "100",
);
export const MAX_BACKOFF_MS = Number(
  process.env["RETRY_MAX_BACKOFF_MS"] ?? "4000",
);

// ── Default Models Per Provider ─────────────────────────────────────────────
// Used when MODEL_NAME is not set. Override per provider via env:
//   ANTHROPIC_DEFAULT_MODEL, OPENAI_DEFAULT_MODEL,
//   GOOGLE_DEFAULT_MODEL,    OLLAMA_DEFAULT_MODEL

export const DEFAULT_MODELS: Record<SupportedProvider, string> = {
  anthropic: process.env["ANTHROPIC_DEFAULT_MODEL"] || "claude-sonnet-4-6",
  openai: process.env["OPENAI_DEFAULT_MODEL"] || "gpt-4o",
  google: process.env["GOOGLE_DEFAULT_MODEL"] || "gemini-2.0-flash",
  ollama: process.env["OLLAMA_DEFAULT_MODEL"] || "llama3.2",
};

// ── Same-Provider Fallback Models ───────────────────────────────────────────
// Used when FALLBACK_MODEL_PROVIDER is not set (implicit same-provider fallback).
// Override per provider via env:
//   ANTHROPIC_FALLBACK_MODEL, OPENAI_FALLBACK_MODEL,
//   GOOGLE_FALLBACK_MODEL,    OLLAMA_FALLBACK_MODEL
// Set to empty string to disable same-provider fallback for that provider.
// ollama has no cheaper local fallback by default (null → disabled).

export const FALLBACK_MODELS: Record<
  SupportedProvider,
  string | null
> = {
  anthropic: process.env["ANTHROPIC_FALLBACK_MODEL"] || "claude-haiku-4-5",
  openai: process.env["OPENAI_FALLBACK_MODEL"] || "gpt-4o-mini",
  google: process.env["GOOGLE_FALLBACK_MODEL"] || "gemini-2.0-flash-lite",
  ollama: process.env["OLLAMA_FALLBACK_MODEL"] || null,
};
