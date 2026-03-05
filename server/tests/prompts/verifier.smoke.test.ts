import { readFileSync } from 'fs';
import { join } from 'path';
import { describe, it, expect } from 'vitest';
import { VerifierOutputSchema } from './schemas.js';
import { runAgent } from './test-utils.js';

const RUN = process.env.TEST_EVAL === 'true';
const describeIf = (cond: boolean) => (cond ? describe : describe.skip);

const fixtures = join(import.meta.dirname, '../fixtures');

const singleColumnCv = readFileSync(join(fixtures, 'cv-templates/single-column-cv.html'), 'utf8');
const history = readFileSync(join(fixtures, 'histories/candidate-history.md'), 'utf8');

describeIf(RUN)('verifier agent — smoke test', () => {
  it('returns valid JSON matching VerifierOutputSchema', async () => {
    const result = await runAgent('verifier', {
      updatedCvHtml: singleColumnCv,
      history,
      cvLanguage: 'en',
    });
    expect(() => VerifierOutputSchema.parse(result)).not.toThrow();
  });
});
