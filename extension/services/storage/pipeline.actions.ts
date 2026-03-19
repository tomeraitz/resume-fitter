import type { AgentStep, StepStatus, AgentResultData, PipelineSession, ExtractionStatus } from '../../types/pipeline';
import type { ExtractedJobDetails } from '../../types/extract';
import { pipelineSession, EMPTY_SESSION } from './pipeline.storage';

let mutationQueue = Promise.resolve();

async function mutatePipelineSession(
  mutator: (session: PipelineSession) => PipelineSession,
): Promise<void> {
  mutationQueue = mutationQueue.then(async () => {
    const session = await pipelineSession.getValue();
    await pipelineSession.setValue(mutator(session));
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
  await mutatePipelineSession((session) => ({
    ...session,
    generatedCv: cv,
    status: 'completed',
  }));
}
