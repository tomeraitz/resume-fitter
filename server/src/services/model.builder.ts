import { type LanguageModel } from "ai";
import { createAnthropic } from "@ai-sdk/anthropic";
import { createOpenAI } from "@ai-sdk/openai";
import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { type SupportedProvider } from "./model.constants.js";
import { ModelConfigError } from "./model.errors.js";
import type { ProviderConfig } from "../types/model.types.js";

export function parseSupportedProvider(
  raw: string | undefined,
  varName: string,
): SupportedProvider {
  const supported: SupportedProvider[] = [
    "anthropic",
    "openai",
    "google",
    "ollama",
  ];
  if (!supported.includes(raw as SupportedProvider)) {
    throw new ModelConfigError(
      `${varName} must be one of: ${supported.join(", ")}. Got: ${JSON.stringify(raw)}`,
    );
  }
  return raw as SupportedProvider;
}

export function buildModel(config: ProviderConfig): LanguageModel {
  const { provider, modelName } = config;

  if (provider === "anthropic") {
    const apiKey = process.env["ANTHROPIC_API_KEY"];
    if (!apiKey)
      throw new ModelConfigError(
        "ANTHROPIC_API_KEY is required when MODEL_PROVIDER=anthropic",
      );
    return createAnthropic({ apiKey })(modelName);
  }

  if (provider === "openai") {
    const apiKey = process.env["OPENAI_API_KEY"];
    if (!apiKey)
      throw new ModelConfigError(
        "OPENAI_API_KEY is required when MODEL_PROVIDER=openai",
      );
    return createOpenAI({ apiKey })(modelName);
  }

  if (provider === "google") {
    const apiKey = process.env["GOOGLE_GENERATIVE_AI_API_KEY"];
    if (!apiKey)
      throw new ModelConfigError(
        "GOOGLE_GENERATIVE_AI_API_KEY is required when MODEL_PROVIDER=google",
      );
    return createGoogleGenerativeAI({ apiKey })(modelName);
  }

  // claude-proxy — speaks OpenAI-compatible protocol at /v1/chat/completions
  const baseURL = process.env["OLLAMA_BASE_URL"] ?? "http://localhost:8001";
  return createOpenAI({ baseURL, apiKey: "dummy" }).chat(modelName);
}
