import { readFileSync } from 'fs';
import { join } from 'path';
import { describe, it, expect } from 'vitest';
import { RewriteResumeOutputSchema } from './schemas.js';
import { runAgent } from './test-utils.js';

const fixtures = join(import.meta.dirname, '../fixtures');

const singleColumnCv = readFileSync(join(fixtures, 'cv-templates/single-column-cv.html'), 'utf8');

describe('rewrite-resume agent — smoke test', () => {
  it('returns valid JSON matching RewriteResumeOutputSchema', async () => {
    const result = await runAgent('rewrite-resume', {
      missingKeywords: ['PostgreSQL', 'CI/CD', 'REST APIs'],
      cvTemplate: singleColumnCv,
      cvLanguage: 'en',
    });
    expect(() => RewriteResumeOutputSchema.parse(result)).not.toThrow();
  });
});
