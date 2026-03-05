import { readFileSync } from 'fs';
import { join } from 'path';
import { describe, it, expect } from 'vitest';
import { AtsScannerOutputSchema } from './schemas.js';
import { runAgent } from './test-utils.js';

const fixtures = join(import.meta.dirname, '../fixtures');

const singleColumnCv = readFileSync(join(fixtures, 'cv-templates/single-column-cv.html'), 'utf8');
const fullstackRole = readFileSync(join(fixtures, 'job-descriptions/fullstack-role.txt'), 'utf8');

describe('ats-scanner agent — smoke test', () => {
  it('returns valid JSON matching AtsScannerOutputSchema', async () => {
    const result = await runAgent('ats-scanner', {
      updatedCvHtml: singleColumnCv,
      cvLanguage: 'en',
      jobDescription: fullstackRole,
    });
    expect(() => AtsScannerOutputSchema.parse(result)).not.toThrow();
  });
});
