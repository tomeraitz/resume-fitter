import { readFileSync } from 'fs';
import { join } from 'path';
import { describe, it, expect } from 'vitest';
import { RewriteResumeOutputSchema, VerifierOutputSchema } from './schemas.js';
import { runAgent } from './test-utils.js';

const fixtures = join(import.meta.dirname, '../fixtures');

const extractTagSequence = (html: string) =>
  [...html.matchAll(/<([a-z][^\s/>]*)/gi)].map(m => m[1]).join(',');

const designs = [
  { name: 'single-column', file: 'single-column-cv.html' },
  { name: 'two-column',    file: 'two-column-cv.html' },
  { name: 'table-layout',  file: 'table-layout-cv.html' },
];

// Gate: skip until rewrite-resume.ts and verifier.ts are implemented
describe('html-structure preservation — smoke tests', () => {
  for (const { name, file } of designs) {
    it.skip(`preserves HTML tag structure for ${name} design (requires rewrite-resume.ts)`, async () => {
      const template = readFileSync(join(fixtures, 'cv-templates', file), 'utf8');
      const result = await runAgent('rewrite-resume', {
        missingKeywords: ['PostgreSQL', 'CI/CD', 'REST APIs'],
        cvTemplate: template,
        cvLanguage: 'en',
      });
      RewriteResumeOutputSchema.parse(result);
      expect(extractTagSequence((result as any).updatedCvHtml)).toBe(extractTagSequence(template));
    });
  }

  it.skip('verifier preserves HTML tag structure (requires verifier.ts)', async () => {
    const template = readFileSync(join(fixtures, 'cv-templates/two-column-cv.html'), 'utf8');
    const history = readFileSync(join(fixtures, 'histories/candidate-history.md'), 'utf8');
    const result = await runAgent('verifier', { updatedCvHtml: template, history, cvLanguage: 'en' });
    VerifierOutputSchema.parse(result);
    expect(extractTagSequence((result as any).verifiedCv)).toBe(extractTagSequence(template));
  });
});
