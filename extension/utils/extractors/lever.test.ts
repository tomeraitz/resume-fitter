import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../extractSkills', () => ({
  extractSkills: vi.fn(() => ['React', 'TypeScript']),
}));

import { extractLever } from './lever';

function createDoc(html: string): Document {
  const parser = new DOMParser();
  return parser.parseFromString(html, 'text/html');
}

describe('extractLever', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('extracts all fields from a full Lever page', () => {
    const doc = createDoc(`
      <html>
        <head><title>DevOps Engineer - CloudCorp</title></head>
        <body>
          <div class="posting-headline"><h2>DevOps Engineer</h2></div>
          <div class="main-header-logo"><img alt="CloudCorp" src="logo.png" /></div>
          <div class="posting-categories">
            <div class="location">Seattle, WA</div>
          </div>
          <div class="posting-page">
            <div class="content">Manage cloud infrastructure using React and TypeScript.</div>
          </div>
        </body>
      </html>
    `);

    const result = extractLever(doc);

    expect(result.title).toBe('DevOps Engineer');
    expect(result.company).toBe('CloudCorp');
    expect(result.location).toBe('Seattle, WA');
    expect(result.description).toContain('cloud infrastructure');
    expect(result.skills).toEqual(['React', 'TypeScript']);
  });

  it('extracts company from <title> when logo img is missing', () => {
    const doc = createDoc(`
      <html>
        <head><title>Software Engineer - TechStartup</title></head>
        <body>
          <div class="posting-headline"><h2>Software Engineer</h2></div>
          <div class="posting-page"><div class="content">Description</div></div>
        </body>
      </html>
    `);

    const result = extractLever(doc);
    expect(result.company).toBe('TechStartup');
  });

  it('returns empty company when title has no dash separator', () => {
    const doc = createDoc(`
      <html>
        <head><title>Just A Title</title></head>
        <body>
          <div class="posting-headline"><h2>Just A Title</h2></div>
        </body>
      </html>
    `);

    const result = extractLever(doc);
    expect(result.company).toBe('');
  });

  it('falls back to .workplaceTypes for location', () => {
    const doc = createDoc(`
      <html><body>
        <div class="posting-headline"><h2>Title</h2></div>
        <div class="posting-categories">
          <div class="workplaceTypes">Remote</div>
        </div>
      </body></html>
    `);

    const result = extractLever(doc);
    expect(result.location).toBe('Remote');
  });

  it('concatenates .section-wrapper elements when .content is missing', () => {
    const doc = createDoc(`
      <html><body>
        <div class="posting-headline"><h2>Title</h2></div>
        <div class="section-wrapper">Section one text</div>
        <div class="section-wrapper">Section two text</div>
      </body></html>
    `);

    const result = extractLever(doc);
    expect(result.description).toContain('Section one text');
    expect(result.description).toContain('Section two text');
  });

  it('returns empty strings when no elements are found', () => {
    const doc = createDoc('<html><body></body></html>');

    const result = extractLever(doc);

    expect(result.title).toBe('');
    expect(result.company).toBe('');
    expect(result.location).toBe('');
    expect(result.description).toBe('');
  });

  it('trims whitespace from extracted values', () => {
    const doc = createDoc(`
      <html><body>
        <div class="posting-headline"><h2>  Padded Title  </h2></div>
        <div class="main-header-logo"><img alt="  Padded Company  " /></div>
        <div class="posting-categories"><div class="location">  Padded Location  </div></div>
        <div class="posting-page"><div class="content">  Padded Description  </div></div>
      </body></html>
    `);

    const result = extractLever(doc);

    expect(result.title).toBe('Padded Title');
    expect(result.company).toBe('Padded Company');
    expect(result.location).toBe('Padded Location');
    expect(result.description).toBe('Padded Description');
  });
});
