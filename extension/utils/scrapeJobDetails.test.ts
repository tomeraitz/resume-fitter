import { describe, it, expect, vi, type Mock } from 'vitest';
import type { ExtractedJobDetails } from '@/types/extract';

vi.mock('./extractors/greenhouse', () => ({
  extractGreenhouse: vi.fn(() => ({})),
}));
vi.mock('./extractors/linkedin', () => ({
  extractLinkedIn: vi.fn(() => ({})),
}));
vi.mock('./extractors/indeed', () => ({
  extractIndeed: vi.fn(() => ({})),
}));
vi.mock('./extractors/lever', () => ({
  extractLever: vi.fn(() => ({})),
}));
vi.mock('./extractors/generic', () => ({
  extractGeneric: vi.fn(() => ({})),
}));

import { scrapeJobDetails } from './scrapeJobDetails';
import { extractGreenhouse } from './extractors/greenhouse';
import { extractLinkedIn } from './extractors/linkedin';
import { extractIndeed } from './extractors/indeed';
import { extractLever } from './extractors/lever';
import { extractGeneric } from './extractors/generic';

const doc = document;

function mockReturn(
  fn: Mock,
  partial: Partial<ExtractedJobDetails>,
): void {
  fn.mockReturnValue(partial);
}

describe('scrapeJobDetails', () => {
  describe('URL dispatching', () => {
    it('dispatches greenhouse URLs to greenhouse extractor', () => {
      scrapeJobDetails(doc, 'https://boards.greenhouse.io/acme/jobs/123');
      expect(extractGreenhouse).toHaveBeenCalledWith(doc);
      expect(extractGeneric).not.toHaveBeenCalled();
    });

    it('dispatches linkedin URLs to linkedin extractor', () => {
      scrapeJobDetails(doc, 'https://www.linkedin.com/jobs/view/12345');
      expect(extractLinkedIn).toHaveBeenCalledWith(doc);
      expect(extractGeneric).not.toHaveBeenCalled();
    });

    it('dispatches indeed URLs to indeed extractor', () => {
      scrapeJobDetails(doc, 'https://www.indeed.com/viewjob?jk=abc123');
      expect(extractIndeed).toHaveBeenCalledWith(doc);
      expect(extractGeneric).not.toHaveBeenCalled();
    });

    it('dispatches lever URLs to lever extractor', () => {
      scrapeJobDetails(doc, 'https://jobs.lever.co/acme/abc-123');
      expect(extractLever).toHaveBeenCalledWith(doc);
      expect(extractGeneric).not.toHaveBeenCalled();
    });

    it('falls back to generic extractor for unknown URLs', () => {
      scrapeJobDetails(doc, 'https://example.com/careers/engineer');
      expect(extractGeneric).toHaveBeenCalledWith(doc);
    });
  });

  describe('return shape', () => {
    it('always has all required fields', () => {
      const result = scrapeJobDetails(doc, 'https://example.com/job');
      expect(result).toHaveProperty('title');
      expect(result).toHaveProperty('company');
      expect(result).toHaveProperty('location');
      expect(result).toHaveProperty('skills');
      expect(result).toHaveProperty('description');
    });

    it('defaults missing fields to empty string / empty array', () => {
      (extractGeneric as Mock).mockReturnValue({});
      const result = scrapeJobDetails(doc, 'https://example.com/job');
      expect(result.title).toBe('');
      expect(result.company).toBe('');
      expect(result.location).toBe('');
      expect(result.skills).toEqual([]);
      expect(result.description).toBe('');
    });
  });

  describe('sanitisation', () => {
    it('trims whitespace from string fields', () => {
      mockReturn(extractGeneric as Mock, {
        title: '  Senior Engineer  ',
        company: '\tAcme Corp\n',
        location: '  Remote  ',
        description: '  Build things  ',
      });
      const result = scrapeJobDetails(doc, 'https://example.com/job');
      expect(result.title).toBe('Senior Engineer');
      expect(result.company).toBe('Acme Corp');
      expect(result.location).toBe('Remote');
      expect(result.description).toBe('Build things');
    });

    it('caps string fields at 200 characters', () => {
      const longStr = 'a'.repeat(250);
      mockReturn(extractGeneric as Mock, {
        title: longStr,
        company: longStr,
        location: longStr,
      });
      const result = scrapeJobDetails(doc, 'https://example.com/job');
      expect(result.title).toHaveLength(200);
      expect(result.company).toHaveLength(200);
      expect(result.location).toHaveLength(200);
    });

    it('caps description at 50,000 characters', () => {
      mockReturn(extractGeneric as Mock, {
        description: 'x'.repeat(60_000),
      });
      const result = scrapeJobDetails(doc, 'https://example.com/job');
      expect(result.description).toHaveLength(50_000);
    });

    it('caps skills array at 50 items', () => {
      const skills = Array.from({ length: 80 }, (_, i) => `skill-${i}`);
      mockReturn(extractGeneric as Mock, { skills });
      const result = scrapeJobDetails(doc, 'https://example.com/job');
      expect(result.skills).toHaveLength(50);
      expect(result.skills[0]).toBe('skill-0');
      expect(result.skills[49]).toBe('skill-49');
    });
  });
});
