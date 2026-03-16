import { z } from 'zod';

export const HiringManagerOutputSchema = z.object({
  matchScore: z.number().int().min(0).max(100),
  cvLanguage: z.string().min(2).max(3),
  missingKeywords: z.array(z.string()).min(3).max(7),
  summary: z.string(),
});

export const RewriteResumeOutputSchema = z.object({
  updatedCvHtml: z.string(),
  keywordsNotAdded: z.array(z.object({ keyword: z.string(), reason: z.string() })),
});

export const AtsScannerOutputSchema = z.object({
  atsScore: z.number().int().min(0).max(100),
  problemAreas: z.array(z.string()).max(10),
});

export const VerifierOutputSchema = z.object({
  verifiedCv: z.string(),
  flaggedClaims: z.array(z.string()),
});

export { ExtractionResultSchema } from '../../src/types/extract.types.js';
