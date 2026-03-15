import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../extractSkills', () => ({
  extractSkills: vi.fn(() => ['React', 'TypeScript']),
}));

import { extractGeneric } from './generic';

function createDoc(html: string): Document {
  const parser = new DOMParser();
  return parser.parseFromString(html, 'text/html');
}

describe('extractGeneric', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('ld+json parsing', () => {
    it('extracts all fields from valid JobPosting ld+json', () => {
      const doc = createDoc(`
        <html><body>
          <script type="application/ld+json">${JSON.stringify({
            '@type': 'JobPosting',
            title: 'Senior Developer',
            hiringOrganization: { name: 'JsonCorp' },
            jobLocation: { address: { addressLocality: 'Berlin, DE' } },
            description: 'Work on exciting projects with React and TypeScript.',
          })}</script>
        </body></html>
      `);

      const result = extractGeneric(doc);

      expect(result.title).toBe('Senior Developer');
      expect(result.company).toBe('JsonCorp');
      expect(result.location).toBe('Berlin, DE');
      expect(result.description).toContain('exciting projects');
      expect(result.skills).toEqual(['React', 'TypeScript']);
    });

    it('ignores ld+json that is not a JobPosting', () => {
      const doc = createDoc(`
        <html><body>
          <script type="application/ld+json">${JSON.stringify({
            '@type': 'Organization',
            name: 'SomeCorp',
          })}</script>
          <h1>Fallback Title</h1>
        </body></html>
      `);

      const result = extractGeneric(doc);
      expect(result.title).toBe('Fallback Title');
      expect(result.company).toBe('');
    });

    it('does not throw on malformed ld+json', () => {
      const doc = createDoc(`
        <html><body>
          <script type="application/ld+json">{ invalid json !!!</script>
          <h1>Safe Title</h1>
        </body></html>
      `);

      const result = extractGeneric(doc);

      expect(result.title).toBe('Safe Title');
    });

    it('handles multiple ld+json scripts, picking the JobPosting one', () => {
      const doc = createDoc(`
        <html><body>
          <script type="application/ld+json">${JSON.stringify({
            '@type': 'Organization',
            name: 'OrgOnly',
          })}</script>
          <script type="application/ld+json">${JSON.stringify({
            '@type': 'JobPosting',
            title: 'Found It',
            hiringOrganization: { name: 'RealCo' },
            jobLocation: { address: { addressLocality: 'London' } },
            description: 'The real job description.',
          })}</script>
        </body></html>
      `);

      const result = extractGeneric(doc);

      expect(result.title).toBe('Found It');
      expect(result.company).toBe('RealCo');
    });
  });

  describe('meta tag fallback', () => {
    it('extracts company from og:site_name when ld+json is missing', () => {
      const doc = createDoc(`
        <html>
          <head>
            <meta property="og:site_name" content="MetaCorp" />
          </head>
          <body><h1>Some Title</h1></body>
        </html>
      `);

      const result = extractGeneric(doc);
      expect(result.company).toBe('MetaCorp');
    });

    it('extracts title from og:title when ld+json and h1 are missing', () => {
      const doc = createDoc(`
        <html>
          <head>
            <meta property="og:title" content="Meta Title" />
          </head>
          <body></body>
        </html>
      `);

      const result = extractGeneric(doc);
      expect(result.title).toBe('Meta Title');
    });

    it('does not overwrite ld+json company with meta tag', () => {
      const doc = createDoc(`
        <html>
          <head>
            <meta property="og:site_name" content="MetaCorp" />
          </head>
          <body>
            <script type="application/ld+json">${JSON.stringify({
              '@type': 'JobPosting',
              title: 'Dev',
              hiringOrganization: { name: 'JsonCorp' },
              description: 'Desc',
            })}</script>
          </body>
        </html>
      `);

      const result = extractGeneric(doc);
      expect(result.company).toBe('JsonCorp');
    });
  });

  describe('DOM heuristic fallback', () => {
    it('uses h1 for title as last resort', () => {
      const doc = createDoc(`
        <html><body>
          <h1>Heuristic Title</h1>
        </body></html>
      `);

      const result = extractGeneric(doc);
      expect(result.title).toBe('Heuristic Title');
    });

    it('falls back to h2 when h1 is missing', () => {
      const doc = createDoc(`
        <html><body>
          <h2>H2 Fallback Title</h2>
        </body></html>
      `);

      const result = extractGeneric(doc);
      expect(result.title).toBe('H2 Fallback Title');
    });

    it('uses semantic elements for description (article, main)', () => {
      const doc = createDoc(`
        <html><body>
          <h1>Title</h1>
          <article>This is the main article content with a lot of detail about the job posting.</article>
        </body></html>
      `);

      const result = extractGeneric(doc);
      expect(result.description).toContain('main article content');
    });

    it('uses .job-description class for description', () => {
      const doc = createDoc(`
        <html><body>
          <h1>Title</h1>
          <div class="job-description">Detailed job description text here.</div>
        </body></html>
      `);

      const result = extractGeneric(doc);
      expect(result.description).toContain('Detailed job description');
    });

    it('falls back to longest div/section when no semantic elements exist', () => {
      const doc = createDoc(`
        <html><body>
          <h1>Title</h1>
          <div>Short</div>
          <div>This is a much longer div that should be picked as the description because it has the most text content of any div on the page.</div>
          <div>Medium text</div>
        </body></html>
      `);

      const result = extractGeneric(doc);
      expect(result.description).toContain('much longer div');
    });
  });

  it('returns empty strings when document is completely empty', () => {
    const doc = createDoc('<html><body></body></html>');

    const result = extractGeneric(doc);

    expect(result.title).toBe('');
    expect(result.company).toBe('');
    expect(result.location).toBe('');
    expect(result.description).toBe('');
  });

  it('handles ld+json with missing nested fields gracefully', () => {
    const doc = createDoc(`
      <html><body>
        <script type="application/ld+json">${JSON.stringify({
          '@type': 'JobPosting',
          title: 'Partial Job',
        })}</script>
      </body></html>
    `);

    const result = extractGeneric(doc);

    expect(result.title).toBe('Partial Job');
    expect(result.company).toBe('');
    expect(result.location).toBe('');
    expect(result.description).toBe('');
  });
});
