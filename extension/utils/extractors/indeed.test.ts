import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../extractSkills', () => ({
  extractSkills: vi.fn(() => ['React', 'TypeScript']),
}));

import { extractIndeed } from './indeed';

function createDoc(html: string): Document {
  const parser = new DOMParser();
  return parser.parseFromString(html, 'text/html');
}

describe('extractIndeed', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('extracts all fields from a full Indeed page', () => {
    const doc = createDoc(`
      <html><body>
        <h1 class="jobsearch-JobInfoHeader-title">Full Stack Developer</h1>
        <div data-company-name="true">MegaCorp</div>
        <div data-testid="job-location">Austin, TX</div>
        <div id="jobDescriptionText">Build web applications using React and TypeScript.</div>
      </body></html>
    `);

    const result = extractIndeed(doc);

    expect(result.title).toBe('Full Stack Developer');
    expect(result.company).toBe('MegaCorp');
    expect(result.location).toBe('Austin, TX');
    expect(result.description).toContain('web applications');
    expect(result.skills).toEqual(['React', 'TypeScript']);
  });

  it('falls back to h1 for title', () => {
    const doc = createDoc(`
      <html><body>
        <h1>Fallback Title</h1>
        <div id="jobDescriptionText">Description</div>
      </body></html>
    `);

    const result = extractIndeed(doc);
    expect(result.title).toBe('Fallback Title');
  });

  it('falls back to .jobsearch-InlineCompanyRating a for company', () => {
    const doc = createDoc(`
      <html><body>
        <h1>Title</h1>
        <div class="jobsearch-InlineCompanyRating"><a>RatingCo</a></div>
      </body></html>
    `);

    const result = extractIndeed(doc);
    expect(result.company).toBe('RatingCo');
  });

  it('falls back to subtitle div for location', () => {
    const doc = createDoc(`
      <html><body>
        <h1>Title</h1>
        <div class="jobsearch-JobInfoHeader-subtitle">
          <div>Company</div>
          <div>Chicago, IL</div>
        </div>
      </body></html>
    `);

    const result = extractIndeed(doc);
    expect(result.location).toBe('Chicago, IL');
  });

  it('returns empty strings when no elements are found', () => {
    const doc = createDoc('<html><body></body></html>');

    const result = extractIndeed(doc);

    expect(result.title).toBe('');
    expect(result.company).toBe('');
    expect(result.location).toBe('');
    expect(result.description).toBe('');
  });

  it('trims whitespace from extracted values', () => {
    const doc = createDoc(`
      <html><body>
        <h1 class="jobsearch-JobInfoHeader-title">  Padded Title  </h1>
        <div data-company-name="true">  Padded Company  </div>
        <div data-testid="job-location">  Padded Location  </div>
        <div id="jobDescriptionText">  Padded Description  </div>
      </body></html>
    `);

    const result = extractIndeed(doc);

    expect(result.title).toBe('Padded Title');
    expect(result.company).toBe('Padded Company');
    expect(result.location).toBe('Padded Location');
    expect(result.description).toBe('Padded Description');
  });
});
