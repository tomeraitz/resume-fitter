import process from "process";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  ModelService,
  ModelConfigError,
  PipelineError,
} from "../src/services/model.service.js";
import {
  isRetriable,
  isFatalForProvider,
} from "../src/utils/model-helpers.js";
import { InvalidPromptError, NoSuchModelError } from "ai";

vi.mock("ai", async (importOriginal) => {
  const actual = await importOriginal<typeof import("ai")>();
  return { ...actual, generateText: vi.fn() };
});

// Import after mock so vi.mocked() wraps the mock correctly
const { generateText } = await import("ai");
const mockGenerateText = vi.mocked(generateText);

// ── Helpers ────────────────────────────────────────────────────────────────

/** Creates a duck-typed error that isRetriable() can detect by statusCode. */
function makeApiError(
  statusCode: number,
): Error & { statusCode: number; isRetryable: boolean } {
  return Object.assign(new Error(`HTTP ${statusCode}`), {
    statusCode,
    isRetryable: statusCode === 429 || statusCode >= 500,
  });
}

function makeNetworkError(code: "ECONNREFUSED" | "ENOTFOUND" | "ECONNRESET" | "ETIMEDOUT"): Error {
  return new Error(code);
}

function makeGenerateTextResult(text: string) {
  return { text } as any;
}

/**
 * Sets required env vars and constructs a ModelService.
 * Defaults to anthropic primary. Pass overrides to change any env var.
 */
function makeService(overrides: Record<string, string | undefined> = {}): ModelService {
  process.env["MODEL_PROVIDER"] = "anthropic";
  process.env["ANTHROPIC_API_KEY"] = "sk-ant-test-key";
  Object.assign(process.env, overrides);
  return new ModelService();
}

// ── Setup ──────────────────────────────────────────────────────────────────

beforeEach(() => {
  delete process.env["MODEL_PROVIDER"];
  delete process.env["MODEL_NAME"];
  delete process.env["ANTHROPIC_API_KEY"];
  delete process.env["OPENAI_API_KEY"];
  delete process.env["GOOGLE_GENERATIVE_AI_API_KEY"];
  delete process.env["FALLBACK_MODEL_PROVIDER"];
  delete process.env["FALLBACK_MODEL_NAME"];
  mockGenerateText.mockReset();
});

afterEach(() => {
  vi.useRealTimers();
});

// ── Constructor ────────────────────────────────────────────────────────────

describe("ModelService — constructor", () => {
  it("throws ModelConfigError when MODEL_PROVIDER is missing", () => {
    expect(() => new ModelService()).toThrow(ModelConfigError);
  });

  it("throws ModelConfigError when primary API key is missing", () => {
    process.env["MODEL_PROVIDER"] = "anthropic";
    // ANTHROPIC_API_KEY not set
    expect(() => new ModelService()).toThrow(ModelConfigError);
  });

  it("throws ModelConfigError for unsupported MODEL_PROVIDER value", () => {
    process.env["MODEL_PROVIDER"] = "unsupported-llm";
    process.env["ANTHROPIC_API_KEY"] = "sk-ant-test";
    expect(() => new ModelService()).toThrow(ModelConfigError);
  });

  it("logs warning and disables fallback when FALLBACK_MODEL_PROVIDER key is missing", () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    process.env["MODEL_PROVIDER"] = "anthropic";
    process.env["ANTHROPIC_API_KEY"] = "sk-ant-test";
    process.env["FALLBACK_MODEL_PROVIDER"] = "openai";
    // OPENAI_API_KEY not set

    const svc = new ModelService();
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining("openai"),
    );
    // Service still starts — does not throw
    expect(svc).toBeInstanceOf(ModelService);
    warnSpy.mockRestore();
  });

  it("uses DEFAULT_MODELS when MODEL_NAME is not set", () => {
    process.env["MODEL_PROVIDER"] = "anthropic";
    process.env["ANTHROPIC_API_KEY"] = "sk-ant-test";
    // MODEL_NAME not set — should not throw
    expect(() => new ModelService()).not.toThrow();
  });

  it("uses FALLBACK_MODELS when FALLBACK_MODEL_PROVIDER not set (anthropic)", () => {
    process.env["MODEL_PROVIDER"] = "anthropic";
    process.env["ANTHROPIC_API_KEY"] = "sk-ant-test";
    // No FALLBACK_MODEL_PROVIDER — same-provider fallback (claude-haiku-4-5)
    const svc = new ModelService();
    expect(svc).toBeInstanceOf(ModelService);
  });

  it("sets fallbackConfig = null for ollama primary with no FALLBACK_MODEL_PROVIDER", () => {
    process.env["MODEL_PROVIDER"] = "ollama";
    // ollama needs no API key
    // No FALLBACK_MODEL_PROVIDER — same-provider fallback for ollama is null
    const svc = new ModelService();
    expect(svc).toBeInstanceOf(ModelService);
  });
});

