import type { ExtractedJobDetails } from './extract';

type PipelineStatus = 'idle' | 'running' | 'completed' | 'error';

type ExtractionStatus = 'idle' | 'extracting' | 'done' | 'error';

type AgentStep = 'hiring-manager' | 'rewrite-resume' | 'ats-scanner' | 'verifier';

type StepStatus = 'pending' | 'running' | 'completed' | 'error';

type AgentResultData =
  | { step: 'hiring-manager'; matchScore: number; missingKeywords: string[]; summary: string; cvLanguage: string }
  | { step: 'rewrite-resume'; updatedCvHtml: string; keywordsNotAdded: { keyword: string; reason: string }[] }
  | { step: 'verifier'; verifiedCv: string; flaggedClaims: string[] }
  | { step: 'ats-scanner'; atsScore: number; problemAreas: string[] };

interface AgentResult {
  step: AgentStep;
  status: StepStatus;
  data?: AgentResultData;
  error?: string;
}

type StepsRecord = Record<AgentStep, AgentResult>;

interface PipelineSession {
  status: PipelineStatus;
  extractionStatus: ExtractionStatus;
  jobDescription: string;
  jobTitle?: string;
  jobCompany?: string;
  steps: StepsRecord;
  extractedJob?: ExtractedJobDetails;
  generatedCv: string | null;
}

interface PipelineResults {
  atsScore: number;
  matchScore: number;
  flaggedClaims: string[];
  finalCv: string;
}

export type {
  PipelineStatus,
  ExtractionStatus,
  AgentStep,
  StepStatus,
  AgentResultData,
  AgentResult,
  StepsRecord,
  PipelineSession,
  PipelineResults,
};
