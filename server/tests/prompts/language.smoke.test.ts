import { readFileSync } from 'fs';
import { join } from 'path';
import { describe, it, expect } from 'vitest';
import {
  HiringManagerOutputSchema,
  RewriteResumeOutputSchema,
  AtsScannerOutputSchema,
  VerifierOutputSchema,
} from './schemas.js';
import { runAgent } from './test-utils.js';

const RUN = process.env.TEST_EVAL === 'true';
const describeIf = (cond: boolean) => (cond ? describe : describe.skip);

const fixtures = join(import.meta.dirname, '../fixtures');

const hebrewCv = readFileSync(join(fixtures, 'cv-templates/hebrew-cv.html'), 'utf8');
const fullstackRole = readFileSync(join(fixtures, 'job-descriptions/fullstack-role.txt'), 'utf8');
const history = readFileSync(join(fixtures, 'histories/candidate-history.md'), 'utf8');

describeIf(RUN)('language handling — smoke tests', () => {
  it('Agent 1 detects Hebrew CV and sets cvLanguage="he"', async () => {
    const result = await runAgent('hiring-manager', {
      jobDescription: fullstackRole,
      cvTemplate: hebrewCv,
      history,
    });
    HiringManagerOutputSchema.parse(result);
    expect((result as any).cvLanguage).toBe('he');
  });

  it('Agent 2 preserves Hebrew in rewritten CV', async () => {
    const result = await runAgent('rewrite-resume', {
      missingKeywords: ['PostgreSQL', 'CI/CD', 'REST APIs'],
      cvTemplate: hebrewCv,
      cvLanguage: 'he',
    });
    RewriteResumeOutputSchema.parse(result);
    // HTML must still contain Hebrew characters
    expect((result as any).updatedCvHtml).toMatch(/[\u0590-\u05FF]/);
  });

  it('Agent 3 flags language mismatch when CV is Hebrew and JD is English', async () => {
    const result = await runAgent('ats-scanner', {
      updatedCvHtml: hebrewCv,
      cvLanguage: 'he',
      jobDescription: fullstackRole,
    });
    AtsScannerOutputSchema.parse(result);
    const hasLanguageFlag = (result as any).problemAreas.some((p: string) =>
      p.toLowerCase().includes('language')
    );
    expect(hasLanguageFlag).toBe(true);
  });

  it('Agent 4 does not flag Hebrew phrasing as fabrication', async () => {
    const result = await runAgent('verifier', {
      updatedCvHtml: hebrewCv,
      history,
      cvLanguage: 'he',
    });
    VerifierOutputSchema.parse(result);
    // Should not flag claims solely because they are phrased in Hebrew
    const languageFlags = (result as any).flaggedClaims.filter((c: string) =>
      /hebrew|language|translation|phrasing/i.test(c)
    );
    expect(languageFlags.length).toBe(0);
  });
});