// ── Happy path ─────────────────────────────────────────────────────────────

describe("ModelService.complete() — happy path", () => {
  it("returns text from generateText on first attempt", async () => {
    mockGenerateText.mockResolvedValueOnce(makeGenerateTextResult("Hello, world!"));
    const svc = makeService();
    await expect(svc.complete("system", "user")).resolves.toBe("Hello, world!");
    expect(mockGenerateText).toHaveBeenCalledTimes(1);
  });
});

// ── Fatal errors ───────────────────────────────────────────────────────────

describe("ModelService.complete() — fatal errors (no retry, no fallback)", () => {
  it("rethrows InvalidPromptError immediately without fallback", async () => {
    const err = new InvalidPromptError({ prompt: "bad", message: "invalid" });
    mockGenerateText.mockRejectedValueOnce(err);
    const svc = makeService();
    await expect(svc.complete("sys", "usr")).rejects.toThrow(InvalidPromptError);
    expect(mockGenerateText).toHaveBeenCalledTimes(1);
  });

  it("rethrows APICallError 401 immediately (no retry)", async () => {
    mockGenerateText.mockRejectedValueOnce(makeApiError(401));
    const svc = makeService();
    await expect(svc.complete("sys", "usr")).rejects.toThrow("HTTP 401");
    expect(mockGenerateText).toHaveBeenCalledTimes(1);
  });

  it("rethrows APICallError 403 immediately (no retry)", async () => {
    mockGenerateText.mockRejectedValueOnce(makeApiError(403));
    const svc = makeService();
    await expect(svc.complete("sys", "usr")).rejects.toThrow("HTTP 403");
    expect(mockGenerateText).toHaveBeenCalledTimes(1);
  });

  it("rethrows APICallError 400 immediately (no retry)", async () => {
    mockGenerateText.mockRejectedValueOnce(makeApiError(400));
    const svc = makeService();
    await expect(svc.complete("sys", "usr")).rejects.toThrow("HTTP 400");
    expect(mockGenerateText).toHaveBeenCalledTimes(1);
  });
});

// ── Fatal-for-provider ─────────────────────────────────────────────────────

