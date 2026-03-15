import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { renderHook } from '@testing-library/react';
import { useJobPageDetection } from './useJobPageDetection';

const originalLocation = window.location;

function setWindowLocation(href: string) {
  Object.defineProperty(window, 'location', {
    value: { href },
    writable: true,
    configurable: true,
  });
}

describe('useJobPageDetection', () => {
  afterEach(() => {
    Object.defineProperty(window, 'location', {
      value: originalLocation,
      writable: true,
      configurable: true,
    });
  });

  it('returns isJobPage true for LinkedIn job URL', () => {
    setWindowLocation('https://www.linkedin.com/jobs/view/12345');

    const { result } = renderHook(() => useJobPageDetection());

    expect(result.current.isJobPage).toBe(true);
    expect(result.current.isDetecting).toBe(false);
  });

  it('returns isJobPage true for Indeed job URL', () => {
    setWindowLocation('https://www.indeed.com/viewjob?jk=123');

    const { result } = renderHook(() => useJobPageDetection());

    expect(result.current.isJobPage).toBe(true);
    expect(result.current.isDetecting).toBe(false);
  });

  it('returns isJobPage false for dev.to', () => {
    setWindowLocation('https://dev.to');

    const { result } = renderHook(() => useJobPageDetection());

    expect(result.current.isJobPage).toBe(false);
    expect(result.current.isDetecting).toBe(false);
  });

  it('returns isJobPage false for google.com', () => {
    setWindowLocation('https://google.com');

    const { result } = renderHook(() => useJobPageDetection());

    expect(result.current.isJobPage).toBe(false);
    expect(result.current.isDetecting).toBe(false);
  });

  it('isDetecting is always false (synchronous detection)', () => {
    setWindowLocation('https://www.linkedin.com/jobs/view/12345');

    const { result } = renderHook(() => useJobPageDetection());

    expect(result.current.isDetecting).toBe(false);
  });

  it('returns isJobPage true for generic /jobs/ URL', () => {
    setWindowLocation('https://example.com/jobs/software-engineer');

    const { result } = renderHook(() => useJobPageDetection());

    expect(result.current.isJobPage).toBe(true);
    expect(result.current.isDetecting).toBe(false);
  });
});
