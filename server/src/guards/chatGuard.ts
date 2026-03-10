import { z } from "zod";
import { generateText } from "ai";
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { normalizeInput } from "../utils/normalizeInput.js";
import { regexGuard } from "../utils/regexGuard.js";
import { getGuardModel } from "./guardModel.js";

const __dirname = dirname(fileURLToPath(import.meta.url));

const ChatGuardSchema = z.object({
  allowed: z.boolean(),
  reason: z.string(),
});

export type ChatGuardResult = z.infer<typeof ChatGuardSchema>;

const systemPrompt = readFileSync(
  resolve(__dirname, "../prompts/chat-guard.md"),
  "utf-8",
);

/**
 * 3-layer guardrail for the /chat endpoint.
 *
 * Layer 1: Unicode normalization (neutralize homoglyphs, zero-width chars, BiDi)
 * Layer 2: Regex pre-filter (fast, deterministic block of known injection patterns)
 * Layer 3: LLM judge (semantic intent classification)
 *
 * If the LLM call fails, the guard **fails open** — the message is allowed through
 * so the primary chat agent can still serve the user.
 */
export async function checkChatGuard(message: string): Promise<ChatGuardResult> {
  // Defensive length check (route-level Zod already caps at 10k, but guard may be called elsewhere)
  if (message.length > 10_000) {
    return { allowed: false, reason: "Message too long" };
  }

  // Layer 1: Normalize
  const normalized = normalizeInput(message);

  // Layer 2: Regex pre-filter
  const regex = regexGuard(normalized);
  if (regex.blocked) {
    return { allowed: false, reason: `Regex blocked: ${regex.pattern}` };
  }

  // Layer 3: LLM judge
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 30_000);
  try {
    const result = await generateText({
      model: getGuardModel(),
      system: systemPrompt,
      prompt: normalized,
      abortSignal: controller.signal,
    });

    const text = result.text
      .replace(/^```(?:json)?\s*/i, "")
      .replace(/\s*```\s*$/i, "")
      .trim();
    const parsed: unknown = JSON.parse(text);
    return ChatGuardSchema.parse(parsed);
  } catch (err) {
    console.warn("[ChatGuard] LLM call failed, failing open:", err);
    return { allowed: true, reason: "Guardrail failed open (LLM error)" };
  } finally {
    clearTimeout(timeout);
  }
}
