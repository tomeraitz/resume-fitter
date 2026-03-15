import type { ExtractedJobDetails } from '@/types/extract';
import { extractSkills } from '../extractSkills';

function text(doc: Document | Element, ...selectors: string[]): string {
  for (const sel of selectors) {
    const el = doc.querySelector(sel);
    if (el?.textContent?.trim()) return el.textContent.trim();
  }
  return '';
}

export function extractLinkedIn(doc: Document): Partial<ExtractedJobDetails> {
  // Scope to the right-side detail panel when on search results page
  const detailPanel =
    doc.querySelector('.jobs-search__job-details--container') ?? doc;

  const title = text(
    detailPanel,
    '.job-details-jobs-unified-top-card__job-title h1',
    '.jobs-unified-top-card__job-title',
    '.artdeco-entity-lockup__title',
    '.top-card-layout__title',
    '.jobs-details__main-content h1',
    'h1',
  );

  const company = text(
    detailPanel,
    '.job-details-jobs-unified-top-card__company-name a',
    '.jobs-unified-top-card__company-name a',
    '.job-details-jobs-unified-top-card__primary-description-container a',
    '.artdeco-entity-lockup__subtitle',
    '.top-card-layout__company',
  );

  const location = text(
    detailPanel,
    '.job-details-jobs-unified-top-card__bullet',
    '.jobs-unified-top-card__bullet',
    '.artdeco-entity-lockup__caption',
    '.top-card-layout__bullet',
  );

  const description = text(
    detailPanel,
    '.jobs-description__content',
    '.jobs-description',
    '.jobs-description-content__text',
    '.jobs-box__html-content',
    '.description__text',
    '#job-details',
  );

  const skills = extractSkills(description);

  return { title, company, location, description, skills };
}
