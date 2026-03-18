import { useState, useRef, useCallback, useEffect } from 'react';
import type { ExtractedJobDetails } from '@/types/extract';
import type { ExtractJobResponse } from '@/types/messages';
import { setExtractedJob } from '../../../services/storage';

interface UseExtractJobReturn {
  extractedJob: ExtractedJobDetails | null;
  isExtracting: boolean;
  error: string | null;
  startExtraction: () => void;
  cancelExtraction: () => void;
  resetExtraction: () => void;
}

export function useExtractJob(): UseExtractJobReturn {
  const [extractedJob, setExtractedJobState] = useState<ExtractedJobDetails | null>(null);
  const [isExtracting, setIsExtracting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const cancelledRef = useRef(false);

  const startExtraction = useCallback(async () => {
    if (isExtracting) return;

    cancelledRef.current = false;
    setIsExtracting(true);
    setError(null);
    setExtractedJobState(null);

    try {
      // Small yield to let React render the loading state
      await new Promise((r) => setTimeout(r, 0));

      if (cancelledRef.current) return;

      // Grab page HTML, strip heavy non-content tags, and truncate
      let html = document.documentElement.outerHTML;
      html = html.replace(/<(script|style|svg)\b[^>]*>[\s\S]*?<\/\1>/gi, '');
      html = html.slice(0, 500_000);

      const response: ExtractJobResponse = await browser.runtime.sendMessage({
        type: 'extract-job',
        html,
      });

      if (cancelledRef.current) return;

      if (response.success) {
        setExtractedJobState(response.job);
        await setExtractedJob(response.job);
      } else if (response.notJobPage) {
        setError("This page doesn't appear to be a job posting");
      } else {
        setError(response.error);
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
    setExtractedJobState(null);
    setError(null);
    setExtractedJob(null);
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
