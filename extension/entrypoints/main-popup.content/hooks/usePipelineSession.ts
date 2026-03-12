import { useEffect, useState } from 'react';
import { pipelineSession, clearPipelineSession } from '../../../services/storage';
import type { PipelineSession } from '../../../types/pipeline';

export function usePipelineSession() {
  const [session, setSession] = useState<PipelineSession | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let initialized = false;
    let cancelled = false;

    const unwatchPromise = pipelineSession.watch((newVal) => {
      initialized = true;
      if (!cancelled) {
        setSession(newVal);
        setIsLoading(false);
      }
    });

    pipelineSession.getValue().then((val) => {
      if (!initialized && !cancelled) {
        setSession(val);
        setIsLoading(false);
      }
    });

    return () => {
      cancelled = true;
      unwatchPromise.then((unwatch) => unwatch()).catch(() => {});
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
