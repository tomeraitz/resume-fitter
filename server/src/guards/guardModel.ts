import { type LanguageModel } from "ai";
import { buildModel, parseSupportedProvider } from "../services/model.builder.js";

/**
 * Returns the LanguageModel instance configured for the chat guardrail.
 * Falls back to the primary MODEL_PROVIDER / MODEL_NAME when dedicated
 * GUARDRAIL_* env vars are not set.
 */
export function getGuardModel(): LanguageModel {
  const rawProvider =
    process.env["GUARDRAIL_MODEL_PROVIDER"] || process.env["MODEL_PROVIDER"];
  const provider = parseSupportedProvider(rawProvider, "GUARDRAIL_MODEL_PROVIDER");
  const modelName =
    process.env["GUARDRAIL_MODEL_NAME"] || process.env["MODEL_NAME"] || provider;
  return buildModel({ provider, modelName });
}
