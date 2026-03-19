import type { ExtractedJobDetails } from './extract';

interface RunPipelineMessage {
  type: 'run-pipeline';
  jobDescription: string;
  jobTitle?: string;
  jobCompany?: string;
}

interface CancelPipelineMessage {
  type: 'cancel-pipeline';
}

interface ExtractJobMessage {
  type: 'extract-job';
  html: string;
}

interface OpenCvPreviewMessage {
  type: 'open-cv-preview';
}

type ExtractJobResponse =
  | { success: true; job: ExtractedJobDetails }
  | { success: false; error: string; notJobPage?: boolean };

type ExtensionMessage =
  | RunPipelineMessage
  | CancelPipelineMessage
  | ExtractJobMessage
  | OpenCvPreviewMessage;

export type {
  RunPipelineMessage,
  CancelPipelineMessage,
  ExtractJobMessage,
  OpenCvPreviewMessage,
  ExtractJobResponse,
  ExtensionMessage,
};
