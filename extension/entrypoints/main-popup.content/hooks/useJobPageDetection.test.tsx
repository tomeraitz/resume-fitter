import { describe, it, expect, afterEach } from 'vitest';
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

  describe('blocked (non-job) pages return isJobPage=false', () => {
    it.each([
      ['YouTube', 'https://www.youtube.com/watch?v=abc'],
      ['Google search', 'https://www.google.com/search?q=jobs'],
      ['Facebook', 'https://www.facebook.com/somepage'],
      ['X / Twitter', 'https://x.com/user/status/123'],
      ['Instagram', 'https://www.instagram.com/p/abc'],
      ['Reddit', 'https://www.reddit.com/r/jobs'],
      ['Wikipedia', 'https://en.wikipedia.org/wiki/Job'],
      ['chrome:// page', 'chrome://extensions'],
      ['chrome-extension:// page', 'chrome-extension://abc/popup.html'],
      ['about:blank', 'about:blank'],
    ])('%s — %s', (_label, url) => {
      setWindowLocation(url);
      const { result } = renderHook(() => useJobPageDetection());

      expect(result.current.isJobPage).toBe(false);
      expect(result.current.isDetecting).toBe(false);
    });
  });

  describe('allowed (potential job) pages return isJobPage=true', () => {
    it.each([
      ['LinkedIn job', 'https://www.linkedin.com/jobs/view/123'],
      ['Indeed job', 'https://www.indeed.com/viewjob?jk=abc'],
      ['Greenhouse board', 'https://boards.greenhouse.io/company/jobs/123'],
      ['Company careers', 'https://careers.somecompany.com/job/456'],
      ['Localhost dev', 'http://localhost:3006/test-comp/jobs/123'],
    ])('%s — %s', (_label, url) => {
      setWindowLocation(url);
      const { result } = renderHook(() => useJobPageDetection());

      expect(result.current.isJobPage).toBe(true);
      expect(result.current.isDetecting).toBe(false);
    });
  });

  it('isDetecting is always false (synchronous blocklist)', () => {
    setWindowLocation('https://www.linkedin.com/jobs/view/123');
    const { result } = renderHook(() => useJobPageDetection());

    expect(result.current.isDetecting).toBe(false);
  });
});
