import { readFileSync } from 'fs';
import { join } from 'path';
import { describe, it, expect } from 'vitest';
import { VerifierOutputSchema } from './schemas.js';
import { runAgent } from './test-utils.js';

const fixtures = join(import.meta.dirname, '../fixtures');

const singleColumnCv = readFileSync(join(fixtures, 'cv-templates/single-column-cv.html'), 'utf8');
const history = readFileSync(join(fixtures, 'histories/candidate-history.md'), 'utf8');

const runEval = process.env.TEST_EVAL === 'true';
const evalIt = runEval ? it : it.skip;

const extractSectionHeaders = (html: string): string[] =>
  [...html.matchAll(/<h[1-3][^>]*>(.*?)<\/h[1-3]>/gi)]
    .map(m => m[1].replace(/<[^>]+>/g, '').trim().toLowerCase());

const extractTextContent = (html: string): string =>
  html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();

const wordCount = (text: string): number =>
  text.split(/\s+/).filter(Boolean).length;

describe('verifier agent — eval tests (TEST_EVAL=true to run)', () => {
  evalIt('all section headers from input CV are present in verifiedCv', async () => {
    const result = await runAgent('verifier', {
      updatedCvHtml: singleColumnCv,
      history,
      cvLanguage: 'en',
    }) as any;
    VerifierOutputSchema.parse(result);

    const originalHeaders = extractSectionHeaders(singleColumnCv);
    const verifiedHeaders = extractSectionHeaders(result.verifiedCv);
    for (const header of originalHeaders) {
      expect(verifiedHeaders, `Section "${header}" was silently removed by verifier`).toContain(header);
    }
  });

  evalIt('verifiedCv retains at least 80% of the input word count', async () => {
    const result = await runAgent('verifier', {
      updatedCvHtml: singleColumnCv,
      history,
      cvLanguage: 'en',
    }) as any;
    VerifierOutputSchema.parse(result);

    const originalWords = wordCount(extractTextContent(singleColumnCv));
    const verifiedWords = wordCount(extractTextContent(result.verifiedCv));
    const retention = verifiedWords / originalWords;
    expect(
      retention,
      `verifiedCv lost too much content: ${verifiedWords} words vs ${originalWords} original (${Math.round(retention * 100)}% retained)`,
    ).toBeGreaterThanOrEqual(0.8);
  });
});
