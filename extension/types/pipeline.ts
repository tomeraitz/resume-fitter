import type { ExtractedJobDetails } from './extract';

type PipelineStatus = 'idle' | 'running' | 'completed' | 'error';

type AgentStep = 'hiring-manager' | 'rewrite-resume' | 'ats-scanner' | 'verifier';

type StepStatus = 'pending' | 'running' | 'completed' | 'error';

type AgentResultData =
  | { step: 'hiring-manager'; matchScore: number; keywords: string[] }
  | { step: 'rewrite-resume'; rewrittenCv: string }
  | { step: 'ats-scanner'; atsScore: number; issues: string[] }
  | { step: 'verifier'; flaggedClaims: string[]; verified: boolean };

interface AgentResult {
  step: AgentStep;
  status: StepStatus;
  data?: AgentResultData;
  error?: string;
}

type StepsRecord = Record<AgentStep, AgentResult>;

interface PipelineSession {
  status: PipelineStatus;
  jobDescription: string;
  jobTitle?: string;
  jobCompany?: string;
  steps: StepsRecord;
  extractedJob?: ExtractedJobDetails;
  generatedCv: string | null;
}

export type {
  PipelineStatus,
  AgentStep,
  StepStatus,
  AgentResultData,
  AgentResult,
  StepsRecord,
  PipelineSession,
};
