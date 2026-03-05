import { readFileSync } from 'fs';
import { join } from 'path';
import { describe, it, expect } from 'vitest';
import { HiringManagerOutputSchema } from './schemas.js';
import { runAgent } from './test-utils.js';

const fixtures = join(import.meta.dirname, '../fixtures');

const sreRole = readFileSync(join(fixtures, 'job-descriptions/sre-role.txt'), 'utf8');
const singleColumnCv = readFileSync(join(fixtures, 'cv-templates/single-column-cv.html'), 'utf8');
const history = readFileSync(join(fixtures, 'histories/candidate-history.md'), 'utf8');

describe('hiring-manager agent — smoke test', () => {
  it('returns valid JSON matching HiringManagerOutputSchema for SRE role', async () => {
    const result = await runAgent('hiring-manager', {
      jobDescription: sreRole,
      cvTemplate: singleColumnCv,
      history,
    });
    expect(() => HiringManagerOutputSchema.parse(result)).not.toThrow();
  });
});
