import type { AgentStep, StepStatus, AgentResultData, PipelineSession, ExtractionStatus } from '../../types/pipeline';
import type { ExtractedJobDetails } from '../../types/extract';
import { pipelineSession, EMPTY_SESSION } from './pipeline.storage';

let mutationQueue = Promise.resolve();

async function mutatePipelineSession(
  mutator: (session: PipelineSession) => PipelineSession,
): Promise<void> {
  mutationQueue = mutationQueue.then(async () => {
    const session = await pipelineSession.getValue();
    const updated = mutator(session);
    try {
      await pipelineSession.setValue(updated);
    } catch (err) {
      console.error('[pipeline] mutatePipelineSession setValue FAILED:', err, 'Attempted status:', updated.status);
      throw err;
    }
  });
  await mutationQueue;
}

export async function clearPipelineSession(): Promise<void> {
  await pipelineSession.setValue(EMPTY_SESSION);
}

export async function updateStepResult(
  step: AgentStep,
  status: StepStatus,
  data?: AgentResultData,
): Promise<void> {
  await mutatePipelineSession((session) => ({
    ...session,
    steps: {
      ...session.steps,
      [step]: { step, status, data },
    },
  }));
}

export async function setPipelineStatus(
  status: PipelineSession['status'],
): Promise<void> {
  console.log(`[pipeline] setPipelineStatus → "${status}"`, new Error().stack);
  await mutatePipelineSession((session) => ({
    ...session,
    status,
  }));
}

export async function setExtractionStatus(status: ExtractionStatus): Promise<void> {
  await mutatePipelineSession((session) => ({
    ...session,
    extractionStatus: status,
  }));
}

export async function setExtractedJob(job: ExtractedJobDetails | null): Promise<void> {
  await mutatePipelineSession((session) => ({
    ...session,
    extractedJob: job ?? undefined,
  }));
}

/**
 * Strip large intermediate HTML from step results to reduce session size.
 * The UI only needs matchScore, atsScore, and flaggedClaims — not the
 * intermediate CV HTML blobs stored by rewrite-resume and verifier.
 */
function stripIntermediateHtml(session: PipelineSession): PipelineSession {
  const steps = { ...session.steps };

  const rewrite = steps['rewrite-resume'];
  if (rewrite.data && 'updatedCvHtml' in rewrite.data) {
    steps['rewrite-resume'] = {
      ...rewrite,
      data: { ...rewrite.data, updatedCvHtml: '' },
    };
  }

  const ver = steps['verifier'];
  if (ver.data && 'verifiedCv' in ver.data) {
    steps['verifier'] = {
      ...ver,
      data: { ...ver.data, verifiedCv: '' },
    };
  }

  return { ...session, steps };
}

export async function setGeneratedCv(cv: string): Promise<void> {
  console.log(`[pipeline] setGeneratedCv called — cvLen=${cv.length}`);
  try {
    // Strip intermediate HTML from steps to stay within ~1 MB storage.session quota.
    // The session accumulates updatedCvHtml from rewrite-resume and verifiedCv from
    // verifier — plus the final generatedCv. Without stripping, the total easily
    // exceeds the quota and the write is silently dropped.
    await mutatePipelineSession((session) => {
      const stripped = stripIntermediateHtml(session);
      return {
        ...stripped,
        generatedCv: cv,
        status: 'completed' as const,
      };
    });
    // Verify the write actually persisted (storage.session silently drops
    // writes that exceed the ~1 MB quota)
    const verify = await pipelineSession.getValue();
    if (verify.status !== 'completed' || !verify.generatedCv) {
      console.error(
        '[pipeline] setGeneratedCv FAILED — write was silently dropped! ' +
        'Likely exceeded storage.session quota. ' +
        `Session status after write: "${verify.status}", generatedCv present: ${!!verify.generatedCv}. ` +
        `Attempted CV size: ${cv.length} chars, ~${Math.round(cv.length * 2 / 1024)} KB.`
      );
    } else {
      console.log(`[pipeline] setGeneratedCv verified OK — status="${verify.status}"`);
    }
  } catch (err) {
    console.error('[pipeline] setGeneratedCv threw:', err);
    throw err;
  }
}
