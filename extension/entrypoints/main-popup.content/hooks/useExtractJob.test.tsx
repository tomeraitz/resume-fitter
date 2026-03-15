import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useExtractJob } from './useExtractJob';
import type { ExtractedJobDetails } from '@/types/extract';

vi.mock('@/utils/scrapeJobDetails', () => ({
  scrapeJobDetails: vi.fn(),
}));

import { scrapeJobDetails } from '@/utils/scrapeJobDetails';

const mockScrape = vi.mocked(scrapeJobDetails);

const VALID_JOB: ExtractedJobDetails = {
  title: 'Senior Frontend Engineer',
  company: 'Acme Corp',
  location: 'Remote',
  skills: ['React', 'TypeScript'],
  description: 'Build great UIs with React and TypeScript.',
};

describe('useExtractJob', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    mockScrape.mockClear();
    mockScrape.mockReturnValue(VALID_JOB);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  /** Flush the `await new Promise(r => setTimeout(r, 0))` inside startExtraction */
  async function flushExtraction() {
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
  }

  it('returns correct initial state', () => {
    const { result } = renderHook(() => useExtractJob());

    expect(result.current.extractedJob).toBeNull();
    expect(result.current.isExtracting).toBe(false);
    expect(result.current.error).toBeNull();
  });

  it('sets isExtracting to true when startExtraction is called', async () => {
    const { result } = renderHook(() => useExtractJob());

    act(() => {
      result.current.startExtraction();
    });

    expect(result.current.isExtracting).toBe(true);
    expect(result.current.extractedJob).toBeNull();

    await flushExtraction();
  });

  it('populates extractedJob after scraping resolves', async () => {
    const { result } = renderHook(() => useExtractJob());

    act(() => {
      result.current.startExtraction();
    });

    expect(result.current.isExtracting).toBe(true);

    await flushExtraction();

    expect(result.current.isExtracting).toBe(false);
    expect(result.current.extractedJob).not.toBeNull();
    expect(result.current.extractedJob!.title).toBe('Senior Frontend Engineer');
    expect(result.current.extractedJob!.company).toBe('Acme Corp');
    expect(result.current.extractedJob!.skills).toContain('React');
  });

  it('cancelExtraction resets isExtracting and leaves extractedJob null', async () => {
    const { result } = renderHook(() => useExtractJob());

    act(() => {
      result.current.startExtraction();
    });

    expect(result.current.isExtracting).toBe(true);

    act(() => {
      result.current.cancelExtraction();
    });

    expect(result.current.isExtracting).toBe(false);
    expect(result.current.extractedJob).toBeNull();

    await flushExtraction();
  });

  it('resetExtraction clears extractedJob back to null', async () => {
    const { result } = renderHook(() => useExtractJob());

    act(() => {
      result.current.startExtraction();
    });

    await flushExtraction();

    expect(result.current.extractedJob).not.toBeNull();

    act(() => {
      result.current.resetExtraction();
    });

    expect(result.current.extractedJob).toBeNull();
    expect(result.current.error).toBeNull();
  });

  it('calling startExtraction while already extracting is a no-op', async () => {
    const { result } = renderHook(() => useExtractJob());

    // Start extraction and flush so it completes and re-renders with isExtracting=false
    act(() => {
      result.current.startExtraction();
    });

    await flushExtraction();

    expect(result.current.isExtracting).toBe(false);
    expect(result.current.extractedJob).not.toBeNull();
    expect(mockScrape).toHaveBeenCalledTimes(1);

    // Start again, this time do NOT flush — the hook is in isExtracting=true
    act(() => {
      result.current.startExtraction();
    });

    expect(result.current.isExtracting).toBe(true);

    // A second call while isExtracting is true should be a no-op
    act(() => {
      result.current.startExtraction();
    });

    expect(result.current.isExtracting).toBe(true);

    await flushExtraction();

    expect(result.current.isExtracting).toBe(false);
    expect(result.current.extractedJob!.title).toBe('Senior Frontend Engineer');

    // Only two scrape calls total: first extraction + second extraction (third was no-op)
    expect(mockScrape).toHaveBeenCalledTimes(2);
  });

  it('race condition guard: cancel then flush does not populate extractedJob', async () => {
    const { result } = renderHook(() => useExtractJob());

    act(() => {
      result.current.startExtraction();
    });

    expect(result.current.isExtracting).toBe(true);

    act(() => {
      result.current.cancelExtraction();
    });

    expect(result.current.isExtracting).toBe(false);

    // Flush the microtask — stale callback should not fire
    await flushExtraction();

    expect(result.current.extractedJob).toBeNull();
    expect(result.current.isExtracting).toBe(false);
  });

  it('sets error state when scrapeJobDetails throws', async () => {
    mockScrape.mockImplementation(() => {
      throw new Error('DOM access denied');
    });

    const { result } = renderHook(() => useExtractJob());

    act(() => {
      result.current.startExtraction();
    });

    await flushExtraction();

    expect(result.current.isExtracting).toBe(false);
    expect(result.current.extractedJob).toBeNull();
    expect(result.current.error).toBe('DOM access denied');
  });

  it('sets error state when scrapeJobDetails returns invalid data (empty title)', async () => {
    mockScrape.mockReturnValue({
      ...VALID_JOB,
      title: '',
    });

    const { result } = renderHook(() => useExtractJob());

    act(() => {
      result.current.startExtraction();
    });

    await flushExtraction();

    expect(result.current.isExtracting).toBe(false);
    expect(result.current.extractedJob).toBeNull();
    expect(result.current.error).toBe(
      'Could not extract job details from this page',
    );
  });
});
