import { readFileSync } from 'fs';
import { join } from 'path';
import { describe, it, expect } from 'vitest';
import { HiringManagerOutputSchema } from './schemas.js';
import { runAgent } from './test-utils.js';

const fixtures = join(import.meta.dirname, '../fixtures');

const sreRole = readFileSync(join(fixtures, 'job-descriptions/sre-role.txt'), 'utf8');
const fullstackRole = readFileSync(join(fixtures, 'job-descriptions/fullstack-role.txt'), 'utf8');
const mlEngineerRole = readFileSync(join(fixtures, 'job-descriptions/ml-engineer-role.txt'), 'utf8');
const singleColumnCv = readFileSync(join(fixtures, 'cv-templates/single-column-cv.html'), 'utf8');
const hebrewCv = readFileSync(join(fixtures, 'cv-templates/hebrew-cv.html'), 'utf8');
const history = readFileSync(join(fixtures, 'histories/candidate-history.md'), 'utf8');

// Semantic evaluation tests — not run in CI by default.
// Enable by setting TEST_EVAL=true in the environment.
const runEval = process.env.TEST_EVAL === 'true';
const evalIt = runEval ? it : it.skip;

describe('hiring-manager agent — eval tests (TEST_EVAL=true to run)', () => {
  evalIt('sre-role: all missingKeywords appear in job description', async () => {
    const result = await runAgent('hiring-manager', {
      jobDescription: sreRole,
      cvTemplate: singleColumnCv,
      history,
    });
    HiringManagerOutputSchema.parse(result);
    for (const keyword of (result as any).missingKeywords) {
      expect(sreRole.toLowerCase()).toContain(keyword.toLowerCase());
    }
  });

  evalIt('ml-engineer-role: all missingKeywords appear in job description', async () => {
    const result = await runAgent('hiring-manager', {
      jobDescription: mlEngineerRole,
      cvTemplate: singleColumnCv,
      history,
    });
    HiringManagerOutputSchema.parse(result);
    for (const keyword of (result as any).missingKeywords) {
      expect(mlEngineerRole.toLowerCase()).toContain(keyword.toLowerCase());
    }
  });

  evalIt('hebrew-cv: cvLanguage is "he"', async () => {
    const result = await runAgent('hiring-manager', {
      jobDescription: fullstackRole,
      cvTemplate: hebrewCv,
      history,
    });
    HiringManagerOutputSchema.parse(result);
    expect((result as any).cvLanguage).toBe('he');
  });
});
