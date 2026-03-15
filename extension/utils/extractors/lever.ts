import type { ExtractedJobDetails } from '@/types/extract';
import { extractSkills } from '../extractSkills';

export function extractLever(doc: Document): Partial<ExtractedJobDetails> {
  const title =
    doc.querySelector('.posting-headline h2')?.textContent?.trim() ?? '';

  const company =
    doc.querySelector<HTMLImageElement>('.main-header-logo img')?.alt?.trim() ||
    extractCompanyFromTitle(doc);

  const location =
    doc.querySelector('.posting-categories .location')?.textContent?.trim() ||
    doc
      .querySelector('.posting-categories .workplaceTypes')
      ?.textContent?.trim() ||
    '';

  const description =
    doc.querySelector('.posting-page .content')?.textContent?.trim() ||
    Array.from(doc.querySelectorAll('.section-wrapper'))
      .map((el) => el.textContent?.trim())
      .filter(Boolean)
      .join('\n') ||
    '';

  const skills = extractSkills(description);

  return { title, company, location, description, skills };
}

function extractCompanyFromTitle(doc: Document): string {
  const pageTitle = doc.title ?? '';
  const dash = pageTitle.lastIndexOf(' - ');
  return dash > 0 ? pageTitle.slice(dash + 3).trim() : '';
}
