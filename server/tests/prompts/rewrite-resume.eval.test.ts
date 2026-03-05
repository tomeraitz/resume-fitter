import { readFileSync } from 'fs';
import { join } from 'path';
import { describe, it, expect } from 'vitest';
import { RewriteResumeOutputSchema } from './schemas.js';
import { runAgent } from './test-utils.js';

const fixtures = join(import.meta.dirname, '../fixtures');

const singleColumnCv = readFileSync(join(fixtures, 'cv-templates/single-column-cv.html'), 'utf8');
const twoColumnCv = readFileSync(join(fixtures, 'cv-templates/two-column-cv.html'), 'utf8');
const tableLayoutCv = readFileSync(join(fixtures, 'cv-templates/table-layout-cv.html'), 'utf8');

const runEval = process.env.TEST_EVAL === 'true';
const evalIt = runEval ? it : it.skip;

const extractClasses = (html: string): Set<string> => {
  const matches = [...html.matchAll(/class="([^"]+)"/g)];
  return new Set(matches.flatMap(m => m[1].split(/\s+/).filter(Boolean)));
};

const extractSectionHeaders = (html: string): string[] =>
  [...html.matchAll(/<h[1-3][^>]*>(.*?)<\/h[1-3]>/gi)]
    .map(m => m[1].replace(/<[^>]+>/g, '').trim().toLowerCase());

const countBullets = (html: string): number =>
  [...html.matchAll(/<li[\s>]/gi)].length;

const countWords = (html: string): number =>
  html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().split(/\s+/).filter(Boolean).length;

const designs = [
  { name: 'single-column', template: singleColumnCv },
  { name: 'two-column',    template: twoColumnCv },
  { name: 'table-layout',  template: tableLayoutCv },
];

describe('rewrite-resume agent — layout eval tests (TEST_EVAL=true to run)', () => {
  for (const { name, template } of designs) {
    evalIt(`${name}: all original CSS classes preserved after rewrite`, async () => {
      const result = await runAgent('rewrite-resume', {
        missingKeywords: ['PostgreSQL', 'CI/CD', 'REST APIs'],
        cvTemplate: template,
        cvLanguage: 'en',
      }) as any;
      RewriteResumeOutputSchema.parse(result);

      const originalClasses = extractClasses(template);
      const rewrittenClasses = extractClasses(result.updatedCvHtml);
      for (const cls of originalClasses) {
        expect(rewrittenClasses, `CSS class "${cls}" was removed by rewrite-resume`).toContain(cls);
      }
    });

    evalIt(`${name}: all section headers present after rewrite`, async () => {
      const result = await runAgent('rewrite-resume', {
        missingKeywords: ['PostgreSQL', 'CI/CD', 'REST APIs'],
        cvTemplate: template,
        cvLanguage: 'en',
      }) as any;
      RewriteResumeOutputSchema.parse(result);

      const originalHeaders = extractSectionHeaders(template);
      const rewrittenHeaders = extractSectionHeaders(result.updatedCvHtml);
      for (const header of originalHeaders) {
        expect(rewrittenHeaders, `Section header "${header}" was removed by rewrite-resume`).toContain(header);
      }
    });

    evalIt(`${name}: resume text was changed after rewrite`, async () => {
      const result = await runAgent('rewrite-resume', {
        missingKeywords: ['PostgreSQL', 'CI/CD', 'REST APIs'],
        cvTemplate: template,
        cvLanguage: 'en',
      }) as any;
      RewriteResumeOutputSchema.parse(result);

      expect(result.updatedCvHtml).not.toBe(template);
    });

    evalIt(`${name}: no new bullet points added after rewrite`, async () => {
      const result = await runAgent('rewrite-resume', {
        missingKeywords: ['PostgreSQL', 'CI/CD', 'REST APIs'],
        cvTemplate: template,
        cvLanguage: 'en',
      }) as any;
      RewriteResumeOutputSchema.parse(result);

      const originalBullets = countBullets(template);
      const rewrittenBullets = countBullets(result.updatedCvHtml);
      expect(rewrittenBullets, `Rewrite added new bullet points (${originalBullets} => ${rewrittenBullets})`).toBeLessThanOrEqual(originalBullets);
    });

    evalIt(`${name}: word count not significantly larger than original after rewrite`, async () => {
      const result = await runAgent('rewrite-resume', {
        missingKeywords: ['PostgreSQL', 'CI/CD', 'REST APIs'],
        cvTemplate: template,
        cvLanguage: 'en',
      }) as any;
      RewriteResumeOutputSchema.parse(result);

      const originalWords = countWords(template);
      const rewrittenWords = countWords(result.updatedCvHtml);
      const maxAllowed = Math.ceil(originalWords * 1.1);
      const minAllowed = Math.floor(originalWords * 0.9);
      expect(rewrittenWords, `Rewrite shrunk word count too much (${originalWords} => ${rewrittenWords}, min ${minAllowed})`).toBeGreaterThanOrEqual(minAllowed);
      expect(rewrittenWords, `Rewrite inflated word count too much (${originalWords} => ${rewrittenWords}, max ${maxAllowed})`).toBeLessThanOrEqual(maxAllowed);
    });
  }
});
