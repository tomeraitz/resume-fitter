import { readFileSync } from 'fs';
import { join } from 'path';
import { describe, it, expect } from 'vitest';
import { RewriteResumeOutputSchema } from './schemas.js';
import { runAgent } from './test-utils.js';

const RUN = process.env.TEST_EVAL === 'true';
const describeIf = (cond: boolean) => (cond ? describe : describe.skip);

const fixtures = join(import.meta.dirname, '../fixtures');

const singleColumnCv = readFileSync(join(fixtures, 'cv-templates/single-column-cv.html'), 'utf8');

const KEYWORDS = ['PostgreSQL', 'CI/CD', 'REST APIs'];

describeIf(RUN)('rewrite-resume agent — smoke test', () => {
  it('returns valid JSON matching RewriteResumeOutputSchema', async () => {
    const result = await runAgent('rewrite-resume', {
      missingKeywords: KEYWORDS,
      cvTemplate: singleColumnCv,
      cvLanguage: 'en',
    });
    expect(() => RewriteResumeOutputSchema.parse(result)).not.toThrow();
  });

  it('keywords not in keywordsNotAdded must appear in updatedCvHtml', async () => {
    const result = await runAgent('rewrite-resume', {
      missingKeywords: KEYWORDS,
      cvTemplate: singleColumnCv,
      cvLanguage: 'en',
    }) as any;
    RewriteResumeOutputSchema.parse(result);
    const skipped = new Set<string>(result.keywordsNotAdded.map((k: any) => k.keyword.toLowerCase()));
    for (const keyword of KEYWORDS) {
      if (!skipped.has(keyword.toLowerCase())) {
        expect(result.updatedCvHtml.toLowerCase()).toContain(keyword.toLowerCase());
      }
    }
  });
});
