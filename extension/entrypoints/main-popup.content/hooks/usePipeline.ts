import { useCallback, useMemo } from 'react';
import { usePipelineSession } from './usePipelineSession';
import type {
  AgentStep,
  ExtractionStatus,
  PipelineResults,
  PipelineStatus,
  StepsRecord,
} from '../../../types/pipeline';
import type { ExtractedJobDetails } from '../../../types/extract';
import { EMPTY_SESSION } from '../../../services/storage';

const STEP_ORDER: AgentStep[] = [
  'hiring-manager',
  'rewrite-resume',
  'ats-scanner',
  'verifier',
];

interface UsePipelineReturn {
  steps: StepsRecord;
  status: PipelineStatus;
  extractionStatus: ExtractionStatus;
  currentStepNumber: number;
  results: PipelineResults | null;
  error: string | null;
  isSessionLoading: boolean;
  sessionExtractedJob: ExtractedJobDetails | undefined;
  start: (jobDescription: string, jobTitle?: string, jobCompany?: string) => void;
  cancel: () => void;
}

function deriveCurrentStep(steps: StepsRecord): number {
  let completed = 0;
  for (const name of STEP_ORDER) {
    if (steps[name].status === 'completed') {
      completed++;
    }
  }
  // Current step = completed + 1, capped at total steps
  return Math.min(completed + 1, STEP_ORDER.length);
}

function deriveResults(session: typeof EMPTY_SESSION): PipelineResults | null {
  if (session.status !== 'completed' || !session.generatedCv) return null;

  const hmData = session.steps['hiring-manager'].data;
  const atsData = session.steps['ats-scanner'].data;
  const verData = session.steps['verifier'].data;

  if (
    hmData?.step !== 'hiring-manager' ||
    atsData?.step !== 'ats-scanner' ||
    verData?.step !== 'verifier'
  ) {
    return null;
  }

  return {
    matchScore: hmData.matchScore,
    atsScore: atsData.atsScore,
    flaggedClaims: verData.flaggedClaims,
    finalCv: session.generatedCv,
  };
}

function deriveError(session: typeof EMPTY_SESSION): string | null {
  if (session.status !== 'error') return null;

  for (const name of STEP_ORDER) {
    const stepError = session.steps[name].error;
    if (stepError) return stepError;
  }

  return 'Pipeline failed unexpectedly.';
}

export function usePipeline(): UsePipelineReturn {
  const { session, isLoading: isSessionLoading, cancel: clearSession } = usePipelineSession();

  const effectiveSession = session ?? EMPTY_SESSION;

  const status = effectiveSession.status;
  const extractionStatus = effectiveSession.extractionStatus;
  const steps = effectiveSession.steps;
  const sessionExtractedJob = effectiveSession.extractedJob;

  const currentStepNumber = useMemo(
    () => (status === 'running' ? deriveCurrentStep(steps) : 0),
    [status, steps],
  );

  const results = useMemo(
    () => deriveResults(effectiveSession),
    [effectiveSession],
  );

  const error = useMemo(
    () => deriveError(effectiveSession),
    [effectiveSession],
  );

  const start = useCallback(
    (jobDescription: string, jobTitle?: string, jobCompany?: string) => {
      // Guard against double-invocation while pipeline is running
      if (status === 'running') return;

      browser.runtime.sendMessage({
        type: 'run-pipeline',
        jobDescription,
        jobTitle,
        jobCompany,
      });
    },
    [status],
  );

  const cancel = useCallback(() => {
    clearSession();
  }, [clearSession]);

  return { steps, status, extractionStatus, currentStepNumber, results, error, isSessionLoading, sessionExtractedJob, start, cancel };
}
