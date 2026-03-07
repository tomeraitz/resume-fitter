import { z } from "zod";

export const ChatRequestSchema = z.object({
  message: z.string().min(1).max(10_000),
  currentCv: z.string().min(1).max(100_000),
  history: z.string().max(100_000).optional(),
});

export type ChatRequest = z.infer<typeof ChatRequestSchema>;

export interface ChatResponse {
  updatedCvHtml: string;
  flaggedClaims: string[];
}
