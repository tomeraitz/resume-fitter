import { storage } from 'wxt/utils/storage';
import type { PipelineSession, StepsRecord } from '../../types/pipeline';

const EMPTY_STEPS: StepsRecord = {
  'hiring-manager': { step: 'hiring-manager', status: 'pending' },
  'rewrite-resume': { step: 'rewrite-resume', status: 'pending' },
  'ats-scanner': { step: 'ats-scanner', status: 'pending' },
  'verifier': { step: 'verifier', status: 'pending' },
};

export const EMPTY_SESSION: PipelineSession = {
  status: 'idle',
  extractionStatus: 'idle',
  jobDescription: '',
  steps: EMPTY_STEPS,
  extractedJob: undefined,
  generatedCv: null,
};

export const pipelineSession = storage.defineItem<PipelineSession>(
  'session:pipelineSession',
  { fallback: EMPTY_SESSION },
);
