import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../extractSkills', () => ({
  extractSkills: vi.fn(() => ['React', 'TypeScript']),
}));

import { extractGreenhouse } from './greenhouse';

function createDoc(html: string): Document {
  const parser = new DOMParser();
  return parser.parseFromString(html, 'text/html');
}

describe('extractGreenhouse', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('extracts all fields from a full Greenhouse page', () => {
    const doc = createDoc(`
      <html>
        <head><title>Senior Engineer at Acme Corp</title></head>
        <body>
          <h1>Senior Engineer</h1>
          <div class="company-name">Acme Corp</div>
          <div class="location">San Francisco, CA</div>
          <div id="content">We are looking for a Senior Engineer with React and TypeScript experience.</div>
        </body>
      </html>
    `);

    const result = extractGreenhouse(doc);

    expect(result.title).toBe('Senior Engineer');
    expect(result.company).toBe('Acme Corp');
    expect(result.location).toBe('San Francisco, CA');
    expect(result.description).toContain('Senior Engineer');
    expect(result.skills).toEqual(['React', 'TypeScript']);
  });

  it('falls back to .job-title selector for title', () => {
    const doc = createDoc(`
      <html><body>
        <div class="job-title">Backend Developer</div>
        <div id="content">Description here</div>
      </body></html>
    `);

    const result = extractGreenhouse(doc);
    expect(result.title).toBe('Backend Developer');
  });

  it('extracts company from <title> tag when .company-name is missing', () => {
    const doc = createDoc(`
      <html>
        <head><title>Software Engineer at BigTech Inc</title></head>
        <body>
          <h1>Software Engineer</h1>
          <div id="content">Job description</div>
        </body>
      </html>
    `);

    const result = extractGreenhouse(doc);
    expect(result.company).toBe('BigTech Inc');
  });

  it('extracts company from title with "at" in middle of string', () => {
    const doc = createDoc(`
      <html>
        <head><title>Data Analyst at Cool Startup</title></head>
        <body><h1>Data Analyst</h1></body>
      </html>
    `);

    const result = extractGreenhouse(doc);
    expect(result.company).toBe('Cool Startup');
  });

  it('falls back to [class*="location"] selector', () => {
    const doc = createDoc(`
      <html><body>
        <h1>Title</h1>
        <div class="job-location-info">Remote, USA</div>
        <div id="content">Desc</div>
      </body></html>
    `);

    const result = extractGreenhouse(doc);
    expect(result.location).toBe('Remote, USA');
  });

  it('falls back to .content then [class*="description"] for description', () => {
    const doc = createDoc(`
      <html><body>
        <h1>Title</h1>
        <div class="content">Content area text</div>
      </body></html>
    `);

    expect(extractGreenhouse(doc).description).toBe('Content area text');

    const doc2 = createDoc(`
      <html><body>
        <h1>Title</h1>
        <div class="job-description">Description area text</div>
      </body></html>
    `);

    expect(extractGreenhouse(doc2).description).toBe('Description area text');
  });

  it('returns empty strings when no elements are found', () => {
    const doc = createDoc('<html><body></body></html>');

    const result = extractGreenhouse(doc);

    expect(result.title).toBe('');
    expect(result.company).toBe('');
    expect(result.location).toBe('');
    expect(result.description).toBe('');
    expect(result.skills).toEqual(['React', 'TypeScript']);
  });

  it('trims whitespace from extracted values', () => {
    const doc = createDoc(`
      <html><body>
        <h1>  Padded Title  </h1>
        <div class="company-name">  Padded Company  </div>
        <div class="location">  Padded Location  </div>
        <div id="content">  Padded Description  </div>
      </body></html>
    `);

    const result = extractGreenhouse(doc);

    expect(result.title).toBe('Padded Title');
    expect(result.company).toBe('Padded Company');
    expect(result.location).toBe('Padded Location');
    expect(result.description).toBe('Padded Description');
  });
});