describe("ModelService.complete() — fatal-for-provider (skip retries, use fallback)", () => {
  it("NoSuchModelError → falls back after 0 retries, generateText called exactly twice", async () => {
    const nsme = new NoSuchModelError({ modelId: "bad-model", modelType: "languageModel" });
    mockGenerateText
      .mockRejectedValueOnce(nsme)
      .mockResolvedValueOnce(makeGenerateTextResult("fallback ok"));
    const svc = makeService({
      FALLBACK_MODEL_PROVIDER: "openai",
      OPENAI_API_KEY: "sk-test",
    });
    await expect(svc.complete("sys", "usr")).resolves.toBe("fallback ok");
    expect(mockGenerateText).toHaveBeenCalledTimes(2);
  });

  it("ECONNREFUSED → falls back after 0 retries, generateText called exactly twice", async () => {
    mockGenerateText
      .mockRejectedValueOnce(makeNetworkError("ECONNREFUSED"))
      .mockResolvedValueOnce(makeGenerateTextResult("fallback ok"));
    const svc = makeService({
      FALLBACK_MODEL_PROVIDER: "openai",
      OPENAI_API_KEY: "sk-test",
    });
    await expect(svc.complete("sys", "usr")).resolves.toBe("fallback ok");
    expect(mockGenerateText).toHaveBeenCalledTimes(2);
  });

  it("ENOTFOUND → falls back after 0 retries, generateText called exactly twice", async () => {
    mockGenerateText
      .mockRejectedValueOnce(makeNetworkError("ENOTFOUND"))
      .mockResolvedValueOnce(makeGenerateTextResult("fallback ok"));
    const svc = makeService({
      FALLBACK_MODEL_PROVIDER: "openai",
      OPENAI_API_KEY: "sk-test",
    });
    await expect(svc.complete("sys", "usr")).resolves.toBe("fallback ok");
    expect(mockGenerateText).toHaveBeenCalledTimes(2);
  });
});

// ── Retriable errors ───────────────────────────────────────────────────────

describe("ModelService.complete() — retriable errors", () => {
  it("APICallError 429 → retries 2x with backoff, succeeds on 3rd primary attempt", async () => {
    vi.useFakeTimers();
    mockGenerateText
      .mockRejectedValueOnce(makeApiError(429))
      .mockRejectedValueOnce(makeApiError(429))
      .mockResolvedValueOnce(makeGenerateTextResult("ok after retries"));

    const svc = makeService();
    const promise = svc.complete("sys", "usr");
    await vi.runAllTimersAsync();
    await expect(promise).resolves.toBe("ok after retries");
    expect(mockGenerateText).toHaveBeenCalledTimes(3);
  });

  it("APICallError 500 → retries 2x with backoff, then falls to fallback (4 total calls)", async () => {
    vi.useFakeTimers();
    mockGenerateText
      .mockRejectedValueOnce(makeApiError(500))
      .mockRejectedValueOnce(makeApiError(500))
      .mockRejectedValueOnce(makeApiError(500))
      .mockResolvedValueOnce(makeGenerateTextResult("fallback result"));

    const svc = makeService({
      FALLBACK_MODEL_PROVIDER: "openai",
      OPENAI_API_KEY: "sk-test",
    });
    const promise = svc.complete("sys", "usr");
    await vi.runAllTimersAsync();
    await expect(promise).resolves.toBe("fallback result");
    expect(mockGenerateText).toHaveBeenCalledTimes(4);
  });

  it("fallback success → returns text and logs console.warn", async () => {
    vi.useFakeTimers();
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    mockGenerateText
      .mockRejectedValueOnce(makeApiError(429))
      .mockRejectedValueOnce(makeApiError(429))
      .mockRejectedValueOnce(makeApiError(429))
      .mockResolvedValueOnce(makeGenerateTextResult("from fallback"));

    const svc = makeService({
      FALLBACK_MODEL_PROVIDER: "openai",
      OPENAI_API_KEY: "sk-test",
    });
    const promise = svc.complete("sys", "usr");
    await vi.runAllTimersAsync();
    await expect(promise).resolves.toBe("from fallback");
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining("fallback"));
    warnSpy.mockRestore();
  });
});

// ── Fallback exhaustion ────────────────────────────────────────────────────

