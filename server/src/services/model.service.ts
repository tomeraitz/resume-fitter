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

// ── Cache metrics shape ─────────────────────────────────────────────────────

export interface CompletionMeta {
  text: string;
  cacheCreationTokens?: number;
  cacheReadTokens?: number;
}

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
    const meta = await this.completeWithMeta(systemPrompt, userPrompt);
    return meta.text;
  }

  /**
   * Like `complete()` but also returns Anthropic prompt-caching metrics.
   * For non-Anthropic providers or when caching is disabled, the token fields are undefined.
   */
  async completeWithMeta(systemPrompt: string, userPrompt: string): Promise<CompletionMeta> {
    let primaryError: unknown;
    try {
      return await this.withRetryMeta(this.primaryConfig, systemPrompt, userPrompt);
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
      const meta = await this.attemptCompletionMeta(
        this.fallbackConfig,
        systemPrompt,
        userPrompt,
      );
      this.logFallback(primaryError, this.primaryConfig, this.fallbackConfig);
      return meta;
    } catch (fallbackError) {
      throw new PipelineError(
        "Both primary and fallback models failed",
        fallbackError,
      );
    }
  }

  private async attemptCompletionMeta(
    config: ProviderConfig,
    systemPrompt: string,
    userPrompt: string,
  ): Promise<CompletionMeta> {
    const model = buildModel(config);

    if (config.provider === 'anthropic') {
      const result = await generateText({
        model,
        messages: [
          {
            role: 'user' as const,
            content: [
              {
                type: 'text' as const,
                text: systemPrompt,
                providerOptions: {
                  anthropic: { cacheControl: { type: 'ephemeral' } },
                },
              },
              {
                type: 'text' as const,
                text: userPrompt,
              },
            ],
          },
        ],
      });
      return {
        text: result.text,
        ...(result.usage.inputTokenDetails?.cacheWriteTokens != null && {
          cacheCreationTokens: result.usage.inputTokenDetails.cacheWriteTokens,
        }),
        ...(result.usage.inputTokenDetails?.cacheReadTokens != null && {
          cacheReadTokens: result.usage.inputTokenDetails.cacheReadTokens,
        }),
      };
    }

    const result = await generateText({
      model,
      system: systemPrompt,
      prompt: userPrompt,
    });
    return { text: result.text };
  }

  private async withRetryMeta(
    config: ProviderConfig,
    systemPrompt: string,
    userPrompt: string,
  ): Promise<CompletionMeta> {
    let lastError: unknown;
    for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
      try {
        return await this.attemptCompletionMeta(config, systemPrompt, userPrompt);
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
