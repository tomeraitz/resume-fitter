import type { ExtractedJobDetails } from '@/types/extract';
import { extractSkills } from '../extractSkills';

function text(doc: Document, ...selectors: string[]): string {
  for (const sel of selectors) {
    const el = doc.querySelector(sel);
    if (el?.textContent?.trim()) return el.textContent.trim();
  }
  return '';
}

export function extractIndeed(doc: Document): Partial<ExtractedJobDetails> {
  const title = text(doc, '.jobsearch-JobInfoHeader-title', 'h1');

  const company = text(
    doc,
    '[data-company-name]',
    '.jobsearch-InlineCompanyRating a',
  );

  const location = text(
    doc,
    '[data-testid="job-location"]',
    '.jobsearch-JobInfoHeader-subtitle > div:nth-child(2)',
  );

  const description = text(doc, '#jobDescriptionText');

  const skills = extractSkills(description);

  return { title, company, location, description, skills };
}
