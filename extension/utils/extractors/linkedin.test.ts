import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../extractSkills', () => ({
  extractSkills: vi.fn(() => ['React', 'TypeScript']),
}));

import { extractLinkedIn } from './linkedin';

function createDoc(html: string): Document {
  const parser = new DOMParser();
  return parser.parseFromString(html, 'text/html');
}

describe('extractLinkedIn', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('extracts all fields from logged-in LinkedIn view', () => {
    const doc = createDoc(`
      <html><body>
        <div class="job-details-jobs-unified-top-card__job-title"><h1>Staff Engineer</h1></div>
        <div class="job-details-jobs-unified-top-card__company-name"><a>TechCo</a></div>
        <div class="job-details-jobs-unified-top-card__bullet">New York, NY</div>
        <div class="jobs-description__content">Build distributed systems with React and TypeScript.</div>
      </body></html>
    `);

    const result = extractLinkedIn(doc);

    expect(result.title).toBe('Staff Engineer');
    expect(result.company).toBe('TechCo');
    expect(result.location).toBe('New York, NY');
    expect(result.description).toContain('distributed systems');
    expect(result.skills).toEqual(['React', 'TypeScript']);
  });

  it('extracts all fields from logged-out LinkedIn view', () => {
    const doc = createDoc(`
      <html><body>
        <h1 class="top-card-layout__title">Product Manager</h1>
        <a class="top-card-layout__company">StartupXYZ</a>
        <span class="top-card-layout__bullet">Remote</span>
        <div class="description__text">Lead product strategy and roadmap.</div>
      </body></html>
    `);

    const result = extractLinkedIn(doc);

    expect(result.title).toBe('Product Manager');
    expect(result.company).toBe('StartupXYZ');
    expect(result.location).toBe('Remote');
    expect(result.description).toContain('product strategy');
  });

  it('falls back to h1 for title when LinkedIn-specific selectors are missing', () => {
    const doc = createDoc(`
      <html><body>
        <h1>Generic Page Title</h1>
      </body></html>
    `);

    const result = extractLinkedIn(doc);
    expect(result.title).toBe('Generic Page Title');
  });

  it('falls back to #job-details for description', () => {
    const doc = createDoc(`
      <html><body>
        <h1>Role</h1>
        <div id="job-details">Detailed job description here.</div>
      </body></html>
    `);

    const result = extractLinkedIn(doc);
    expect(result.description).toBe('Detailed job description here.');
  });

  it('returns empty strings when no elements are found', () => {
    const doc = createDoc('<html><body></body></html>');

    const result = extractLinkedIn(doc);

    expect(result.title).toBe('');
    expect(result.company).toBe('');
    expect(result.location).toBe('');
    expect(result.description).toBe('');
  });

  it('trims whitespace from extracted values', () => {
    const doc = createDoc(`
      <html><body>
        <div class="job-details-jobs-unified-top-card__job-title"><h1>  Padded Title  </h1></div>
        <div class="job-details-jobs-unified-top-card__company-name"><a>  Padded Co  </a></div>
        <div class="job-details-jobs-unified-top-card__bullet">  Padded Loc  </div>
        <div class="jobs-description__content">  Padded Desc  </div>
      </body></html>
    `);

    const result = extractLinkedIn(doc);

    expect(result.title).toBe('Padded Title');
    expect(result.company).toBe('Padded Co');
    expect(result.location).toBe('Padded Loc');
    expect(result.description).toBe('Padded Desc');
  });

  it('prefers logged-in selectors over logged-out ones', () => {
    const doc = createDoc(`
      <html><body>
        <div class="job-details-jobs-unified-top-card__job-title"><h1>Logged-In Title</h1></div>
        <h1 class="top-card-layout__title">Logged-Out Title</h1>
        <div class="job-details-jobs-unified-top-card__company-name"><a>LoggedInCo</a></div>
        <a class="top-card-layout__company">LoggedOutCo</a>
      </body></html>
    `);

    const result = extractLinkedIn(doc);

    expect(result.title).toBe('Logged-In Title');
    expect(result.company).toBe('LoggedInCo');
  });
});
