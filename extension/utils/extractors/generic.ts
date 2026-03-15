import type { ExtractedJobDetails } from '@/types/extract';
import { extractSkills } from '../extractSkills';

/** Fallback extractor using structured data, meta tags, and DOM heuristics. */
export function extractGeneric(doc: Document): Partial<ExtractedJobDetails> {
  let title = '';
  let company = '';
  let location = '';
  let description = '';

  // 1. Structured data (ld+json)
  const ldScripts = doc.querySelectorAll('script[type="application/ld+json"]');
  for (const script of ldScripts) {
    try {
      const raw = script.textContent ?? '';
      if (raw.length > 200_000) continue;
      const data = JSON.parse(raw);
      const posting = data['@type'] === 'JobPosting' ? data : null;
      if (posting) {
        title = posting.title ?? '';
        company = posting.hiringOrganization?.name ?? '';
        location = posting.jobLocation?.address?.addressLocality ?? '';
        description = posting.description ?? '';
        break;
      }
    } catch {
      // malformed JSON — continue to next script or fallback
    }
  }

  // 2. Meta tags (fill gaps only)
  if (!company) {
    company =
      doc.querySelector('meta[property="og:site_name"]')?.getAttribute('content') ?? '';
  }
  if (!title) {
    title =
      doc.querySelector('meta[property="og:title"]')?.getAttribute('content') ?? '';
  }

  // 3. DOM heuristics (last resort)
  if (!title) {
    title =
      (doc.querySelector('h1') ?? doc.querySelector('h2'))?.textContent?.trim() ?? '';
  }

  if (!description) {
    const candidates = doc.querySelectorAll(
      'article, main, [role="main"], .description, .job-description, #job-description',
    );
    let longest = '';
    for (const el of candidates) {
      const text = el.textContent ?? '';
      if (text.length > longest.length) longest = text;
    }
    // If no semantic candidate found, scan div/section for longest text
    if (!longest) {
      for (const el of doc.querySelectorAll('div, section')) {
        const len = el.textContent?.length ?? 0;
        if (len > longest.length && len <= 50_000) longest = el.textContent ?? '';
      }
    }
    description = longest.trim();
  }

  // 4. Skills from description
  const skills = extractSkills(description);

  return { title, company, location, description, skills };
}
