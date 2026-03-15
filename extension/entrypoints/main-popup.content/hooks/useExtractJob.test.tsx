import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useExtractJob } from './useExtractJob';

describe('useExtractJob', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('returns correct initial state', () => {
    const { result } = renderHook(() => useExtractJob());

    expect(result.current.extractedJob).toBeNull();
    expect(result.current.isExtracting).toBe(false);
    expect(result.current.error).toBeNull();
  });

  it('sets isExtracting to true when startExtraction is called', () => {
    const { result } = renderHook(() => useExtractJob());

    act(() => {
      result.current.startExtraction();
    });

    expect(result.current.isExtracting).toBe(true);
    expect(result.current.extractedJob).toBeNull();
  });

  it('populates extractedJob after mock delay resolves', () => {
    const { result } = renderHook(() => useExtractJob());

    act(() => {
      result.current.startExtraction();
    });

    expect(result.current.isExtracting).toBe(true);

    act(() => {
      vi.advanceTimersByTime(2000);
    });

    expect(result.current.isExtracting).toBe(false);
    expect(result.current.extractedJob).not.toBeNull();
    expect(result.current.extractedJob!.title).toBe('Senior Frontend Engineer');
    expect(result.current.extractedJob!.company).toBe('Acme Corp');
    expect(result.current.extractedJob!.skills).toContain('React');
  });

  it('cancelExtraction resets isExtracting and leaves extractedJob null', () => {
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
  });

  it('resetExtraction clears extractedJob back to null', () => {
    const { result } = renderHook(() => useExtractJob());

    act(() => {
      result.current.startExtraction();
    });

    act(() => {
      vi.advanceTimersByTime(2000);
    });

    expect(result.current.extractedJob).not.toBeNull();

    act(() => {
      result.current.resetExtraction();
    });

    expect(result.current.extractedJob).toBeNull();
    expect(result.current.error).toBeNull();
  });

  it('calling startExtraction while already extracting is a no-op', () => {
    const { result } = renderHook(() => useExtractJob());

    act(() => {
      result.current.startExtraction();
    });

    expect(result.current.isExtracting).toBe(true);

    // Call again — should be a no-op
    act(() => {
      result.current.startExtraction();
    });

    expect(result.current.isExtracting).toBe(true);

    // Only one timer should be pending; advancing once should resolve
    act(() => {
      vi.advanceTimersByTime(2000);
    });

    expect(result.current.isExtracting).toBe(false);
    expect(result.current.extractedJob).not.toBeNull();

    // No second timer fires
    act(() => {
      vi.advanceTimersByTime(2000);
    });

    // State unchanged — still has the single extraction result
    expect(result.current.extractedJob!.title).toBe('Senior Frontend Engineer');
  });

  it('race condition guard: cancel then advance timers does not populate extractedJob', () => {
    const { result } = renderHook(() => useExtractJob());

    act(() => {
      result.current.startExtraction();
    });

    expect(result.current.isExtracting).toBe(true);

    act(() => {
      result.current.cancelExtraction();
    });

    expect(result.current.isExtracting).toBe(false);

    // Advance timers past the mock delay — stale callback should not fire
    act(() => {
      vi.advanceTimersByTime(2000);
    });

    expect(result.current.extractedJob).toBeNull();
    expect(result.current.isExtracting).toBe(false);
  });
});
