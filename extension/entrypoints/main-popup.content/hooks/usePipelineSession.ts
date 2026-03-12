import { useEffect, useState } from 'react';
import { pipelineSession, clearPipelineSession } from '../../../services/storage';
import type { PipelineSession } from '../../../types/pipeline';

export function usePipelineSession() {
  const [session, setSession] = useState<PipelineSession | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let initialized = false;
    let cancelled = false;
    let unwatchFn: (() => void) | undefined;

    async function init() {
      // Retry loop: session storage may not be accessible until the background
      // script calls setAccessLevel('TRUSTED_AND_UNTRUSTED_CONTEXTS').
      const MAX_RETRIES = 5;
      const RETRY_DELAY = 200;

      for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
        try {
          unwatchFn = pipelineSession.watch((newVal) => {
            initialized = true;
            if (!cancelled) {
              setSession(newVal);
              setIsLoading(false);
            }
          });

          const val = await pipelineSession.getValue();
          if (!initialized && !cancelled) {
            setSession(val);
            setIsLoading(false);
          }
          return;
        } catch {
          if (cancelled) return;
          await new Promise((r) => setTimeout(r, RETRY_DELAY));
        }
      }

      // All retries exhausted — fall back to idle state
      if (!cancelled) setIsLoading(false);
    }

    init();

    return () => {
      cancelled = true;
      unwatchFn?.();
    };
  }, []);

  const cancel = async () => {
    await clearPipelineSession();
  };

  const download = async () => {
    const current = await pipelineSession.getValue();
    if (current?.generatedCv) {
      await clearPipelineSession();
      return current.generatedCv;
    }
    return null;
  };

  return { session, isLoading, cancel, download };
}
