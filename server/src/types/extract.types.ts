import { z } from "zod";

// ── Request schema ──────────────────────────────────────────────────────────
export const ExtractRequestSchema = z.object({
  html: z.string().min(1).max(500_000),
});

export type ExtractRequest = z.infer<typeof ExtractRequestSchema>;

// Coerce LLM extras values: arrays → comma-joined string, other → string
const extrasValue = z.union([
  z.string(),
  z.array(z.string()).transform(arr => arr.join(", ")),
]).pipe(z.string());

// ── LLM output schema ──────────────────────────────────────────────────────
export const ExtractedJobDetailsSchema = z.object({
  title: z.string(),
  company: z.string(),
  location: z.string(),
  skills: z.array(z.string()),
  description: z.string(),
  extras: z.record(z.string(), extrasValue).optional(),
});

export type ExtractedJobDetails = z.infer<typeof ExtractedJobDetailsSchema>;

// ── Wrapper schema for LLM response ────────────────────────────────────────
export const ExtractionResultSchema = z.discriminatedUnion("isJobPosting", [
  z.object({
    isJobPosting: z.literal(true),
    jobDetails: ExtractedJobDetailsSchema,
  }),
  z.object({
    isJobPosting: z.literal(false),
    reason: z.string(),
  }),
]);

export type ExtractionResult = z.infer<typeof ExtractionResultSchema>;
