import { useState, useRef, useCallback, useEffect } from 'react';
import type { ExtractedJobDetails } from '@/types/extract';

interface UseExtractJobReturn {
  extractedJob: ExtractedJobDetails | null;
  isExtracting: boolean;
  error: string | null;
  startExtraction: () => void;
  cancelExtraction: () => void;
  resetExtraction: () => void;
}

const MOCK_DELAY = 2000;
const MOCK_JOB: ExtractedJobDetails = {
  title: 'Senior Frontend Engineer',
  company: 'Acme Corp',
  location: 'Tel Aviv, Israel',
  skills: ['React', 'TypeScript', 'Node.js', 'GraphQL', 'AWS', 'Docker', 'Kubernetes'],
  description: 'We are looking for a Senior Frontend Engineer...',
};

export function useExtractJob(): UseExtractJobReturn {
  const [extractedJob, setExtractedJob] = useState<ExtractedJobDetails | null>(null);
  const [isExtracting, setIsExtracting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const cancelledRef = useRef(false);

  const clearPendingTimeout = useCallback(() => {
    if (timeoutRef.current !== null) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
  }, []);

  const startExtraction = useCallback(() => {
    if (isExtracting) return;

    cancelledRef.current = false;
    setIsExtracting(true);
    setError(null);
    setExtractedJob(null);

    timeoutRef.current = setTimeout(() => {
      // TODO: validate with isExtractedJobDetails() when real messaging is wired
      if (!cancelledRef.current) {
        setExtractedJob(MOCK_JOB);
        setIsExtracting(false);
      }
      timeoutRef.current = null;
    }, MOCK_DELAY);
  }, [isExtracting]);

  const cancelExtraction = useCallback(() => {
    cancelledRef.current = true;
    clearPendingTimeout();
    setIsExtracting(false);
  }, [clearPendingTimeout]);

  const resetExtraction = useCallback(() => {
    setExtractedJob(null);
    setError(null);
  }, []);

  useEffect(() => {
    return () => {
      cancelledRef.current = true;
      clearPendingTimeout();
    };
  }, [clearPendingTimeout]);

  return {
    extractedJob,
    isExtracting,
    error,
    startExtraction,
    cancelExtraction,
    resetExtraction,
  };
}
