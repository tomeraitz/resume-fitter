import { generateText, InvalidPromptError } from "ai";
import {
  sleep,
  backoffMs,
  isRetriable,
  isFatalForProvider,
} from "../utils/model-helpers.js";
import {
  type SupportedProvider,
  MAX_RETRIES,
  DEFAULT_MODELS,
  FALLBACK_MODELS,
} from "./model.constants.js";
import { parseSupportedProvider, buildModel } from "./model.builder.js";
import { ModelConfigError, PipelineError } from "./model.errors.js";
import type { ProviderConfig } from "../types/model.types.js";

export { ModelConfigError, PipelineError };

// ── ModelService ───────────────────────────────────────────────────────────

export class ModelService {
  private readonly primaryConfig: ProviderConfig;
  private readonly fallbackConfig: ProviderConfig | null;

  constructor() {
    const rawProvider = process.env["MODEL_PROVIDER"];
    if (!rawProvider)
      throw new ModelConfigError("MODEL_PROVIDER env var is required");

    const provider = parseSupportedProvider(rawProvider, "MODEL_PROVIDER");
    const modelName = process.env["MODEL_NAME"] ?? DEFAULT_MODELS[provider] ?? provider;
    this.primaryConfig = { provider, modelName };

    // Validate primary API key at construction time — fail fast at startup
    buildModel(this.primaryConfig);

    this.fallbackConfig = this.resolveFallbackConfig();
  }

  /** Main public API. Returns the model's text response. */
  async complete(systemPrompt: string, userPrompt: string): Promise<string> {
    let primaryError: unknown;
    try {
      return await this.withRetry(this.primaryConfig, systemPrompt, userPrompt);
    } catch (err) {
      primaryError = err;
    }

    // Non-retriable, non-provider-fatal errors (e.g. InvalidPromptError, 400/401/403) — do not fallback
    if (!isRetriable(primaryError) && !isFatalForProvider(primaryError)) throw primaryError;

    if (this.fallbackConfig === null) {
      throw new PipelineError(
        "Primary model failed, no fallback configured",
        primaryError,
      );
    }

    try {
      const text = await this.attemptCompletion(
        this.fallbackConfig,
        systemPrompt,
        userPrompt,
      );
      this.logFallback(primaryError, this.primaryConfig, this.fallbackConfig);
      return text;
    } catch (fallbackError) {
      throw new PipelineError(
        "Both primary and fallback models failed",
        fallbackError,
      );
    }
  }

  private async attemptCompletion(
    config: ProviderConfig,
    systemPrompt: string,
    userPrompt: string,
  ): Promise<string> {
    const model = buildModel(config);
    const result = await generateText({
      model,
      system: systemPrompt,
      prompt: userPrompt,
    });
    return result.text;
  }

  private async withRetry(
    config: ProviderConfig,
    systemPrompt: string,
    userPrompt: string,
  ): Promise<string> {
    let lastError: unknown;
    for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
      try {
        return await this.attemptCompletion(config, systemPrompt, userPrompt);
      } catch (err) {
        lastError = err;
        if (err instanceof InvalidPromptError) throw err;
        if (isFatalForProvider(err)) throw err;
        if (isRetriable(err) && attempt < MAX_RETRIES) {
          await sleep(backoffMs(attempt));
        } else if (!isRetriable(err)) {
          throw err;
        }
        // retriable on last attempt: fall through → loop ends → throw lastError
      }
    }
    throw lastError;
  }

  private resolveFallbackConfig(): ProviderConfig | null {
    const rawFallbackProvider = process.env["FALLBACK_MODEL_PROVIDER"];

    if (rawFallbackProvider) {
      let fallbackProvider: SupportedProvider;
      try {
        fallbackProvider = parseSupportedProvider(
          rawFallbackProvider,
          "FALLBACK_MODEL_PROVIDER",
        );
      } catch {
        console.warn(
          "[ModelService] FALLBACK_MODEL_PROVIDER is invalid — fallback disabled",
        );
        return null;
      }

      const fallbackModelName =
        process.env["FALLBACK_MODEL_NAME"] ?? DEFAULT_MODELS[fallbackProvider] ?? fallbackProvider;

      // Validate fallback key exists — gracefully degrade if missing
      try {
        buildModel({ provider: fallbackProvider, modelName: fallbackModelName });
      } catch {
        console.warn(
          `[ModelService] Fallback provider "${fallbackProvider}" API key is missing — cross-provider fallback disabled`,
        );
        return null;
      }

      return { provider: fallbackProvider, modelName: fallbackModelName };
    }

    // No explicit fallback provider — derive same-provider fallback
    const sameProviderFallback =
      FALLBACK_MODELS[this.primaryConfig.provider];
    if (sameProviderFallback === null) {
      // ollama has no cheaper local fallback
      return null;
    }

    const fallbackModelName =
      process.env["FALLBACK_MODEL_NAME"] ?? sameProviderFallback;
    return { provider: this.primaryConfig.provider, modelName: fallbackModelName };
  }

  private logFallback(
    primaryError: unknown,
    primaryConfig: ProviderConfig,
    fallbackConfig: ProviderConfig,
  ): void {
    const errMsg =
      primaryError instanceof Error
        ? primaryError.message
        : String(primaryError);
    console.warn(
      `[ModelService] fallback triggered — ` +
        `primary: ${primaryConfig.provider}/${primaryConfig.modelName}, ` +
        `fallback: ${fallbackConfig.provider}/${fallbackConfig.modelName}, ` +
        `error: ${errMsg}`,
    );
  }
}
