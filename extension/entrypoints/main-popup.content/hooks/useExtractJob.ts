import { useState, useRef, useCallback, useEffect } from 'react';
import type { ExtractedJobDetails } from '@/types/extract';
import { scrapeJobDetails } from '@/utils/scrapeJobDetails';
import { isExtractedJobDetails } from '@/types/extract';

interface UseExtractJobReturn {
  extractedJob: ExtractedJobDetails | null;
  isExtracting: boolean;
  error: string | null;
  startExtraction: () => void;
  cancelExtraction: () => void;
  resetExtraction: () => void;
}

export function useExtractJob(): UseExtractJobReturn {
  const [extractedJob, setExtractedJob] = useState<ExtractedJobDetails | null>(null);
  const [isExtracting, setIsExtracting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const cancelledRef = useRef(false);

  const startExtraction = useCallback(async () => {
    if (isExtracting) return;

    cancelledRef.current = false;
    setIsExtracting(true);
    setError(null);
    setExtractedJob(null);

    try {
      // Small yield to let React render the loading state
      await new Promise((r) => setTimeout(r, 0));

      if (cancelledRef.current) return;

      const result = scrapeJobDetails(document, window.location.href);

      if (cancelledRef.current) return;

      if (isExtractedJobDetails(result) && result.title !== '') {
        setExtractedJob(result);
      } else {
        setError('Could not extract job details from this page');
      }
    } catch (err) {
      if (!cancelledRef.current) {
        setError(err instanceof Error ? err.message : 'Extraction failed');
      }
    } finally {
      if (!cancelledRef.current) {
        setIsExtracting(false);
      }
    }
  }, [isExtracting]);

  const cancelExtraction = useCallback(() => {
    cancelledRef.current = true;
    setIsExtracting(false);
  }, []);

  const resetExtraction = useCallback(() => {
    setExtractedJob(null);
    setError(null);
  }, []);

  useEffect(() => {
    return () => {
      cancelledRef.current = true;
    };
  }, []);

  return {
    extractedJob,
    isExtracting,
    error,
    startExtraction,
    cancelExtraction,
    resetExtraction,
  };
}
