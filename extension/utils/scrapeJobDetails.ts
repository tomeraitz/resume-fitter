import type { ExtractedJobDetails } from '@/types/extract';
import { extractGreenhouse } from './extractors/greenhouse';
import { extractLinkedIn } from './extractors/linkedin';
import { extractIndeed } from './extractors/indeed';
import { extractLever } from './extractors/lever';
import { extractGeneric } from './extractors/generic';

interface BoardMatcher {
  pattern: RegExp;
  extract: (doc: Document) => Partial<ExtractedJobDetails>;
}

const BOARD_MATCHERS: BoardMatcher[] = [
  { pattern: /greenhouse\.io\/.*\/jobs\//i, extract: extractGreenhouse },
  { pattern: /linkedin\.com\/jobs\//i, extract: extractLinkedIn },
  { pattern: /indeed\.com\/(viewjob|jobs)/i, extract: extractIndeed },
  { pattern: /lever\.co\//i, extract: extractLever },
];

export function scrapeJobDetails(
  doc: Document,
  url: string,
): ExtractedJobDetails {
  const matcher = BOARD_MATCHERS.find((m) => m.pattern.test(url));
  const raw = matcher ? matcher.extract(doc) : extractGeneric(doc);

  return {
    title: (raw.title ?? '').trim().slice(0, 200),
    company: (raw.company ?? '').trim().slice(0, 200),
    location: (raw.location ?? '').trim().slice(0, 200),
    skills: (raw.skills ?? []).slice(0, 50),
    description: (raw.description ?? '').trim().slice(0, 50_000),
  };
}
