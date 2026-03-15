import type { ExtractedJobDetails } from '@/types/extract';
import { extractSkills } from '../extractSkills';

function text(doc: Document, ...selectors: string[]): string {
  for (const sel of selectors) {
    const el = doc.querySelector(sel);
    if (el?.textContent?.trim()) return el.textContent.trim();
  }
  return '';
}

export function extractLinkedIn(doc: Document): Partial<ExtractedJobDetails> {
  const title = text(
    doc,
    '.job-details-jobs-unified-top-card__job-title h1',
    '.top-card-layout__title',
    'h1',
  );

  const company = text(
    doc,
    '.job-details-jobs-unified-top-card__company-name a',
    '.top-card-layout__company',
  );

  const location = text(
    doc,
    '.job-details-jobs-unified-top-card__bullet',
    '.top-card-layout__bullet',
  );

  const description = text(
    doc,
    '.jobs-description__content',
    '.description__text',
    '#job-details',
  );

  const skills = extractSkills(description);

  return { title, company, location, description, skills };
}
