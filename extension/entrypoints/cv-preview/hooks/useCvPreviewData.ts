import { useEffect, useState } from 'react';
import { pipelineSession } from '../../../services/storage';
import type { PipelineSession } from '../../../types/pipeline';

export interface CvPreviewData {
  finalCv: string;
  jobTitle: string;
  jobCompany: string;
  atsScore: number;
  matchScore: number;
}

type CvPreviewState =
  | { status: 'loading' }
  | { status: 'ready'; data: CvPreviewData }
  | { status: 'empty' };

export function useCvPreviewData(): CvPreviewState {
  const [state, setState] = useState<CvPreviewState>({ status: 'loading' });

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        const session = await pipelineSession.getValue();
        if (cancelled) return;

        const data = derivePreviewData(session);
        setState(data ? { status: 'ready', data } : { status: 'empty' });
      } catch {
        if (!cancelled) setState({ status: 'empty' });
      }
    }

    load();

    const unwatch = pipelineSession.watch((newVal) => {
      if (cancelled) return;
      const data = derivePreviewData(newVal);
      setState(data ? { status: 'ready', data } : { status: 'empty' });
    });

    return () => {
      cancelled = true;
      unwatch();
    };
  }, []);

  return state;
}

function derivePreviewData(session: PipelineSession): CvPreviewData | null {
  if (session.status !== 'completed' || !session.generatedCv) return null;

  const hmData = session.steps['hiring-manager'].data;
  const atsData = session.steps['ats-scanner'].data;

  const matchScore =
    hmData?.step === 'hiring-manager' ? hmData.matchScore : 0;
  const atsScore =
    atsData?.step === 'ats-scanner' ? atsData.atsScore : 0;

  return {
    finalCv: session.generatedCv,
    jobTitle: session.jobTitle ?? 'Untitled Position',
    jobCompany: session.jobCompany ?? '',
    atsScore,
    matchScore,
  };
}
