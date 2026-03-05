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
  }
});
