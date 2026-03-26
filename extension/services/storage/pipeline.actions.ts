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

export async function setGeneratedCv(cv: string): Promise<void> {
  console.log(`[pipeline] setGeneratedCv called — cvLen=${cv.length}`);
  try {
    await mutatePipelineSession((session) => ({
      ...session,
      generatedCv: cv,
      status: 'completed',
    }));
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
