import { useState } from 'react';

const JOB_PAGE_PATTERNS = [
  /linkedin\.com\/jobs\//i,
  /indeed\.com\/(viewjob|jobs)/i,
  /glassdoor\.com\/(job-listing|Job)\//i,
  /greenhouse\.io\/.*\/jobs\//i,
  /lever\.co\//i,
  /workday\.com\/.*\/job\//i,
  /careers\./i,
  /\/jobs?\//i,
];

interface UseJobPageDetectionReturn {
  isJobPage: boolean;
  isDetecting: boolean;
}

export function useJobPageDetection(): UseJobPageDetectionReturn {
  const [isJobPage] = useState(() =>
    JOB_PAGE_PATTERNS.some((pattern) => pattern.test(window.location.href))
  );
  return { isJobPage, isDetecting: false };
}
