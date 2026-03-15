import type { ExtractedJobDetails } from '@/types/extract';
import { extractSkills } from '../extractSkills';

function textOf(el: Element | null): string {
  return el?.textContent?.trim() ?? '';
}

function companyFromTitle(doc: Document): string {
  const title = doc.querySelector('title')?.textContent ?? '';
  const match = title.match(/\bat\s+(.+)/i);
  return match?.[1]?.trim() ?? '';
}

export function extractGreenhouse(doc: Document): Partial<ExtractedJobDetails> {
  const title =
    textOf(doc.querySelector('h1')) ||
    textOf(doc.querySelector('.job-title'));

  const company =
    textOf(doc.querySelector('.company-name')) ||
    companyFromTitle(doc);

  const location =
    textOf(doc.querySelector('.location')) ||
    textOf(doc.querySelector('[class*="location"]'));

  const description =
    textOf(doc.querySelector('#content')) ||
    textOf(doc.querySelector('.content')) ||
    textOf(doc.querySelector('[class*="description"]'));

  const skills = extractSkills(description);

  return { title, company, location, description, skills };
}
