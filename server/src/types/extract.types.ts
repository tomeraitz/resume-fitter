import { z } from "zod";

// ── Request schema ──────────────────────────────────────────────────────────
export const ExtractRequestSchema = z.object({
  html: z.string().min(1).max(500_000),
});

export type ExtractRequest = z.infer<typeof ExtractRequestSchema>;

// ── LLM output schema ──────────────────────────────────────────────────────
export const ExtractedJobDetailsSchema = z.object({
  title: z.string().max(300),
  company: z.string().max(300),
  location: z.string().max(500),
  skills: z.array(z.string().max(100)).max(30),
  description: z.string().max(5000),
  extras: z.record(z.string().max(100), z.string().max(500))
    .refine(obj => Object.keys(obj).length <= 20, { message: "Too many extras fields" })
    .optional(),
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
