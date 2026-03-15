import { useState } from 'react';

/** Sites that are obviously not job pages — skip the server call entirely. */
const NON_JOB_PATTERNS = [
  /^chrome:\/\//,
  /^chrome-extension:\/\//,
  /^about:/,
  /youtube\.com/i,
  /google\.com\/search/i,
  /facebook\.com/i,
  /twitter\.com|x\.com/i,
  /instagram\.com/i,
  /reddit\.com/i,
  /wikipedia\.org/i,
];

interface UseJobPageDetectionReturn {
  isJobPage: boolean;
  isDetecting: boolean;
}

/**
 * Lightweight blocklist pre-filter.
 * Returns `true` for any page not on the blocklist — the server's 422
 * handles real job-page detection if the content turns out to be irrelevant.
 */
export function useJobPageDetection(): UseJobPageDetectionReturn {
  const [isJobPage] = useState(() => {
    const url = window.location.href;
    return !NON_JOB_PATTERNS.some((p) => p.test(url));
  });

  return { isJobPage, isDetecting: false };
}