describe("ModelService.complete() — fallback exhaustion", () => {
  it("primary fails + fallback fails → throws PipelineError", async () => {
    vi.useFakeTimers();
    mockGenerateText
      .mockRejectedValueOnce(makeApiError(429))
      .mockRejectedValueOnce(makeApiError(429))
      .mockRejectedValueOnce(makeApiError(429))
      .mockRejectedValueOnce(new Error("fallback also failed"));

    const svc = makeService({
      FALLBACK_MODEL_PROVIDER: "openai",
      OPENAI_API_KEY: "sk-test",
    });
    const promise = svc.complete("sys", "usr");
    promise.catch(() => {}); // prevent unhandled rejection warning before timers run
    await vi.runAllTimersAsync();
    await expect(promise).rejects.toThrow(PipelineError);
  });

  it("primary fails + no fallback configured → throws PipelineError", async () => {
    vi.useFakeTimers();
    mockGenerateText.mockRejectedValue(makeApiError(429));

    // ollama has no same-provider fallback and no cross-provider fallback set
    process.env["MODEL_PROVIDER"] = "ollama";
    const svc = new ModelService();
    const promise = svc.complete("sys", "usr");
    promise.catch(() => {}); // prevent unhandled rejection warning before timers run
    await vi.runAllTimersAsync();
    await expect(promise).rejects.toThrow(PipelineError);
  });

  it("PipelineError.cause contains the original error", async () => {
    vi.useFakeTimers();
    const rootCause = new Error("fallback also bombed");
    mockGenerateText
      .mockRejectedValue(makeApiError(429)) // primary always fails
      .mockRejectedValueOnce(rootCause); // but only 3 primary rejections registered above

    // Easier: use a fatal-for-provider error so we skip straight to fallback
    const nsme = new NoSuchModelError({ modelId: "x", modelType: "languageModel" });
    mockGenerateText.mockReset();
    mockGenerateText
      .mockRejectedValueOnce(nsme)
      .mockRejectedValueOnce(rootCause);

    const svc = makeService({
      FALLBACK_MODEL_PROVIDER: "openai",
      OPENAI_API_KEY: "sk-test",
    });
    const promise = svc.complete("sys", "usr");
    promise.catch(() => {}); // prevent unhandled rejection warning before timers run
    await vi.runAllTimersAsync();
    const err = await promise.catch((e: unknown) => e);
    expect(err).toBeInstanceOf(PipelineError);
    expect((err as PipelineError).cause).toBe(rootCause);
  });
});

// ── model-helpers unit tests ───────────────────────────────────────────────

describe("model-helpers — isRetriable", () => {
  it("returns true for status 429", () => {
    expect(isRetriable(makeApiError(429))).toBe(true);
  });

  it("returns true for status 500", () => {
    expect(isRetriable(makeApiError(500))).toBe(true);
  });

  it("returns true for status 503", () => {
    expect(isRetriable(makeApiError(503))).toBe(true);
  });

  it("returns false for status 400", () => {
    expect(isRetriable(makeApiError(400))).toBe(false);
  });

  it("returns false for status 401", () => {
    expect(isRetriable(makeApiError(401))).toBe(false);
  });

  it("returns false for status 403", () => {
    expect(isRetriable(makeApiError(403))).toBe(false);
  });

  it("returns false for InvalidPromptError", () => {
    expect(isRetriable(new InvalidPromptError({ prompt: "x", message: "bad" }))).toBe(false);
  });

  it("returns true for ECONNRESET", () => {
    expect(isRetriable(makeNetworkError("ECONNRESET"))).toBe(true);
  });

  it("returns true for ETIMEDOUT", () => {
    expect(isRetriable(makeNetworkError("ETIMEDOUT"))).toBe(true);
  });
});

describe("model-helpers — isFatalForProvider", () => {
  it("returns true for NoSuchModelError", () => {
    expect(
      isFatalForProvider(new NoSuchModelError({ modelId: "x", modelType: "languageModel" })),
    ).toBe(true);
  });

  it("returns true for ECONNREFUSED", () => {
    expect(isFatalForProvider(makeNetworkError("ECONNREFUSED"))).toBe(true);
  });

  it("returns true for ENOTFOUND", () => {
    expect(isFatalForProvider(makeNetworkError("ENOTFOUND"))).toBe(true);
  });

  it("returns false for retriable APICallError 429", () => {
    expect(isFatalForProvider(makeApiError(429))).toBe(false);
  });

  it("returns false for retriable APICallError 500", () => {
    expect(isFatalForProvider(makeApiError(500))).toBe(false);
  });
});
