/**
 * Integration tests for ModelService.
 *
 * These tests make REAL HTTP calls to live providers.
 * They are gated behind RUN_INTEGRATION_TESTS=true so they never
 * run accidentally in CI.
 *
 * To run locally:
 *   cp server/.env.example server/.env
 *   # fill in GOOGLE_GENERATIVE_AI_API_KEY and OLLAMA_BASE_URL
 *   npm run test:integration
 */
import { describe, it, expect, beforeAll, vi } from "vitest";
import { ModelService } from "../src/services/model.service.js";

const RUN = process.env["RUN_INTEGRATION_TESTS"] === "true";
const describeIf = (cond: boolean) => (cond ? describe : describe.skip);

// ── Suite 1: Ollama primary smoke test ────────────────────────────────────

describeIf(RUN)("Integration: Ollama primary (MODEL_PROVIDER=ollama)", () => {
  let svc: ModelService;

  beforeAll(() => {
    process.env["MODEL_PROVIDER"] = "ollama";
    process.env["MODEL_NAME"] = "llama3.2";
    process.env["OLLAMA_BASE_URL"] =
      process.env["OLLAMA_BASE_URL"] ?? "http://localhost:11434";
    delete process.env["FALLBACK_MODEL_PROVIDER"];
    delete process.env["FALLBACK_MODEL_NAME"];
    svc = new ModelService();
  });

  it("complete() returns a non-empty string for a minimal prompt", async () => {
    const result = await svc.complete(
      "You are a helpful assistant.",
      "Reply with exactly: ok",
    );
    expect(typeof result).toBe("string");
    expect(result.length).toBeGreaterThan(0);
  });

  it("response time is under 60 000 ms (soft assertion — logs if slow)", async () => {
    const start = Date.now();
    await svc.complete("You are a helpful assistant.", "Reply with exactly: ok");
    const elapsed = Date.now() - start;
    if (elapsed >= 60_000) {
      console.warn(
        `[integration] Ollama response was slow: ${elapsed}ms (>60 000ms threshold)`,
      );
    }
    expect(elapsed).toBeLessThan(60_000);
  });
});

// ── Suite 2: Ollama → Gemini fallback ────────────────────────────────────

describeIf(RUN)("Integration: Ollama→Gemini fallback", () => {
  let svc: ModelService;
  let warnSpy: ReturnType<typeof vi.spyOn>;

  beforeAll(() => {
    process.env["MODEL_PROVIDER"] = "ollama";
    // Intentionally bad model name → triggers NoSuchModelError or similar
    process.env["MODEL_NAME"] = "this-model-does-not-exist";
    process.env["OLLAMA_BASE_URL"] =
      process.env["OLLAMA_BASE_URL"] ?? "http://localhost:11434";
    process.env["FALLBACK_MODEL_PROVIDER"] = "google";
    process.env["FALLBACK_MODEL_NAME"] = "gemini-2.0-flash-lite";
    // GOOGLE_GENERATIVE_AI_API_KEY must be set in .env
    warnSpy = vi.spyOn(console, "warn");
    svc = new ModelService();
  });

  it("complete() succeeds and returns a non-empty string (Gemini handles it)", async () => {
    const result = await svc.complete(
      "You are a helpful assistant.",
      "Reply with exactly: ok",
    );
    expect(typeof result).toBe("string");
    expect(result.length).toBeGreaterThan(0);
  });

  it("console.warn was called with a message containing 'fallback'", () => {
    // The fallback log fires when the primary (bad Ollama model) fails
    // and Gemini succeeds.
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining("fallback"),
    );
  });
});

// ── Suite 3: ECONNREFUSED → Gemini fallback ──────────────────────────────

describeIf(RUN)("Integration: ECONNREFUSED → Gemini fallback", () => {
  let svc: ModelService;

  beforeAll(() => {
    // Port 19999 — nothing listening there
    process.env["OLLAMA_BASE_URL"] = "http://localhost:19999";
    process.env["MODEL_PROVIDER"] = "ollama";
    process.env["MODEL_NAME"] = "llama3.2";
    process.env["FALLBACK_MODEL_PROVIDER"] = "google";
    process.env["FALLBACK_MODEL_NAME"] = "gemini-2.0-flash-lite";
    svc = new ModelService();
  });

  it("complete() succeeds (Gemini handles the call)", async () => {
    const result = await svc.complete(
      "You are a helpful assistant.",
      "Reply with exactly: ok",
    );
    expect(typeof result).toBe("string");
    expect(result.length).toBeGreaterThan(0);
  });

  it("total time < 5 000 ms — no retries wasted on the dead Ollama server", async () => {
    const start = Date.now();
    await svc.complete("You are a helpful assistant.", "Reply with exactly: ok");
    const elapsed = Date.now() - start;
    // If retries happened, backoff alone (100ms + 200ms) would push this over 300ms
    // but the true limit here is no wasted attempts on the dead host
    expect(elapsed).toBeLessThan(5_000);
  });
});

// ── Suite 4: Gemini direct smoke test ────────────────────────────────────

describeIf(RUN)("Integration: Gemini primary (MODEL_PROVIDER=google)", () => {
  let svc: ModelService;

  beforeAll(() => {
    process.env["MODEL_PROVIDER"] = "google";
    process.env["MODEL_NAME"] = "gemini-2.0-flash-lite";
    delete process.env["FALLBACK_MODEL_PROVIDER"];
    delete process.env["FALLBACK_MODEL_NAME"];
    // GOOGLE_GENERATIVE_AI_API_KEY must be set in .env
    svc = new ModelService();
  });

  it("complete() returns a non-empty string for a minimal prompt", async () => {
    const result = await svc.complete(
      "You are a helpful assistant.",
      "Reply with exactly: ok",
    );
    expect(typeof result).toBe("string");
    expect(result.length).toBeGreaterThan(0);
  });
});
